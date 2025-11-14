import { Logger } from '@/lib/logger/Logger';
import { StorageManager } from '@/lib/storage/StorageManager';
import { SafeMessenger } from '@/lib/messaging/SafeMessenger';
import { OptionsConfig } from './OptionsConfig';
import type { Connection } from '@/types';

const logger = new Logger('OptionsController');

// Global communicator
declare const communicator: any;

export interface ValidationResult {
  isValid: boolean;
  labels?: string[];
}

/**
 * Controls options page logic and communication
 */
export class OptionsController {
  private messenger: SafeMessenger;
  private connections: Connection[] = [];
  private primaryServerIndex = 0;

  constructor() {
    if (typeof communicator === 'undefined') {
      throw new Error('Global communicator not found');
    }
    this.messenger = new SafeMessenger(communicator);
  }

  /**
   * Initialize controller
   */
  async initialize(): Promise<void> {
    logger.debug('Initializing options controller');

    return new Promise((resolve, reject) => {
      communicator.observeConnect(() => {
        logger.info('Connected to background');
        resolve();
      });

      communicator.observeDisconnect(() => {
        logger.warn('Disconnected from background');
      });

      try {
        communicator.init(true);
        logger.debug('Communicator initialized');
      } catch (error) {
        logger.error('Failed to initialize communicator:', error);
        reject(error);
      }
    });
  }

  /**
   * Load all connections
   */
  async loadConnections(): Promise<Connection[]> {
    try {
      this.connections = await StorageManager.getConnections();
      this.primaryServerIndex = await StorageManager.getPrimaryServerIndex();
      logger.debug('Loaded connections:', this.connections);
      return this.connections;
    } catch (error) {
      logger.error('Failed to load connections:', error);
      return [];
    }
  }

  /**
   * Save connections
   */
  async saveConnections(connections: Connection[], primaryIndex: number): Promise<void> {
    try {
      await StorageManager.set({
        connections,
        primaryServerIndex: primaryIndex,
      });
      this.connections = connections;
      this.primaryServerIndex = primaryIndex;
      logger.debug('Saved connections');
    } catch (error) {
      logger.error('Failed to save connections:', error);
      throw error;
    }
  }

  /**
   * Load options
   */
  async loadOptions(): Promise<Record<string, any>> {
    try {
      const data = await StorageManager.get(null);
      logger.debug('Loaded options:', data);
      return data as Record<string, any>;
    } catch (error) {
      logger.error('Failed to load options:', error);
      return {};
    }
  }

  /**
   * Save options
   */
  async saveOptions(options: Record<string, any>): Promise<void> {
    try {
      await StorageManager.set(options);
      logger.debug('Saved options');
    } catch (error) {
      logger.error('Failed to save options:', error);
      throw error;
    }
  }

  /**
   * Validate server credentials and get labels
   */
  async validateServer(url: string, password: string): Promise<ValidationResult> {
    return new Promise((resolve, reject) => {
      logger.debug('Validating server:', url);

      // Ensure communicator is connected (reconnect if needed)
      if (!communicator._Connected) {
        logger.important('Communicator not connected, will attempt reconnect');
        reject(new Error('Background connection lost. Please refresh the page.'));
        return;
      }

      // Set a timeout to reject if no response (10 seconds)
      const timeoutId = setTimeout(() => {
        logger.error('Validation request timed out');
        reject(new Error('Request timed out waiting for response'));
      }, 10000);

      this.messenger.send(
        {
          method: 'plugins-getinfo',
          url,
          password,
          force_check: true,
        },
        (response: any) => {
          clearTimeout(timeoutId);
          logger.debug('Validation response:', response);

          if (!response) {
            logger.error('No response received');
            reject(new Error('No response from background script'));
            return;
          }

          if (response.error) {
            logger.error('Validation error:', response.error);
            reject(new Error(response.message || 'Validation failed'));
            return;
          }

          // Check if validation was successful
          const isValid = response && response.value && !response.error;

          // The response.value is a PluginInfo object with { labels, hasLabelPlugin, etc }
          const labels = response?.value?.labels || [];

          logger.debug('Parsed validation result:', { isValid, labelCount: labels.length });

          resolve({
            isValid,
            labels: isValid ? labels : undefined,
          });
        }
      );
    });
  }

