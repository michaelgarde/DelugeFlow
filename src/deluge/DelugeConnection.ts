import { DelugeAuth } from './DelugeAuth';
import { DelugeRequest } from './DelugeRequest';
import { DelugeDaemon } from './DelugeDaemon';
import { DelugePlugins } from './DelugePlugins';
import { DelugeTorrent } from './DelugeTorrent';
import { StorageManager } from '@/lib/storage/StorageManager';
import { NotificationManager } from '@/lib/notifications/NotificationManager';
import { ServerConfigError } from '@/lib/errors/DelugeErrors';
import { Logger } from '@/lib/logger/Logger';
import type { Connection, PluginInfo, TorrentOptions, PluginOptions, CookieMap } from '@/types';

const logger = new Logger('DelugeConnection');

/**
 * Main orchestrator class for Deluge connections
 * Composes all the specialized modules and provides public API
 */
export class DelugeConnection {
  private auth: DelugeAuth | null = null;
  private request: DelugeRequest | null = null;
  private daemon: DelugeDaemon | null = null;
  private plugins: DelugePlugins | null = null;
  private torrent: DelugeTorrent | null = null;

  private connections: Connection[] = [];
  private currentServerIndex = 0;
  private isValidating = false;
  private customFetch?: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    this.customFetch = customFetch;
  }

  /**
   * Initialize state from storage
   */
  private async initState(): Promise<void> {
    logger.debug('Initializing state');

    // Load connections and primary server index
    this.connections = await StorageManager.getConnections();
    const primaryIndex = await StorageManager.getPrimaryServerIndex();

    // If no server index specified, use primary
    if (this.currentServerIndex === null || this.currentServerIndex === undefined) {
      this.currentServerIndex = primaryIndex;
    }

    logger.debug('State initialized:', {
      connectionCount: this.connections.length,
      currentIndex: this.currentServerIndex,
    });
  }

  /**
   * Connect to a Deluge server
   * @param serverIndex - Optional server index (uses primary if not specified)
   * @param isValidating - If true, forces fresh login (for options page validation)
   */
  async connectToServer(serverIndex?: number, isValidating = false): Promise<void> {
    if (serverIndex !== undefined) {
      this.currentServerIndex = serverIndex;
    }

    this.isValidating = isValidating;

    // Initialize state
    await this.initState();

    // Get connection for current server
    const connection = this.connections[this.currentServerIndex];
    if (!connection) {
      await NotificationManager.error(
        'Server not configured',
        'Please visit the options page to configure your Deluge server'
      );
      throw new ServerConfigError('No server configured at index ' + this.currentServerIndex);
    }

    logger.info('Connecting to server:', {
      url: this.sanitizeUrl(connection.url),
      index: this.currentServerIndex,
      isValidating: this.isValidating,
    });

    try {
      // Initialize modules
      this.auth = new DelugeAuth(null as any, connection.pass);
      this.request = new DelugeRequest(connection.url, this.auth, this.customFetch);
      this.auth.setRequestHandler(this.request); // Resolve circular dependency

      if (this.isValidating) {
        this.auth.setValidating(true);
      }

      this.daemon = new DelugeDaemon(this.request);
      this.plugins = new DelugePlugins(this.request);
      this.torrent = new DelugeTorrent(this.request, this.plugins);

      // Perform connection sequence
      await this.auth.login(!this.isValidating); // Silent if not validating
      await this.daemon.connectToDaemon();
      await this.daemon.getServerConfig();

      logger.info('Successfully connected to server');
    } catch (error) {
      logger.error('Failed to connect to server:', error);

      if (!this.isValidating) {
        await NotificationManager.error(
          'Connection failed',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      throw error;
    }
  }

  /**
   * Add a torrent (auto-detects magnet vs URL)
   */
  async addTorrent(
    url: string,
    cookies?: CookieMap,
    plugins?: PluginOptions,
    options?: TorrentOptions,
    serverIndex?: number
  ): Promise<void> {
    // Connect to specified server if provided
    if (serverIndex !== undefined) {
      await this.connectToServer(serverIndex);
    }

    // Ensure we're connected
    if (!this.torrent) {
      throw new ServerConfigError('Not connected to server. Call connectToServer() first.');
    }

    try {
      logger.info('Adding torrent:', url);

      const torrentHash = await this.torrent.addTorrent(url, cookies, plugins, options);

      logger.info('Torrent added successfully:', torrentHash);

      await NotificationManager.success(
        'Torrent added to Deluge',
        `Hash: ${torrentHash.substring(0, 8)}...`
      );
    } catch (error) {
      logger.error('Failed to add torrent:', error);

      // Check if "already exists" error
      if (error instanceof Error) {
        if ((error as any).code === 'ALREADY_EXISTS' || error.message.includes('already')) {
          await NotificationManager.warning('Torrent already exists in Deluge');
          return;
        }
      }

      await NotificationManager.error(
        'Error adding torrent',
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  }

  /**
   * Add a torrent from file data
   */
  async addTorrentFile(
    fileData: string,
    filename: string,
    options?: TorrentOptions,
    plugins?: PluginOptions,
    serverIndex?: number
  ): Promise<void> {
    // Connect to specified server if provided
    if (serverIndex !== undefined) {
      await this.connectToServer(serverIndex);
    }

    // Ensure we're connected
    if (!this.torrent) {
      throw new ServerConfigError('Not connected to server. Call connectToServer() first.');
    }

    try {
      logger.info('Adding torrent file:', filename);

      const torrentHash = await this.torrent.addFile(fileData, filename, plugins, options);

      logger.info('Torrent file added successfully:', torrentHash);

      await NotificationManager.success(
        'Torrent added to Deluge',
        `File: ${filename}`
      );
    } catch (error) {
      logger.error('Failed to add torrent file:', error);

      // Check if "already exists" error
      if (error instanceof Error) {
        if ((error as any).code === 'ALREADY_EXISTS' || error.message.includes('already')) {
          await NotificationManager.warning('Torrent already exists in Deluge');
          return;
        }
      }

      await NotificationManager.error(
        'Error adding torrent',
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  }

  /**
   * Get plugin information (labels, etc.)
   */
  async getPluginInfo(silent = false): Promise<PluginInfo> {
    try {
      await this.connectToServer(undefined, false);

      if (!this.plugins) {
        throw new ServerConfigError('Plugins module not initialized');
      }

      return await this.plugins.getPluginInfo();
    } catch (error) {
      if (!silent) {
        logger.error('Failed to get plugin info:', error);
      }
      throw error;
    }
  }

  /**
   * Get list of available servers
   */
  async getAvailableServers(): Promise<Connection[]> {
    return await StorageManager.getConnections();
  }

  /**
   * Validate server and get plugin info with arbitrary credentials
   * Used by options page to test new server connections
   */
  async validateServerAndGetPlugins(url: string, password: string): Promise<PluginInfo> {
    logger.debug('Validating server:', this.sanitizeUrl(url));

    // Create temporary modules for validation
    const auth = new DelugeAuth(null as any, password);
    const request = new DelugeRequest(url, auth, this.customFetch);
    auth.setRequestHandler(request);
    auth.setValidating(true);

    const daemon = new DelugeDaemon(request);
    const plugins = new DelugePlugins(request);

    try {
      // Perform connection sequence
      await auth.login(true); // Silent login
      await daemon.connectToDaemon();
      const pluginInfo = await plugins.getPluginInfo();

      logger.debug('Server validation successful');
      return pluginInfo;
    } catch (error) {
      logger.error('Server validation failed:', error);
      throw error;
    }
  }

  /**
   * Get torrent list for a specific server
   */
  async getTorrentList(serverIndex?: number): Promise<any[]> {
    // Connect to specified server if provided
    if (serverIndex !== undefined) {
      await this.connectToServer(serverIndex);
    }

    if (!this.request) {
      throw new ServerConfigError('Not connected to server');
    }

    try {
      const response = await this.request.request<any>('web.update_ui', [
        ['name', 'state', 'progress', 'eta', 'download_payload_rate', 'upload_payload_rate', 'time_added'],
        {}
      ]);

      // Convert the response format to array
      const torrents: any[] = [];
      const result = response.result || response;
      if (result && result.torrents) {
        for (const [hash, data] of Object.entries(result.torrents)) {
          torrents.push({
            hash,
            ...(data as object),
          });
        }
      }

      return torrents;
    } catch (error) {
      logger.error('Failed to get torrent list:', error);
      throw error;
    }
  }

  /**
   * Sanitize URL for logging (remove credentials)
   */
  private sanitizeUrl(url: string): string {
    return url.replace(/:[^\/]+@/, ':*****@');
  }
}

/**
 * Singleton instance for backward compatibility with old code
 */
export const delugeConnection = new DelugeConnection();
