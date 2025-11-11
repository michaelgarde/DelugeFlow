/**
 * Background Service Worker
 *
 * Handles:
 * - Service worker lifecycle (install, activate)
 * - Fetch interception for Deluge CORS handling
 * - Torrent file download interception
 * - Communication with content scripts
 */

import bencode from 'bencode';
import { Logger } from '@/lib/logger/Logger';
import { NotificationManager } from '@/lib/notifications/NotificationManager';
import { StorageManager } from '@/lib/storage/StorageManager';
import { DelugeConnection } from '@/deluge/DelugeConnection';

// Service Worker type declarations
declare const self: ServiceWorkerGlobalScope;

const logger = new Logger('Background');

// Global Deluge connection instance
let delugeConnection: DelugeConnection | null = null;

// Cache intercept setting for faster synchronous access
let interceptEnabled = true;

// Offscreen document state
let offscreenDocumentCreated = false;

/**
 * Ensure offscreen document exists
 */
async function ensureOffscreenDocument(): Promise<void> {
  if (offscreenDocumentCreated) {
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.DOM_SCRAPING], // Using DOM_SCRAPING as the closest reason
      justification: 'Make fetch requests that can be intercepted by service worker fetch handler for CORS handling',
    });
    offscreenDocumentCreated = true;
    logger.info('Offscreen document created');
  } catch (error: any) {
    // Document may already exist
    if (error.message?.includes('Only a single offscreen')) {
      offscreenDocumentCreated = true;
      logger.debug('Offscreen document already exists');
    } else {
      logger.error('Failed to create offscreen document:', error);
      throw error;
    }
  }
}

/**
 * Make a fetch request via the offscreen document
 */
export async function fetchViaOffscreen(url: string, options?: RequestInit): Promise<Response> {
  await ensureOffscreenDocument();

  return new Promise((resolve, reject) => {
    const timeoutMs = 10000; // 10 second timeout

    const timeoutId = setTimeout(() => {
      logger.debug('Offscreen fetch timed out after 10s');
      reject(new Error('Request timeout'));
    }, timeoutMs);

    // Strip out non-serializable properties from options
    const serializableOptions = options ? {
      method: options.method,
      headers: options.headers,
      body: options.body,
      credentials: options.credentials,
      mode: options.mode,
      cache: options.cache,
      redirect: options.redirect,
      referrer: options.referrer,
      integrity: options.integrity,
    } : undefined;

    chrome.runtime.sendMessage(
      {
        type: 'FETCH_REQUEST',
        url,
        options: serializableOptions,
      },
      (response) => {
        clearTimeout(timeoutId);

        if (chrome.runtime.lastError) {
          logger.error('Offscreen fetch error:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response) {
          logger.error('No response from offscreen document');
          reject(new Error('No response from offscreen document'));
          return;
        }

        if (response.error) {
          logger.error('Offscreen fetch returned error:', response.message);
          reject(new Error(response.message));
          return;
        }

        // Reconstruct Response object
        const headers = new Headers(response.headers);
        const reconstructedResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });

        resolve(reconstructedResponse);
      }
    );
  });
}

/**
 * Initialize Deluge connection
 */
async function initializeConnection(): Promise<void> {
  try {
    if (!delugeConnection) {
      logger.debug('Creating new DelugeConnection instance');
      // Use native fetch - service workers with host_permissions bypass CORS
      delugeConnection = new DelugeConnection();
    }

    logger.debug('Connecting to Deluge server');
    await delugeConnection.connectToServer();
    logger.info('Deluge connection initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Deluge connection:', error);
    throw error;
  }
}

/**
 * Get or create Deluge connection (without auto-connecting)
 */
function getConnectionInstance(): DelugeConnection {
  if (!delugeConnection) {
    logger.debug('Creating new DelugeConnection instance');
    // Use native fetch - service workers with host_permissions bypass CORS
    delugeConnection = new DelugeConnection();
  }

  return delugeConnection;
}

/**
 * Extract torrent name from bencode data
 */
