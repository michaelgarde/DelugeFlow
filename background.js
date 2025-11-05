// Service worker for the Chrome extension

// Import necessary scripts without jQuery
importScripts(
  'lib/logger.js',
  'lib/utils.js',
  'lib/controller_communicator.js',
  'controller_actions.js'
);

// Add event listeners for service worker lifecycle events
self.addEventListener('install', (event) => {
  debugLog('important', 'Service Worker: Installed');
  // Ensure the service worker activates immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  debugLog('important', 'Service Worker: Activated');
  // Ensure the service worker takes control immediately
  event.waitUntil(self.clients.claim());
});

// Handle fetch requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Check if this is a JSON request to the Deluge server
  if (url.pathname.endsWith('/json')) {
    event.respondWith(
      fetch(event.request.clone(), {
        credentials: 'include',
        mode: 'cors'
      }).then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.clone().json().then(data => {
          debugLog('debug', 'Deluge server response:', data);
          return response;
        });
      }).catch(error => {
        debugLog('error', 'Deluge server request failed:', error);
        // Return a proper JSON error response
        return new Response(JSON.stringify({
          error: true,
          message: error.message
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      })
    );
  } else if (url.origin === self.location.origin) {
    // Handle extension-specific requests
    event.respondWith(
      fetch(event.request).then((response) => {
        return response;
      }).catch((error) => {
        debugLog('warn', 'Extension fetch error:', error, event.request);
        return new Response('Network error occurred', {
          status: 408,
          statusText: 'Request Timeout'
        });
      })
    );
  }
});

// Cache the intercept setting for faster synchronous access
let interceptEnabled = true;
chrome.storage.local.get(['intercept_torrent_downloads'], (data) => {
  interceptEnabled = data.intercept_torrent_downloads !== false;
});

// Update cache when setting changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.intercept_torrent_downloads) {
    interceptEnabled = changes.intercept_torrent_downloads.newValue !== false;
  }
});

// Download interception for .torrent files
chrome.downloads.onCreated.addListener((downloadItem) => {
  debugLog('debug', 'Download detected:', downloadItem);

  // Quick synchronous check
  if (!interceptEnabled) {
    return;
  }

  // Check if this is a torrent file
  const isTorrentFile =
    downloadItem.mime === 'application/x-bittorrent' ||
    downloadItem.filename?.endsWith('.torrent') ||
    downloadItem.url?.endsWith('.torrent');

  if (!isTorrentFile) {
    debugLog('debug', 'Not a torrent file, ignoring');
    return;
  }

  debugLog('important', 'Torrent file download detected, intercepting:', downloadItem.filename);

  // Immediately cancel the browser download
  chrome.downloads.cancel(downloadItem.id, () => {
    debugLog('log', 'Browser download cancelled');

    // Erase the download from history
    chrome.downloads.erase({ id: downloadItem.id }, () => {
      debugLog('log', 'Download erased from history');
    });
  });

  // Fetch the torrent file content
  debugLog('log', 'Fetching torrent file from:', downloadItem.url);

  fetch(downloadItem.url, {
    credentials: 'include',
    headers: {
      'Accept': 'application/x-bittorrent'
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    debugLog('debug', 'Response content-type:', contentType);

    return response.arrayBuffer();
  })
  .then(arrayBuffer => {
    debugLog('log', 'Torrent file fetched successfully, size:', arrayBuffer.byteLength);

    // Validate that this looks like a torrent file
    const bytes = new Uint8Array(arrayBuffer);

    // Torrent files are bencoded and must start with 'd' (dictionary)
    if (bytes.length < 10) {
      throw new Error('Downloaded file is too small to be a valid torrent');
    }

    const firstChar = String.fromCharCode(bytes[0]);
    if (firstChar !== 'd') {
      debugLog('error', 'File does not start with bencode dictionary marker. First bytes:',
        Array.from(bytes.slice(0, 20)).map(b => String.fromCharCode(b)).join(''));
      throw new Error('Downloaded file is not a valid torrent (invalid bencode format)');
    }

    // Convert to base64
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    debugLog('log', 'Torrent file validated and encoded to base64, length:', base64.length);

    // Send to Deluge using the global initialized connection
    const filename = downloadItem.filename || 'download.torrent';

    delugeConnection.addTorrentFile(base64, filename)
      .then(() => {
        debugLog('important', 'Torrent added to Deluge successfully:', filename);

        // Show success notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon-48.png',
          title: 'DelugeFlow: Torrent Added',
          message: `Successfully added: ${filename}`
        });
      })
      .catch(error => {
        debugLog('error', 'Failed to add torrent to Deluge:', error);
      });
  })
  .catch(error => {
    debugLog('error', 'Failed to fetch torrent file:', error);

    // Show error notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon-48.png',
      title: 'DelugeFlow: Download Failed',
      message: `Failed to intercept torrent: ${error.message}`
    });
  });
});