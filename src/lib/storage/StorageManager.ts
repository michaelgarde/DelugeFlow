import { STORAGE_KEYS, DEFAULTS } from '@/config/constants';
import type { Connection, StorageData } from '@/types';
import { ValidationError } from '@/lib/errors/DelugeErrors';

/**
 * Manages chrome.storage.local access with Promise-based API
 * and type safety
 */
export class StorageManager {
  /**
   * Get data from storage
   * @param keys - Storage keys to retrieve (null = all keys)
   */
  static async get<T = StorageData>(
    keys: string | string[] | null = null
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (data) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(data as T);
        }
      });
    });
  }

  /**
   * Set data in storage
   */
  static async set(data: Partial<StorageData>): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Remove keys from storage
   */
  static async remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Clear all storage
   */
  static async clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get server connections
   */
  static async getConnections(): Promise<Connection[]> {
    const data = await this.get<{ connections?: Connection[] | string }>([
      STORAGE_KEYS.CONNECTIONS,
    ]);

    let connections = data.connections;

    // Handle case where connections might be stored as JSON string
    if (typeof connections === 'string') {
      try {
        connections = JSON.parse(connections);
      } catch (e) {
        console.error('Failed to parse connections:', e);
        return [];
      }
    }

    return Array.isArray(connections) ? connections : [];
  }

  /**
   * Set server connections
   */
  static async setConnections(connections: Connection[]): Promise<void> {
    if (!Array.isArray(connections)) {
      throw new ValidationError('Connections must be an array');
    }

    await this.set({ [STORAGE_KEYS.CONNECTIONS]: connections });
  }

  /**
   * Get primary server index
   */
  static async getPrimaryServerIndex(): Promise<number> {
    const data = await this.get<{ primaryServerIndex?: number }>([
      STORAGE_KEYS.PRIMARY_SERVER_INDEX,
    ]);

    return data.primaryServerIndex ?? 0;
  }

  /**
   * Set primary server index
   */
  static async setPrimaryServerIndex(index: number): Promise<void> {
    if (typeof index !== 'number' || index < 0) {
      throw new ValidationError('Primary server index must be a non-negative number');
    }

    await this.set({ [STORAGE_KEYS.PRIMARY_SERVER_INDEX]: index });
  }

  /**
   * Get boolean setting with default value
   */
  static async getBooleanSetting(
    key: keyof typeof STORAGE_KEYS,
    defaultValue = false
  ): Promise<boolean> {
    const storageKey = STORAGE_KEYS[key];
    const data = await this.get<Record<string, boolean>>([storageKey]);
    return data[storageKey] ?? defaultValue;
  }

  /**
   * Set boolean setting
   */
  static async setBooleanSetting(
    key: keyof typeof STORAGE_KEYS,
    value: boolean
  ): Promise<void> {
    const storageKey = STORAGE_KEYS[key];
    await this.set({ [storageKey]: value });
  }

  /**
   * Get all settings
   */
  static async getAllSettings(): Promise<StorageData> {
    const data = await this.get<StorageData>(null);

    // Apply defaults for missing values
    return {
      connections: [],
      primaryServerIndex: 0,
      enable_context_menu: DEFAULTS.ENABLE_CONTEXT_MENU,
      enable_context_menu_with_options: DEFAULTS.ENABLE_CONTEXT_MENU_WITH_OPTIONS,
      enable_keyboard_macro: DEFAULTS.ENABLE_KEYBOARD_MACRO,
      enable_leftclick: DEFAULTS.ENABLE_LEFTCLICK,
      send_cookies: DEFAULTS.SEND_COOKIES,
      intercept_torrent_downloads: DEFAULTS.INTERCEPT_TORRENT_DOWNLOADS,
      enable_debug_logging: DEFAULTS.ENABLE_DEBUG_LOGGING,
      inpage_notification: DEFAULTS.INPAGE_NOTIFICATION,
      link_regex: DEFAULTS.TORRENT_LINK_REGEX,
      popup_width: DEFAULTS.POPUP_WIDTH,
      popup_height: DEFAULTS.POPUP_HEIGHT,
      server_default_labels: {},
      accordion_states: {},
      ...data, // Override with actual stored values
    };
  }

  /**
   * Get server default label
   */
  static async getServerDefaultLabel(serverIndex: number): Promise<string | undefined> {
    const data = await this.get<{ server_default_labels?: Record<string, string> }>([
      STORAGE_KEYS.SERVER_DEFAULT_LABELS,
    ]);

    return data.server_default_labels?.[serverIndex.toString()];
  }

  /**
   * Set server default label
   */
  static async setServerDefaultLabel(
    serverIndex: number,
    label: string
  ): Promise<void> {
    const data = await this.get<{ server_default_labels?: Record<string, string> }>([
      STORAGE_KEYS.SERVER_DEFAULT_LABELS,
    ]);

    const labels = data.server_default_labels || {};
    labels[serverIndex.toString()] = label;

    await this.set({ [STORAGE_KEYS.SERVER_DEFAULT_LABELS]: labels });
  }

  /**
   * Watch for storage changes
   */
  static onChanged(
    callback: (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => void
  ): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        callback(changes);
      }
    });
  }
}
