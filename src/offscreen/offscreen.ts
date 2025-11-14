/**
 * Offscreen Document for making fetch requests
 *
 * This document exists to make fetch requests that will be intercepted
 * by the service worker's fetch event listener, allowing proper CORS handling.
 */

console.log('[Offscreen] Offscreen document loaded');

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Offscreen] Received message:', message);

  if (message.type === 'FETCH_REQUEST') {
    // Make the fetch request
    const { url, options } = message;

    // Reconstruct options without non-serializable properties
    const fetchOptions: RequestInit = {
      method: options?.method,
      headers: options?.headers,
      body: options?.body,
      credentials: options?.credentials,
      mode: options?.mode,
      cache: options?.cache,
      redirect: options?.redirect,
      referrer: options?.referrer,
      integrity: options?.integrity,
    };

    // Remove undefined properties
    Object.keys(fetchOptions).forEach(key => {
      if (fetchOptions[key as keyof RequestInit] === undefined) {
        delete fetchOptions[key as keyof RequestInit];
      }
    });

    console.log('[Offscreen] Making fetch request to:', url);

    fetch(url, fetchOptions)
      .then(async (response) => {
        console.log('[Offscreen] Fetch response received:', response.status);

        // Convert response to a serializable format
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        const body = await response.text();

        sendResponse({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers,
          body,
        });
      })
      .catch((error) => {
        console.error('[Offscreen] Fetch error:', error);
        sendResponse({
          error: true,
          message: error.message || String(error),
        });
      });

    // Return true to indicate we'll send a response asynchronously
    return true;
  }
});
