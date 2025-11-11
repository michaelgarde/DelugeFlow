import { Logger } from '@/lib/logger/Logger';
import { PopupUI, TorrentDisplay } from './PopupUI';
import type { Connection } from '@/types';

const logger = new Logger('PopupController');

// Global communicator from controller_communicator.js
declare const communicator: any;

/**
 * Controls popup data fetching and state management
 */
export class PopupController {
  private static readonly REFRESH_INTERVAL = 3000; // 3 seconds

  private ui: PopupUI;
  private servers: Connection[] = [];
  private refreshTimers: Map<number, number> = new Map();

  constructor(ui: PopupUI) {
    this.ui = ui;
  }

  /**
   * Initialize controller
   */
  async initialize(): Promise<void> {
    logger.debug('Initializing popup controller');

    // Verify communicator is available
    if (typeof communicator === 'undefined') {
      throw new Error('Global communicator not found');
    }

    // Setup connection observer
    communicator.observeConnect(() => {
      logger.info('Connected to background');
      this.loadServerInfo();
    });

    // Initialize communicator
    communicator.init('popup');

    // Setup cleanup on window unload
    window.addEventListener('unload', () => {
      this.cleanup();
    });

    logger.info('Popup controller initialized');
  }

  /**
   * Load server information
   */
  private loadServerInfo(): void {
    logger.debug('Loading server info');

    communicator.sendMessage(
      {
        method: 'storage-get-connections',
      },
      (response: any) => {
        try {
          const connections = response?.value;
          logger.debug('Received connections:', connections);

          if (connections && Array.isArray(connections)) {
            this.servers = connections;
            this.ui.updateUI(this.servers, this.onServerSwitch.bind(this));
            this.startActiveServerRefresh();
          } else {
            logger.warn('No connections found');
            this.servers = [];
            this.ui.updateUI([], this.onServerSwitch.bind(this));
          }
        } catch (error) {
          logger.error('Error processing server info:', error);
          this.servers = [];
          this.ui.updateUI([], this.onServerSwitch.bind(this));
        }
      }
    );
  }

  /**
   * Handle server switch
   */
  private onServerSwitch(index: number): void {
    logger.debug('Server switched to index:', index);

    // Stop all refresh timers
    this.stopAllRefreshTimers();

    // Start refresh for the new active server
    this.startActiveServerRefresh();
  }

  /**
   * Start refresh timer for active server
   */
  private startActiveServerRefresh(): void {
    const activeIndex = this.ui.getActiveServerIndex();
    const server = this.servers[activeIndex];

    if (!server) {
      logger.warn('No server found at active index:', activeIndex);
      return;
    }

    logger.debug('Starting refresh for server:', activeIndex);

    // Fetch immediately
    this.fetchTorrentData(activeIndex);

    // Setup interval
    const timerId = window.setInterval(() => {
      this.fetchTorrentData(activeIndex);
    }, PopupController.REFRESH_INTERVAL);

    this.refreshTimers.set(activeIndex, timerId);
  }

  /**
   * Stop all refresh timers
   */
  private stopAllRefreshTimers(): void {
    logger.debug('Stopping all refresh timers');

    this.refreshTimers.forEach((timerId) => {
      clearInterval(timerId);
    });

    this.refreshTimers.clear();
  }

  /**
   * Fetch torrent data for a server
   */
  private fetchTorrentData(serverIndex: number): void {
    const server = this.servers[serverIndex];
    if (!server) {
      logger.warn('No server at index:', serverIndex);
      return;
    }

    logger.debug('Fetching torrent data for server:', serverIndex);

    communicator.sendMessage(
      {
        method: 'torrent-list',
        server_index: serverIndex,
      },
      (response: any) => {
        if (response && response.value) {
          logger.debug('Received torrent data:', response.value);
          this.ui.displayTorrents(response.value as TorrentDisplay[], serverIndex);
        } else {
          logger.warn('No torrent data received for server:', serverIndex);
          this.ui.showError(serverIndex, 'Could not retrieve torrent data');
        }
      }
    );
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    logger.debug('Cleaning up popup controller');
    this.stopAllRefreshTimers();
    logger.info('Popup controller cleaned up');
  }
}
