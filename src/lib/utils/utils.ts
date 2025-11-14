/**
 * Utility functions for DelugeFlow
 * Cleaned up version without obsolete polyfills
 */

/**
 * Register an event listener safely (removes before adding)
 */
export function registerEventListener<K extends keyof DocumentEventMap>(
  eventName: K,
  listener: (ev: DocumentEventMap[K]) => void,
  context: Document | HTMLElement = document
): void {
  context.removeEventListener(eventName, listener as EventListener, false);
  context.addEventListener(eventName, listener as EventListener, false);
}

/**
 * Generate a UUID v4
 */
export function uuid4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Stop event propagation completely
 */
export function stopEvent(e?: Event): void {
  if (!e) return;

  e.stopImmediatePropagation();
  e.stopPropagation();
  e.cancelBubble = true;
  e.preventDefault();
}

/**
 * Generate a hash code from a string
 */
export function hashCode(str: string): string {
  let hash = 0;
  if (str.length === 0) return 'x0';

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }

  return 'x' + Math.abs(hash);
}

/**
 * Compare two semantic version strings
 * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2, NaN if invalid
 */
export function versionCompare(
  v1: string,
  v2: string,
  options?: {
    lexicographical?: boolean;
    zeroExtend?: boolean;
    ignoreMinor?: boolean;
  }
): number {
  const lexicographical = options?.lexicographical;
  const zeroExtend = options?.zeroExtend;
  const ignoreMinor = options?.ignoreMinor;

  const v1parts = v1.split('.');
  const v2parts = v2.split('.');

  function isValidPart(x: string): boolean {
    return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
  }

  if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
    return NaN;
  }

  if (zeroExtend) {
    while (v1parts.length < v2parts.length) v1parts.push('0');
    while (v2parts.length < v1parts.length) v2parts.push('0');
  }

  let v1partsNum: (string | number)[] = v1parts;
  let v2partsNum: (string | number)[] = v2parts;

  if (!lexicographical) {
    v1partsNum = v1parts.map(Number);
    v2partsNum = v2parts.map(Number);
  }

  for (let i = 0; i < v1partsNum.length; ++i) {
    if (v2partsNum.length - 1 === i && v2partsNum.length > 1 && ignoreMinor) {
      return 0;
    } else if (v2partsNum.length === i) {
      return 1;
    }

    if (v1partsNum[i] === v2partsNum[i]) {
      continue;
    } else if (v1partsNum[i] > v2partsNum[i]) {
      return 1;
    } else {
      return -1;
    }
  }

  if (v1partsNum.length !== v2partsNum.length) {
    return -1;
  }

  return 0;
}

/**
 * Curry a function with preset parameters
 */
export function curry<T extends (...args: any[]) => any>(
  fn: T,
  ...preset: unknown[]
): (...args: unknown[]) => ReturnType<T> {
  return (...args: unknown[]) => {
    return fn(...preset, ...args);
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format seconds to human-readable time
 */
export function formatTime(seconds: number): string {
  if (seconds < 0 || !isFinite(seconds)) return '∞';
  if (seconds === 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && hours === 0) parts.push(`${secs}s`);

  return parts.join(' ') || '0s';
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a promise-based operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries || 3;
  const baseDelay = options.baseDelay || 1000;
  const maxDelay = options.maxDelay || 10000;
  const shouldRetry = options.shouldRetry || (() => true);

  let attempts = 0;

  while (true) {
    try {
      attempts++;
      return await operation();
    } catch (error) {
      if (attempts >= maxRetries || !shouldRetry(error as Error)) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        maxDelay,
        baseDelay * Math.pow(2, attempts - 1) * (0.9 + Math.random() * 0.2)
      );

      console.warn(
        `Operation failed, retrying (${attempts}/${maxRetries})...`,
        error
      );
      console.debug(`Retrying in ${Math.round(delay / 100) / 10} seconds...`);

      await sleep(delay);
    }
  }
}