function extractTorrentName(bytes: Uint8Array): string | null {
  try {
    // Decode torrent file
    const torrent = bencode.decode(Buffer.from(bytes)) as any;

    // Get name from info dictionary
    if (torrent && torrent.info && torrent.info.name) {
      const nameBuffer = torrent.info.name;
      // Handle both Buffer and string
      if (Buffer.isBuffer(nameBuffer)) {
        return nameBuffer.toString('utf8');
      }
      return String(nameBuffer);
    }

    return null;
  } catch (error) {
    logger.debug('Error parsing torrent name with bencode:', error);
    return null;
  }
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  delay = 1000
): Promise<ArrayBuffer> {
  try {
    const response = await fetch(url, options);

    // Handle rate limiting with retry
    if (response.status === 429 && retries > 0) {
      logger.warn(`Rate limited (429), retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');
    logger.debug('Response content-type:', contentType);

    return response.arrayBuffer();
  } catch (error) {
    if (retries > 0) {
      logger.warn(`Fetch failed, retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Handle torrent file download interception
 */
async function handleTorrentDownload(downloadItem: chrome.downloads.DownloadItem): Promise<void> {
  logger.debug('Download detected:', downloadItem);

  // Quick synchronous check
  if (!interceptEnabled) {
    return;
  }

  // Check if this is a torrent file based on MIME type or filename only
  const isTorrentFile =
    downloadItem.mime === 'application/x-bittorrent' ||
    downloadItem.filename?.endsWith('.torrent');

  if (!isTorrentFile) {
    logger.debug('Not a torrent file, ignoring');
    return;
  }

  logger.info('Torrent file download detected, intercepting:', downloadItem.filename);

  // Cancel the browser download
  chrome.downloads.cancel(downloadItem.id, () => {
    logger.debug('Browser download cancelled');

    // Erase from history
    chrome.downloads.erase({ id: downloadItem.id }, () => {
      logger.debug('Download erased from history');
    });
  });

  // Wait briefly before fetching
  logger.debug('Waiting briefly before fetching torrent file from:', downloadItem.url);

  setTimeout(async () => {
    logger.debug('Fetching torrent file now');

    try {
      // Fetch the torrent file with retry logic
      const arrayBuffer = await fetchWithRetry(
        downloadItem.url,
        {
          credentials: 'include',
          headers: {
            Accept: 'application/x-bittorrent',
          },
        },
        3,
        1000
      );

      logger.info('Torrent file fetched successfully, size:', arrayBuffer.byteLength);

      // Validate torrent file
      const bytes = new Uint8Array(arrayBuffer);

      if (bytes.length < 10) {
        throw new Error('Downloaded file is too small to be a valid torrent');
      }

      const firstChar = String.fromCharCode(bytes[0]);
      if (firstChar !== 'd') {
        logger.error(
          'File does not start with bencode dictionary marker. First bytes:',
          Array.from(bytes.slice(0, 20))
            .map((b) => String.fromCharCode(b))
            .join('')
        );
        throw new Error('Downloaded file is not a valid torrent (invalid bencode format)');
      }

      // Convert to base64
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      logger.debug('Torrent file validated and encoded to base64, length:', base64.length);

      // Extract torrent name using bencode library
      const extractedName = extractTorrentName(bytes);
      const filename = extractedName || downloadItem.filename || 'download.torrent';

      logger.debug('Extracted torrent name:', extractedName);
      logger.info('Using filename:', filename);

      // Get connection and add torrent
      const connection = getConnectionInstance();
      // Get primary server index and connect
      const primaryIndex = await StorageManager.getPrimaryServerIndex();
      await connection.addTorrentFile(base64, filename, undefined, undefined, primaryIndex);

      logger.info('Torrent added to Deluge successfully:', filename);

      // Show success notification
      await NotificationManager.showChromeNotification({
        message: `Successfully added: ${filename}`,
        iconType: 'info',
        id: 'torrent-added-' + Date.now(),
      });
    } catch (error) {
      logger.error('Failed to process torrent:', error);

      // Parse error message
      let errorMessage = (error as Error).message || 'Unknown error';

      // Check for specific errors
      if (errorMessage.includes('already in session') || errorMessage.includes('AddTorrentError')) {
        errorMessage = 'Torrent already added to Deluge';
      }

      // Show error notification
      await NotificationManager.showChromeNotification({
        message: errorMessage,
        iconType: 'error',
        id: 'torrent-error-' + Date.now(),
      });
    }
  }, 500); // Wait 500ms before fetching
}

// ============================================================================
// Service Worker Lifecycle
// ============================================================================

/**
 * Setup declarativeNetRequest rules for CORS handling
 */
async function setupCORSRules(): Promise<void> {
  try {
    // Add rule to modify response headers for Deluge servers
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1], // Remove existing rule if any
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            responseHeaders: [
              {
                header: 'Access-Control-Allow-Origin',
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: '*',
              },
              {
                header: 'Access-Control-Allow-Methods',
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: 'GET, POST, PUT, DELETE, OPTIONS',
              },
              {
                header: 'Access-Control-Allow-Headers',
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: 'Content-Type, X-Deluge-Token, X-CSRF-Token',
              },
            ],
          },
          condition: {
            urlFilter: '*/json',
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
          },
        },
      ],
    });
    logger.info('CORS rules configured');
  } catch (error) {
    logger.error('Failed to setup CORS rules:', error);
  }
}