  /**
   * Load labels for a server
   * Note: This does NOT validate the server, it just tries to fetch labels
   * Use validateServer() explicitly if you want to test the connection
   */
  async loadLabelsForServer(serverIndex: number): Promise<string[]> {
    if (serverIndex >= this.connections.length) {
      logger.warn('Server index out of range:', serverIndex);
      return [];
    }

    const connection = this.connections[serverIndex];
    if (!connection.url || !OptionsConfig.URL_REGEX.test(connection.url)) {
      logger.debug('Skipping label load for invalid/empty server URL at index:', serverIndex);
      return [];
    }

    // Don't auto-validate on page load, just return empty array
    // Labels will be populated when user explicitly tests connection
    logger.debug('Skipping auto-validation for server:', serverIndex);
    return [];
  }

  /**
   * Get default label for a server
   */
  async getDefaultLabel(serverIndex: number): Promise<string> {
    try {
      const data = await StorageManager.get<{ server_default_labels?: Record<number, string> }>([
        'server_default_labels',
      ]);
      const labels = data.server_default_labels || {};
      return labels[serverIndex] || '';
    } catch (error) {
      logger.error('Failed to get default label:', error);
      return '';
    }
  }

  /**
   * Set default label for a server
   */
  async setDefaultLabel(serverIndex: number, label: string): Promise<void> {
    try {
      const data = await StorageManager.get<{ server_default_labels?: Record<number, string> }>([
        'server_default_labels',
      ]);
      const labels = data.server_default_labels || {};

      if (label) {
        labels[serverIndex] = label;
      } else {
        delete labels[serverIndex];
      }

      await StorageManager.set({ server_default_labels: labels });
      logger.debug('Set default label for server:', serverIndex, label);
    } catch (error) {
      logger.error('Failed to set default label:', error);
      throw error;
    }
  }

  /**
   * Remove default label for a server
   */
  async removeDefaultLabel(serverIndex: number): Promise<void> {
    try {
      const data = await StorageManager.get<{ server_default_labels?: Record<number, string> }>([
        'server_default_labels',
      ]);
      const labels = data.server_default_labels || {};

      delete labels[serverIndex];

      // Shift all higher indexes down
      for (let i = serverIndex + 1; i <= this.connections.length; i++) {
        if (labels[i]) {
          labels[i - 1] = labels[i];
          delete labels[i];
        }
      }

      await StorageManager.set({ server_default_labels: labels });
      logger.debug('Removed default label for server:', serverIndex);
    } catch (error) {
      logger.error('Failed to remove default label:', error);
      throw error;
    }
  }

  /**
   * Get accordion states
   */
  async getAccordionStates(): Promise<Record<string, boolean>> {
    try {
      const data = await StorageManager.get<{ accordion_states?: Record<string, boolean> }>([
        'accordion_states',
      ]);
      return data.accordion_states || {
        options: true, // Default expanded
        advanced: false, // Default collapsed
      };
    } catch (error) {
      logger.error('Failed to get accordion states:', error);
      return {};
    }
  }

  /**
   * Save accordion state
   */
  async saveAccordionState(id: string, expanded: boolean): Promise<void> {
    try {
      const states = await this.getAccordionStates();
      states[id] = expanded;
      await StorageManager.set({ accordion_states: states });
      logger.debug('Saved accordion state:', id, expanded);
    } catch (error) {
      logger.error('Failed to save accordion state:', error);
    }
  }

  /**
   * Get connections
   */
  getConnections(): Connection[] {
    return this.connections;
  }

  /**
   * Get primary server index
   */
  getPrimaryServerIndex(): number {
    return this.primaryServerIndex;
  }
}
