import { EXTENSION_NAME } from '@/config/constants';
import type { LogLevel } from '@/types';

/**
 * Global debug flag - set by storage setting
 */
let DEBUG_ENABLED = false;

/**
 * Structured logger with context and runtime control
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  /**
   * Set debug mode (called from storage listener)
   */
  static setDebugMode(enabled: boolean): void {
    DEBUG_ENABLED = enabled;
    console.log(`[${EXTENSION_NAME}] Debug logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if debug mode is enabled
   */
  static isDebugEnabled(): boolean {
    return DEBUG_ENABLED;
  }

  /**
   * Debug message (only shown when debug enabled)
   */
  debug(message: string, ...meta: unknown[]): void {
    if (DEBUG_ENABLED) {
      console.debug(
        `[${EXTENSION_NAME}:${this.context}]`,
        message,
        ...meta
      );
    }
  }

  /**
   * Log message (only shown when debug enabled)
   */
  log(message: string, ...meta: unknown[]): void {
    if (DEBUG_ENABLED) {
      console.log(
        `[${EXTENSION_NAME}:${this.context}]`,
        message,
        ...meta
      );
    }
  }

  /**
   * Info message (always shown)
   */
  info(message: string, ...meta: unknown[]): void {
    console.info(
      `[${EXTENSION_NAME}:${this.context}]`,
      message,
      ...meta
    );
  }

  /**
   * Warning message (always shown when debug enabled)
   */
  warn(message: string, ...meta: unknown[]): void {
    if (DEBUG_ENABLED) {
      console.warn(
        `[${EXTENSION_NAME}:${this.context}]`,
        message,
        ...meta
      );
    }
  }

  /**
   * Error message (always shown)
   */
  error(message: string, error?: Error | unknown, ...meta: unknown[]): void {
    console.error(
      `[${EXTENSION_NAME}:${this.context}]`,
      message,
      error,
      ...meta
    );

    // Log stack trace if available
    if (error instanceof Error && error.stack) {
      console.error(`Stack trace:`, error.stack);
    }
  }

  /**
   * Important message (always shown)
   */
  important(message: string, ...meta: unknown[]): void {
    console.log(
      `[${EXTENSION_NAME}:${this.context}] IMPORTANT:`,
      message,
      ...meta
    );
  }
}

/**
 * Global debugLog function for backward compatibility
 * @deprecated Use Logger class instead
 */
export function debugLog(level: LogLevel, ...args: unknown[]): void {
  const logger = new Logger('Global');

  switch (level) {
    case 'debug':
    case 'log':
      logger.debug(String(args[0]), ...args.slice(1));
      break;
    case 'info':
      logger.info(String(args[0]), ...args.slice(1));
      break;
    case 'warn':
      logger.warn(String(args[0]), ...args.slice(1));
      break;
    case 'error':
      logger.error(String(args[0]), args[1] as Error, ...args.slice(2));
      break;
    case 'important':
      logger.important(String(args[0]), ...args.slice(1));
      break;
    default:
      logger.log(String(args[0]), ...args.slice(1));
  }
}

/**
 * Initialize debug mode from storage
 */
export async function initializeLogger(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(['enable_debug_logging']);
    Logger.setDebugMode(data.enable_debug_logging === true);

    // Listen for changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.enable_debug_logging) {
        Logger.setDebugMode(changes.enable_debug_logging.newValue === true);
      }
    });
  } catch (error) {
    console.error('Failed to initialize logger:', error);
  }
}
