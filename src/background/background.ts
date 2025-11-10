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

/**
 * Initialize Deluge connection
 */
async function initializeConnection(): Promise<void> {
  try {
    if (!delugeConnection) {
      logger.debug('Creating new DelugeConnection instance');
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
 * Get or create Deluge connection
 */
async function getConnection(): Promise<DelugeConnection> {
  if (!delugeConnection) {
    await initializeConnection();
  }

  if (!delugeConnection) {
    throw new Error('Failed to initialize Deluge connection');
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
      const connection = await getConnection();
      await connection.addTorrentFile(base64, filename);

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

self.addEventListener('install', (event: ExtendableEvent) => {
  logger.info('Service Worker: Installing');
  // Ensure the service worker activates immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  logger.info('Service Worker: Activated');
  // Ensure the service worker takes control immediately
  event.waitUntil(self.clients.claim());
});

// ============================================================================
// Fetch Interception
// ============================================================================

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Check if this is a JSON request to the Deluge server
  if (url.pathname.endsWith('/json')) {
    event.respondWith(
      fetch(event.request.clone(), {
        credentials: 'include',
        mode: 'cors',
      })
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

logger.info('Background service worker initialized');
