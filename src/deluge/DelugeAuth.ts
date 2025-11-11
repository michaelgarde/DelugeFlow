import { AuthenticationError, isAuthErrorMessage } from '@/lib/errors/DelugeErrors';
import { DELUGE_METHODS } from '@/config/constants';
import { Logger } from '@/lib/logger/Logger';
import type { DelugeResponse } from '@/types';
import type { DelugeRequest } from './DelugeRequest';

const logger = new Logger('DelugeAuth');

/**
 * Handles authentication and session management for Deluge Web UI
 */
export class DelugeAuth {
  private sessionCookie: string | null = null;
  private sessionId: string | null = null;
  private csrfToken: string | null = null;
  private isValidating = false;

  constructor(
    private requestHandler: DelugeRequest | null, // Will be set after DelugeRequest is created (circular dependency)
    private serverPass: string
  ) {}

  // Import DelugeRequest type at runtime to avoid circular dependency
  private get req(): DelugeRequest {
    if (!this.requestHandler) {
      throw new Error('Request handler not set');
    }
    return this.requestHandler as DelugeRequest;
  }

  /**
   * Set the request handler (resolves circular dependency)
   */
  setRequestHandler(handler: DelugeRequest): void {
    this.requestHandler = handler;
  }

  /**
   * Check if current session is valid
   */
  async checkSession(): Promise<boolean> {
    logger.debug('Checking if session is valid');

    try {
      const payload = await this.req.request<boolean>(
        DELUGE_METHODS.AUTH_CHECK_SESSION,
        [],
        true // silent
      );

      if (payload.result === true) {
        logger.debug('Session is valid');
        return true;
      }

      logger.error('Session is invalid:', payload);
      return false;
    } catch (error) {
      logger.error('Session check failed:', error);
      return false;
    }
  }

  /**
   * Login to Deluge Web UI
   * @param silent - Don't show notifications on failure
   */
  async login(silent = false): Promise<boolean> {
    logger.info('Attempting to login with saved credentials');

    if (!this.serverPass) {
      throw new AuthenticationError('No password available');
    }

    // For validation, always start fresh by clearing session state
    // Don't try to delete session from server - it likely doesn't exist yet
    if (this.isValidating) {
      this.clearSession();
    } else {
      // Check if we already have a valid session
      const hasValidSession = await this.checkSession();
      if (hasValidSession) {
        logger.info('Using existing valid session');
        return true;
      }
    }

    // Clear any existing session state
    this.clearSession();

    // Perform fresh login
    logger.info('Performing fresh login');

    try {
      const payload = await this.req.request<boolean>(
        DELUGE_METHODS.AUTH_LOGIN,
        [this.serverPass],
        silent
      );

      logger.debug('Login response:', payload?.result ? 'Success' : 'Failed');

      if (payload.result === true) {
        logger.info('Login successful');
        return true;
      }

      throw new AuthenticationError('Login failed - check your Deluge password');
    } catch (error) {
      if (!silent) {
        // Notification will be shown by caller
        logger.error('Login failed:', error);
      }
      throw error;
    }
  }

  /**
   * Delete current session (logout)
   */
  async deleteSession(): Promise<void> {
    try {
      await this.req.request(
        DELUGE_METHODS.AUTH_DELETE_SESSION,
        [],
        true // silent
      );
      this.clearSession();
      logger.info('Session deleted');
    } catch (error) {
      logger.error('Failed to delete session:', error);
      throw error;
    }
  }

  /**
   * Check if an error response indicates authentication failure
   */
  isAuthError(payload: DelugeResponse<unknown>): boolean {
    if (!payload.error) return false;

    const errorMessage = payload.error.message || '';
    return isAuthErrorMessage(errorMessage);
  }

  /**
   * Clear session state
   */
  clearSession(): void {
    this.sessionCookie = null;
    this.sessionId = null;
    this.csrfToken = null;
  }

  /**
   * Get session cookie for request headers
   */
  getSessionCookie(): string | null {
    return this.sessionCookie;
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get CSRF token for request headers
   */
  getCsrfToken(): string | null {
    return this.csrfToken;
  }

  /**
   * Update session cookie from response
   */
  updateSessionCookie(setCookie: string): void {
    logger.debug('Received session cookie from server');
    this.sessionCookie = setCookie;

    // Extract session ID from Set-Cookie header
    const sessionMatch = setCookie.match(/_session_id=([^;]+)/);
    if (sessionMatch) {
      this.sessionId = sessionMatch[1];
      logger.debug('Extracted session ID');
    }
  }

  /**
   * Update CSRF token from response
   */
  updateCsrfToken(csrfToken: string): void {
    logger.debug('Received CSRF token from server');
    this.csrfToken = csrfToken;
  }

  /**
   * Set validation mode
   */
  setValidating(validating: boolean): void {
    this.isValidating = validating;
  }

  /**
   * Check if in validation mode
   */
  isInValidationMode(): boolean {
    return this.isValidating;
  }
}
