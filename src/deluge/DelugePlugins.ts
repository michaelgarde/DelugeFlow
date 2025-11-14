import { PluginError } from '@/lib/errors/DelugeErrors';
import { DELUGE_METHODS } from '@/config/constants';
import { Logger } from '@/lib/logger/Logger';
import type { DelugeRequest } from './DelugeRequest';
import type { PluginInfo, PluginOptions } from '@/types';

const logger = new Logger('DelugePlugins');

interface LabelPlusLabel {
  name: string;
  [key: string]: unknown;
}

/**
 * Manages Deluge plugins and label operations
 */
export class DelugePlugins {
  private pluginInfo: PluginInfo = {};
  private plugins: string[] = [];

  constructor(private request: DelugeRequest) {}

  /**
   * Get list of enabled plugins
   */
  async getPlugins(): Promise<string[]> {
    logger.debug('Requesting plugins from server...');

    try {
      const payload = await this.request.request<string[] | Record<string, boolean>>(
        DELUGE_METHODS.WEB_GET_PLUGINS,
        []
      );

      logger.debug('Raw plugin response:', payload);

      if (!payload.result) {
        logger.error('Get plugins failed - no result:', payload);
        throw new PluginError('No plugin data received');
      }

      // Handle both array and object formats
      let plugins: string[];
      if (Array.isArray(payload.result)) {
        logger.debug('Plugin result is array:', payload.result);
        plugins = payload.result;
      } else if (payload.result && typeof payload.result === 'object') {
        logger.debug('Plugin result is object:', payload.result);
        // Object format: { "Label": true, "AutoAdd": false, ... }
        const pluginObj = payload.result as Record<string, boolean>;
        plugins = Object.keys(pluginObj).filter(key => pluginObj[key]);
      } else {
        logger.warn('Unexpected plugin result format:', payload.result);
        plugins = [];
      }

      logger.debug('Processed plugin list:', plugins);
      this.plugins = plugins;
      return plugins;
    } catch (error) {
      logger.error('Failed to get plugins:', error);
      throw new PluginError('Failed to get plugin list', error as Error);
    }
  }

  /**
   * Get available labels with multiple fallback strategies
   */
  async getLabels(): Promise<string[]> {
    logger.debug('Getting labels with fallbacks...');

    try {
      // Strategy 1: Try standard label.get_labels
      const labels = await this.tryStandardLabels();
      if (labels.length > 0) {
        logger.debug('Retrieved labels using standard method:', labels);
        return labels;
      }
    } catch (error) {
      logger.debug('Standard label method failed, trying fallbacks:', error);
    }

    try {
      // Strategy 2: Try older Deluge version method (label.get_config)
      const labels = await this.tryLegacyLabels();
      if (labels.length > 0) {
        logger.debug('Retrieved labels using legacy method:', labels);
        return labels;
      }
    } catch (error) {
      logger.debug('Legacy label method failed, trying LabelPlus:', error);
    }

    try {
      // Strategy 3: Try LabelPlus plugin
      const labels = await this.tryLabelPlusLabels();
      if (labels.length > 0) {
        logger.debug('Retrieved labels using LabelPlus:', labels);
        return labels;
      }
    } catch (error) {
      logger.debug('LabelPlus method failed:', error);
    }

    logger.warn('All label retrieval methods failed, returning empty array');
    return [];
  }

  /**
   * Strategy 1: Standard label.get_labels method
   */
  private async tryStandardLabels(): Promise<string[]> {
    const payload = await this.request.request<string[]>(
      DELUGE_METHODS.LABEL_GET_LABELS,
      []
    );

    logger.debug('Standard label response:', payload);

    if (payload && Array.isArray(payload.result)) {
      return payload.result;
    }

    if (payload && payload.error) {
      logger.warn('Standard label method error:', payload.error);
      throw new Error('Standard method failed: ' + payload.error.message);
    }

    return [];
  }

  /**
   * Strategy 2: Legacy label.get_config method (older Deluge versions)
   */
  private async tryLegacyLabels(): Promise<string[]> {
    const payload = await this.request.request<{ labels?: string[] }>(
      DELUGE_METHODS.LABEL_GET_CONFIG,
      []
    );

    logger.debug('Legacy label response:', payload);

    if (payload.result && Array.isArray(payload.result.labels)) {
      return payload.result.labels;
    }

    throw new Error('Legacy method returned no labels');
  }

  /**
   * Strategy 3: LabelPlus plugin method
   */
  private async tryLabelPlusLabels(): Promise<string[]> {
    const payload = await this.request.request<Record<string, LabelPlusLabel>>(
      DELUGE_METHODS.LABELPLUS_GET_LABELS,
      []
    );

    logger.debug('LabelPlus response:', payload);

    if (payload.result && typeof payload.result === 'object') {
      // LabelPlus returns an object with label IDs as keys
      const labels = Object.values(payload.result)
        .filter((label): label is LabelPlusLabel =>
          typeof label === 'object' &&
          label !== null &&
          'name' in label &&
          typeof label.name === 'string'
        )
        .map(label => label.name);

      return labels;
    }

    throw new Error('LabelPlus method returned no labels');
  }

  /**
   * Get complete plugin info including labels
   */
  async getPluginInfo(): Promise<PluginInfo> {
    const plugins = await this.getPlugins();

    const pluginInfo: PluginInfo = {
      hasLabelPlugin: plugins.includes('Label') || plugins.includes('label'),
      hasLabelPlusPlugin: plugins.includes('LabelPlus') || plugins.includes('labelplus'),
    };

    // Get labels if label plugin is available
    if (pluginInfo.hasLabelPlugin || pluginInfo.hasLabelPlusPlugin) {
      try {
        pluginInfo.labels = await this.getLabels();
      } catch (error) {
        logger.error('Failed to get labels:', error);
        pluginInfo.labels = [];
      }
    } else {
      pluginInfo.labels = [];
    }

    this.pluginInfo = pluginInfo;
    logger.debug('Final plugin info:', pluginInfo);
    return pluginInfo;
  }

  /**
   * Process plugin options after adding torrent (e.g., set labels)
   */
  async processPluginOptions(
    torrentHash: string,
    plugins?: PluginOptions
  ): Promise<void> {
    if (!plugins || !torrentHash) {
      return;
    }

    const promises: Promise<void>[] = [];

    // Handle Label plugin
    if (plugins.label && typeof plugins.label === 'string') {
      logger.debug('Setting label:', plugins.label);

      promises.push(
        this.request
          .request(DELUGE_METHODS.LABEL_SET_TORRENT, [torrentHash, plugins.label])
          .then(() => {
            logger.info('Label set successfully');
          })
          .catch(error => {
            logger.error('Error setting label:', error);
            // Don't fail the whole operation if label setting fails
          })
      );
    }

    // Handle other plugin options here if needed in the future
    // Example: Auto-add, Execute, etc.

    await Promise.all(promises);
  }

  /**
   * Get cached plugin info
   */
  getCachedPluginInfo(): PluginInfo {
    return this.pluginInfo;
  }

  /**
   * Get cached plugins list
   */
  getCachedPlugins(): string[] {
    return this.plugins;
  }

  /**
   * Check if label plugin is available
   */
  hasLabelPlugin(): boolean {
    return (
      this.plugins.includes('Label') ||
      this.plugins.includes('label') ||
      this.plugins.includes('LabelPlus') ||
      this.plugins.includes('labelplus')
    );
  }
}
