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

// Helper function to extract torrent name from bencode data
function extractTorrentName(bytes) {
  try {
    // Convert bytes to string for parsing
    let data = '';
    for (let i = 0; i < bytes.length; i++) {
      data += String.fromCharCode(bytes[i]);
    }

    // Find the "info" dictionary
    const infoIndex = data.indexOf('4:info');
    if (infoIndex === -1) {
      return null;
    }

    // Start parsing after "4:info"
    let pos = infoIndex + 6;

    // Skip the dictionary marker 'd'
    if (data[pos] === 'd') {
      pos++;
    }

    // Look for "name" key within the info dictionary
    // Try to find "4:name" or other length variants
    let searchPos = pos;
    let nameIndex = -1;

    // Search for name field (could be "4:name" for single-file, or in files list for multi-file)
    const namePattern = ':name';
    for (let i = searchPos; i < Math.min(searchPos + 5000, data.length); i++) {
      if (data.substr(i, 5) === namePattern) {
        // Found ":name", now check if there's a digit before it
        let lengthStart = i - 1;
        while (lengthStart >= 0 && /\d/.test(data[lengthStart])) {
          lengthStart--;
        }
        lengthStart++;

        if (lengthStart < i) {
          nameIndex = i + 5; // Position after ":name"
          break;
        }
      }
    }

    if (nameIndex === -1) {
      return null;
    }

    // Parse the string length
    let lengthStr = '';
    pos = nameIndex;
    while (pos < data.length && /\d/.test(data[pos])) {
      lengthStr += data[pos];
      pos++;
    }

    if (data[pos] !== ':') {
      return null;
    }

    const nameLength = parseInt(lengthStr, 10);
    if (isNaN(nameLength) || nameLength <= 0 || nameLength > 1000) {
      return null;
    }

    // Extract the name string
    pos++; // Skip ':'
    const name = data.substr(pos, nameLength);

    return name || null;
  } catch (e) {
    debugLog('debug', 'Error parsing torrent name:', e);
    return null;
  }
}

// Download interception for .torrent files
chrome.downloads.onCreated.addListener((downloadItem) => {
  debugLog('debug', 'Download detected:', downloadItem);

  // Quick synchronous check
  if (!interceptEnabled) {
    return;
  }

  // Check if this is a torrent file based on MIME type or filename only
  // Don't check URL patterns as they can be unreliable
  // Reason: Many private trackers and some sites serve .torrent files from URLs that do not end with '.torrent',
  // and some use redirects or query parameters. Relying on URL patterns causes missed interceptions and false positives.
  // Only use MIME type and filename for reliable detection.
  const isTorrentFile =
    downloadItem.mime === 'application/x-bittorrent' ||
    downloadItem.filename?.endsWith('.torrent');

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

  // Wait briefly to let the browser's canceled download clear, then fetch
  debugLog('log', 'Waiting briefly before fetching torrent file from:', downloadItem.url);

  setTimeout(() => {
    debugLog('log', 'Fetching torrent file now');

    // Helper function to fetch with retry
  const fetchWithRetry = (url, options, retries = 3, delay = 1000) => {
    return fetch(url, options)
      .then(response => {
        // Handle rate limiting (429) with retry
        if (response.status === 429 && retries > 0) {
          debugLog('warn', `Rate limited (429), retrying in ${delay}ms... (${retries} retries left)`);
          return new Promise(resolve => {
            setTimeout(() => {
              resolve(fetchWithRetry(url, options, retries - 1, delay * 2));
            }, delay);
          });
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check content type
        const contentType = response.headers.get('content-type');
        debugLog('debug', 'Response content-type:', contentType);

        return response.arrayBuffer();
      });
  };

  fetchWithRetry(downloadItem.url, {
    credentials: 'include',
    headers: {
      'Accept': 'application/x-bittorrent'
    }
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

    // Extract the actual torrent name from the file metadata
    const extractedName = extractTorrentName(bytes);
    const filename = extractedName || downloadItem.filename || 'download.torrent';

    debugLog('log', 'Extracted torrent name:', extractedName);
    debugLog('log', 'Using filename:', filename);

    // Ensure connection is initialized before adding torrent
    const addTorrentPromise = delugeConnection.SERVER_URL
      ? Promise.resolve()
      : delugeConnection._initState()
          .then(() => delugeConnection.connectToServer());

    addTorrentPromise
      .then(() => delugeConnection.addTorrentFile(base64, filename))
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

        // Parse and simplify error message
        let errorMessage = error.message || 'Unknown error';

        // Check for "already in session" error
        if (errorMessage.includes('already in session') || errorMessage.includes('AddTorrentError')) {
          errorMessage = 'Torrent already added to Deluge';
        }

        // Show error notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'images/icon-48.png',
          title: 'DelugeFlow: Failed',
          message: errorMessage
        });
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
  }, 500); // Wait 500ms before fetching to avoid rate limiting
});