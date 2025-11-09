import { NetworkError, AuthenticationError } from '@/lib/errors/DelugeErrors';
import { NETWORK } from '@/config/constants';
import { Logger } from '@/lib/logger/Logger';
import type { DelugeAuth } from './DelugeAuth';
import type { DelugeRequest as DelugeReq, DelugeResponse } from '@/types';

const logger = new Logger('DelugeRequest');

/**
 * Handles HTTP requests to Deluge JSON-RPC API
 */
export class DelugeRequest {
  private state = '';

  constructor(
    private serverUrl: string,
    private auth: DelugeAuth
  ) {}

  /**
   * Make a JSON-RPC request to Deluge server
   * @param method - Deluge API method name
   * @param params - Method parameters
   * @param silent - Don't log errors or show notifications
   */
  async request<T = unknown>(
    method: string,
    params: unknown[] = [],
    silent = false
  ): Promise<DelugeResponse<T>> {
    this.state = method;

    logger.debug('Starting request:', {
      method,
      params,
      serverUrl: this.sanitizeUrl(this.serverUrl),
    });

    if (!this.serverUrl) {
      throw new NetworkError('Server URL not available');
    }

    // Construct request URL
    const url = this.buildRequestUrl();
    logger.debug('Request URL (sanitized):', this.sanitizeUrl(url));

    // Build headers with session/CSRF
    const headers = this.buildHeaders();

    // Build request body
    const requestBody: DelugeReq = {
      method,
      params,
      id: `${Date.now()}`,
    };

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      credentials: 'include',
    };

    logger.debug('Making fetch request:', {
      url: this.sanitizeUrl(url),
      method: requestBody.method,
      params: requestBody.params,
      id: requestBody.id,
      headers: Object.keys(headers),
    });

    try {
      // Fetch with timeout
      const response = await this.fetchWithTimeout(
        url,
        fetchOptions,
        NETWORK.REQUEST_TIMEOUT_MS
      );

      logger.debug(`Response received: ${response.status} ${response.statusText}`);

      // Store session cookie and CSRF token from response
      this.extractSessionData(response);

      // Check HTTP status
      if (!response.ok) {
        logger.error('HTTP error:', response.status, response.statusText);

        // Special handling for 403 on non-torrent operations
        if (response.status === 403 && !method.includes('torrent')) {
          logger.debug('403 Forbidden on non-torrent operation - attempting to re-authenticate');
          await this.auth.checkSession();
          return this.request<T>(method, params, silent);
        }

        throw new NetworkError(`HTTP error! status: ${response.status}`, response.status);
      }

      // Parse JSON response
      const payload = await response.json() as DelugeResponse<T>;

      logger.debug('Response payload:', JSON.stringify(payload).substring(0, 200) + '...');

      // Handle payload errors
      if (payload.error) {
        // Special case: "already in session" is not really an error
        if (payload.error.message?.includes('already in session')) {
          logger.warn('Torrent already in session:', payload.error);
          return payload;
        }

        logger.warn('Server reported error:', payload.error);

        // Handle authentication errors
        if (this.auth.isAuthError(payload)) {
          logger.debug('Authentication error detected, attempting to re-authenticate');

          // Clear session state
          this.auth.clearSession();

          // Re-login and retry
          await this.auth.login(silent);
          return this.request<T>(method, params, silent);
        }

        throw new Error(payload.error.message || 'Unknown server error');
      }

      // Handle 403 status in payload
      if ((payload as any).status === 403) {
        logger.debug('Remote server returned 403 - this is likely a torrent access issue');
        throw new NetworkError('Access denied by remote server', 403);
      }

      // Update state if provided
      if ((payload as any).state) {
        this.state = (payload as any).state;
      }

      logger.debug('Request completed successfully:', method);
      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Request timed out after', NETWORK.REQUEST_TIMEOUT_MS, 'ms');
        throw new NetworkError(`Request timed out after ${NETWORK.REQUEST_TIMEOUT_MS}ms`);
      }

      logger.warn('Request failed:', error);
      throw error;
    }
  }

  /**
   * Fetch with timeout support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Build request URL
   */
  private buildRequestUrl(): string {
    try {
      const baseUrl = this.serverUrl.endsWith('/')
        ? this.serverUrl
        : this.serverUrl + '/';
      return new URL('json', baseUrl).href;
    } catch (error) {
      logger.error('Error constructing URL:', error);
      throw new NetworkError('Invalid server URL');
    }
  }

  /**
   * Build request headers with session and CSRF
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add session cookie
    const sessionCookie = this.auth.getSessionCookie();
    const sessionId = this.auth.getSessionId();

    if (sessionCookie) {
      logger.debug('Adding session cookie to request');
      headers['Cookie'] = sessionCookie;
    } else if (sessionId) {
      logger.debug('Adding session ID as cookie to request');
      headers['Cookie'] = `_session_id=${sessionId}`;
    }

    // Add CSRF token
    const csrfToken = this.auth.getCsrfToken();
    if (csrfToken) {
      logger.debug('Adding CSRF token to request');
      headers['X-CSRF-Token'] = csrfToken;
    }

    return headers;
  }

  /**
   * Extract and store session data from response
   */
  private extractSessionData(response: Response): void {
    // Store session cookie if provided
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) {
      this.auth.updateSessionCookie(setCookie);
    }

    // Store CSRF token if provided
    const csrfToken = response.headers.get('X-CSRF-Token');
    if (csrfToken) {
      this.auth.updateCsrfToken(csrfToken);
    }
  }

  /**
   * Sanitize URL for logging (remove credentials)
   */
  private sanitizeUrl(url: string): string {
    return url.replace(/:[^\/]+@/, ':*****@');
  }

  /**
   * Get current state
   */
  getState(): string {
    return this.state;
  }
}
