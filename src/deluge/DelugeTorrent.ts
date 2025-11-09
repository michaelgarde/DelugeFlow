import { TorrentError } from '@/lib/errors/DelugeErrors';
import { DELUGE_METHODS } from '@/config/constants';
import { Logger } from '@/lib/logger/Logger';
import type { DelugeRequest } from './DelugeRequest';
import type { DelugePlugins } from './DelugePlugins';
import type { TorrentOptions, PluginOptions, CookieMap } from '@/types';

const logger = new Logger('DelugeTorrent');

/**
 * Manages torrent operations (add, retrieve info, etc.)
 */
export class DelugeTorrent {
  constructor(
    private request: DelugeRequest,
    private plugins: DelugePlugins
  ) {}

  /**
   * Add a torrent (auto-detects magnet vs URL)
   */
  async addTorrent(
    url: string,
    cookies?: CookieMap,
    plugins?: PluginOptions,
    options?: TorrentOptions
  ): Promise<string> {
    logger.info('Adding torrent:', url);

    // Determine if magnet or URL
    if (url.startsWith('magnet:')) {
      return this.addMagnet(url, plugins, options);
    }

    return this.addUrl(url, cookies, plugins, options);
  }

  /**
   * Add a magnet link
   */
  async addMagnet(
    magnetUri: string,
    plugins?: PluginOptions,
    options?: TorrentOptions
  ): Promise<string> {
    logger.debug('Adding magnet link');

    // Build parameters
    const params = this.buildTorrentOptions(options);

    try {
      const payload = await this.request.request<string>(
        DELUGE_METHODS.CORE_ADD_TORRENT_MAGNET,
        [magnetUri, params]
      );

      logger.debug('Add magnet response:', payload);

      if (!payload) {
        throw new TorrentError('Empty response from server');
      }

      if (payload.error) {
        // Check if the server doesn't support the magnet API (older Deluge versions)
        if (
          payload.error.message &&
          (payload.error.message.includes('Unknown method') ||
            payload.error.message.includes('add_torrent_magnet'))
        ) {
          logger.debug('Magnet API not supported, falling back to URL method');
          return this.addUrl(magnetUri, undefined, plugins, options);
        }

        // Handle other specific magnet-related errors
        if (payload.error.message && payload.error.message.includes('Unsupported scheme')) {
          logger.error('Unsupported magnet scheme');
          throw new TorrentError('Invalid magnet link format - unsupported scheme');
        }

        throw new TorrentError(payload.error.message || 'Failed to add magnet link');
      }

      if (!payload.result) {
        throw new TorrentError('Server refused magnet link');
      }

      // Success - process plugin options if needed
      const torrentHash = payload.result;
      if (plugins) {
        await this.plugins.processPluginOptions(torrentHash, plugins);
      }

      return torrentHash;
    } catch (error) {
      // If the magnet API fails completely, try the URL method as fallback
      if (error instanceof Error && error.message.includes('Unknown method')) {
        logger.debug('Falling back to URL method due to API error');
        return this.addUrl(magnetUri, undefined, plugins, options);
      }
      throw error;
    }
  }

  /**
   * Add a torrent via URL
   */
  async addUrl(
    url: string,
    cookies?: CookieMap,
    plugins?: PluginOptions,
    options?: TorrentOptions
  ): Promise<string> {
    logger.debug('Adding torrent via URL');

    // Build parameters
    const params = this.buildTorrentOptions(options);

    // Build headers object
    const headers: Record<string, string> = {};
    if (cookies) {
      // Convert cookie map to cookie string
      headers.Cookie = Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
    }

    try {
      const payload = await this.request.request<string>(
        DELUGE_METHODS.CORE_ADD_TORRENT_URL,
        [url, params, headers]
      );

      logger.debug('Add torrent URL response:', payload);

      if (!payload) {
        throw new TorrentError('Empty response from server');
      }

      if (payload.error) {
        // Special handling for Deluge 1.x API difference
        if (
          payload.error.message &&
          (payload.error.message.includes('takes exactly 3 arguments') ||
            payload.error.message.includes('takes exactly three arguments'))
        ) {
          logger.debug('Detected Deluge 1.x API, retrying with adjusted parameters');

          // Deluge 1.x has a different API signature (doesn't support headers)
          const retryPayload = await this.request.request<string>(
            DELUGE_METHODS.CORE_ADD_TORRENT_URL,
            [url, params, {}]
          );

          if (!retryPayload.result) {
            throw new TorrentError('Server refused torrent');
          }

          const torrentHash = retryPayload.result;
          if (plugins) {
            await this.plugins.processPluginOptions(torrentHash, plugins);
          }

          return torrentHash;
        }

        // If we get a 403, it's likely the URL is inaccessible to Deluge
        if (payload.error.message && payload.error.message.includes('403 Forbidden')) {
          const error = new TorrentError(
            'Unable to access torrent - the site may require authentication or cookies'
          );
          (error as any).code = 403;
          throw error;
        }

        throw new TorrentError(payload.error.message || 'Failed to add torrent');
      }

      if (!payload.result) {
        throw new TorrentError('Server refused torrent');
      }

      // Success - process plugin options if needed
      const torrentHash = payload.result;
      if (plugins) {
        await this.plugins.processPluginOptions(torrentHash, plugins);
      }

      return torrentHash;
    } catch (error) {
      logger.error('Failed to add torrent via URL:', error);
      throw error;
    }
  }

