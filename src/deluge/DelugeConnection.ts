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
      this.request = new DelugeRequest(connection.url, this.auth);
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
