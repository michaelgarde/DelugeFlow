/**
 * Base error class for all Deluge-related errors
 */
export class DelugeError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DelugeError';

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when authentication fails or session is invalid
 */
export class AuthenticationError extends DelugeError {
  constructor(message = 'Authentication failed', cause?: Error) {
    super(message, 'AUTH_ERROR', cause);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when connection to Deluge server fails
 */
export class ConnectionError extends DelugeError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
  }
}

/**
 * Thrown when server configuration is invalid or missing
 */
export class ServerConfigError extends DelugeError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ServerConfigError';
  }
}

/**
 * Thrown when daemon connection fails
 */
export class DaemonError extends DelugeError {
  constructor(message: string, cause?: Error) {
    super(message, 'DAEMON_ERROR', cause);
    this.name = 'DaemonError';
  }
}

/**
 * Thrown when torrent operation fails
 */
export class TorrentError extends DelugeError {
  constructor(message: string, cause?: Error) {
    super(message, 'TORRENT_ERROR', cause);
    this.name = 'TorrentError';
  }
}

/**
 * Thrown when plugin operation fails
 */
export class PluginError extends DelugeError {
  constructor(message: string, cause?: Error) {
    super(message, 'PLUGIN_ERROR', cause);
    this.name = 'PluginError';
  }
}

/**
 * Thrown when network request fails or times out
 */
export class NetworkError extends DelugeError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    cause?: Error
  ) {
    super(message, 'NETWORK_ERROR', cause);
    this.name = 'NetworkError';
  }
}

/**
 * Thrown when validation fails
 */
export class ValidationError extends DelugeError {
  constructor(message: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

/**
 * Utility to check if an error is an authentication error (from string matching)
 */
export function isAuthErrorMessage(message: string): boolean {
  const authErrorPatterns = [
    'Not authenticated',
    'Invalid session',
    'No session',
    'Authentication required',
    'Login required'
  ];

  return authErrorPatterns.some(pattern =>
    message.toLowerCase().includes(pattern.toLowerCase())
  );
}