self.addEventListener('install', (event: ExtendableEvent) => {
  logger.info('Service Worker: Installing');
  // Ensure the service worker activates immediately and setup CORS rules
  event.waitUntil(Promise.all([
    self.skipWaiting(),
    setupCORSRules(),
  ]));
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  logger.info('Service Worker: Activated');
  // Ensure the service worker takes control immediately and setup CORS rules
  event.waitUntil(Promise.all([
    self.clients.claim(),
    setupCORSRules(),
  ]));
});

// ============================================================================
// Fetch Interception
// ============================================================================

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Check if this is a JSON request to the Deluge server
  if (url.pathname.endsWith('/json')) {
    event.respondWith(
      fetch(event.request.clone())
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          // Clone and log response
          return response.clone().json().then((data) => {
            logger.debug('Deluge server response:', data);
            return response;
          });
        })
        .catch((error) => {
          logger.error('Deluge server request failed:', error);

          // Return JSON error response
          return new Response(
            JSON.stringify({
              error: true,
              message: error.message,
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
        })
    );
  } else if (url.origin === self.location.origin) {
    // Handle extension-specific requests
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch((error) => {
          logger.warn('Extension fetch error:', error, event.request);
          return new Response('Network error occurred', {
            status: 408,
            statusText: 'Request Timeout',
          });
        })
    );
  }
});

// ============================================================================
// Download Interception
// ============================================================================

// Load intercept setting
StorageManager.get<{ intercept_torrent_downloads?: boolean }>(['intercept_torrent_downloads'])
  .then((data) => {
    interceptEnabled = data.intercept_torrent_downloads !== false;
    logger.debug('Intercept enabled:', interceptEnabled);
  })
  .catch((error) => {
    logger.error('Failed to load intercept setting:', error);
  });

// Update cache when setting changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.intercept_torrent_downloads) {
    interceptEnabled = changes.intercept_torrent_downloads.newValue !== false;
    logger.debug('Intercept setting changed:', interceptEnabled);
  }
});