  /**
   * Add a torrent from file data (base64 encoded)
   */
  async addFile(
    fileData: string,
    filename: string,
    plugins?: PluginOptions,
    options?: TorrentOptions
  ): Promise<string> {
    logger.debug('Adding torrent file:', filename);

    // Build parameters
    const params = this.buildTorrentOptions(options);

    try {
      const payload = await this.request.request<string>(
        DELUGE_METHODS.CORE_ADD_TORRENT_FILE,
        [filename, fileData, params]
      );

      logger.debug('Add torrent file response:', payload);

      if (!payload) {
        throw new TorrentError('Empty response from server');
      }

      if (payload.error) {
        logger.error('Error from Deluge:', payload.error);

        // Handle "already in session" error
        if (payload.error.message && payload.error.message.includes('already in session')) {
          logger.warn('Torrent already exists in Deluge');
          const error = new TorrentError('Torrent already added to Deluge');
          (error as any).code = 'ALREADY_EXISTS';
          throw error;
        }

        throw new TorrentError(payload.error.message || 'Failed to add torrent file');
      }

      if (!payload.result) {
        throw new TorrentError('Server refused torrent file');
      }

      // Success - process plugin options if needed
      const torrentHash = payload.result;
      if (plugins) {
        await this.plugins.processPluginOptions(torrentHash, plugins);
      }

      return torrentHash;
    } catch (error) {
      logger.error('Failed to add torrent file:', error);
      throw error;
    }
  }

  /**
   * Build torrent options object for Deluge API
   */
  private buildTorrentOptions(options?: TorrentOptions): Record<string, unknown> {
    if (!options) {
      return {};
    }

    const params: Record<string, unknown> = {};

    // Map common options
    if (options.add_paused !== undefined) {
      params.add_paused = Boolean(options.add_paused);
    }

    if (options.download_location) {
      params.download_location = options.download_location;
    }

    if (options.move_completed !== undefined) {
      params.move_completed = Boolean(options.move_completed);
    }

    if (options.move_completed_path) {
      params.move_completed_path = options.move_completed_path;
    }

    if (options.max_download_speed !== undefined) {
      params.max_download_speed = options.max_download_speed;
    }

    if (options.max_upload_speed !== undefined) {
      params.max_upload_speed = options.max_upload_speed;
    }

    if (options.max_connections !== undefined) {
      params.max_connections = options.max_connections;
    }

    if (options.max_upload_slots !== undefined) {
      params.max_upload_slots = options.max_upload_slots;
    }

    if (options.prioritize_first_last_pieces !== undefined) {
      params.prioritize_first_last_pieces = Boolean(options.prioritize_first_last_pieces);
    }

    return params;
  }

  /**
   * Get torrent info from URL (for preview/validation)
   * Note: This is currently a placeholder - implementation would need
   * to download and parse the .torrent file
   */
  async getTorrentInfo(url: string, cookieDomain?: string): Promise<any> {
    logger.debug('Getting torrent info for:', url);

    // This would require implementing torrent file download and parsing
    // For now, return basic info
    return {
      url,
      cookieDomain,
      // Additional info would be extracted from .torrent file
    };
  }
}