// Listen for torrent downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
  handleTorrentDownload(downloadItem).catch((error) => {
    logger.error('Error handling torrent download:', error);
  });
});

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Handle messages from content scripts, popup, and options pages
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug('Received message:', message.method, message);

  // Handle async operations
  const handleAsync = async () => {
    try {
      switch (message.method) {
        case 'plugins-getinfo': {
          // Get plugin info and labels (for options page validation)
          // This creates a temporary connection and doesn't affect the main instance
          logger.debug('Starting server validation for:', message.url);
          const connection = getConnectionInstance();
          logger.debug('Got connection instance, calling validateServerAndGetPlugins...');
          const result = await connection.validateServerAndGetPlugins(
            message.url,
            message.password
          );
          logger.debug('Validation successful, sending response:', result);
          sendResponse({ value: result });
          break;
        }

        case 'storage-get-connections': {
          // Get connections array (used by popup)
          const connections = await StorageManager.getConnections();
          sendResponse({ value: connections });
          break;
        }

        case 'get-server-info': {
          // Get server information (no connection needed)
          const connections = await StorageManager.getConnections();
          const primaryIndex = await StorageManager.getPrimaryServerIndex();
          sendResponse({
            value: {
              connections,
              primaryServerIndex: primaryIndex,
            },
          });
          break;
        }

        case 'torrent-add': {
          // Add torrent via URL or magnet (will connect when needed)
          const connection = getConnectionInstance();
          await connection.addTorrent(
            message.torrent_url,
            message.cookies,
            message.plugins,
            message.options,
            message.server_index
          );
          sendResponse({ success: true });
          break;
        }

        case 'torrent-add-file': {
          // Add torrent via file data (will connect when needed)
          const connection = getConnectionInstance();
          await connection.addTorrentFile(
            message.data,
            message.filename,
            message.options,
            message.plugins,
            message.server_index
          );
          sendResponse({ success: true });
          break;
        }

        case 'torrent-list': {
          // Get torrent list for a server (will connect when needed)
          const connection = getConnectionInstance();
          const torrents = await connection.getTorrentList(message.server_index);
          sendResponse({ value: torrents });
          break;
        }

        default:
          logger.warn('Unknown message method:', message.method);
          sendResponse({ error: 'Unknown method' });
      }
    } catch (error: any) {
      logger.error('Error handling message:', error);
      sendResponse({
        error: true,
        message: error.message || String(error),
      });
    }
  };

  // Run async handler
  handleAsync();

  // Return true to indicate we'll send response asynchronously
  return true;
});

/**
 * Handle port connections from content scripts
 */
chrome.runtime.onConnect.addListener((port) => {
  logger.debug('Port connected:', port.name);

  port.onMessage.addListener(async (req: any) => {
    // Unwrap message from communicator format: { _id, _isTab, _data }
    const messageId = req._id;
    const message = req._data;

    logger.debug('Port message received:', message);

    try {
      switch (message.method) {
        case 'plugins-getinfo': {
          // Get plugin info and labels (for options page validation)
          const connection = getConnectionInstance();
          const result = await connection.validateServerAndGetPlugins(
            message.url,
            message.password
          );
          // Wrap response in communicator format
          port.postMessage({ _id: messageId, _data: { value: result } });
          break;
        }

        case 'torrent-add': {
          const connection = getConnectionInstance();
          await connection.addTorrent(
            message.torrent_url,
            message.cookies,
            message.plugins,
            message.options,
            message.server_index
          );
          port.postMessage({ _id: messageId, _data: { success: true } });
          break;
        }

        case 'storage-get-connections': {
          // Get connections array (used by popup)
          const connections = await StorageManager.getConnections();
          port.postMessage({
            _id: messageId,
            _data: { value: connections },
          });
          break;
        }

        case 'get-server-info': {
          const connections = await StorageManager.getConnections();
          const primaryIndex = await StorageManager.getPrimaryServerIndex();
          port.postMessage({
            _id: messageId,
            _data: { value: { connections, primaryServerIndex: primaryIndex } },
          });
          break;
        }

        case 'torrent-list': {
          // Get torrent list for a server (will connect when needed)
          const connection = getConnectionInstance();
          const torrents = await connection.getTorrentList(message.server_index);
          port.postMessage({
            _id: messageId,
            _data: { value: torrents },
          });
          break;
        }

        case 'torrent-add-file': {
          // Add torrent via file data (will connect when needed)
          const connection = getConnectionInstance();
          await connection.addTorrentFile(
            message.data,
            message.filename,
            message.options,
            message.plugins,
            message.server_index
          );
          port.postMessage({ _id: messageId, _data: { success: true } });
          break;
        }

        default:
          port.postMessage({ _id: messageId, _data: { error: 'Unknown method' } });
      }
    } catch (error: any) {
      logger.error('Error handling port message:', error);
      port.postMessage({
        _id: messageId,
        _data: {
          error: true,
          message: error.message || String(error),
        },
      });
    }
  });

  port.onDisconnect.addListener(() => {
    logger.debug('Port disconnected:', port.name);
  });
});

logger.info('Background service worker initialized');
