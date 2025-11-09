import { Logger } from '@/lib/logger/Logger';
import { SafeMessenger } from '@/lib/messaging/SafeMessenger';
import { StorageManager } from '@/lib/storage/StorageManager';
import { NotificationManager } from '@/lib/notifications/NotificationManager';
import { EventHandlers, SiteMeta } from './handlers/EventHandlers';
import { Modal, TorrentRequest, FormData } from './ui/Modal';
import type { Connection } from '@/types';

const logger = new Logger('ContentHandler');

// Global communicator is injected by lib/controller_communicator.js
declare const communicator: any;

/**
 * Main coordinator for content script functionality
 * Manages communication, event handling, and UI for torrent interception
 */
export class ContentHandler {
  private messenger: SafeMessenger;
  private eventHandlers: EventHandlers | null = null;
  private modal: Modal | null = null;
  private siteMeta: SiteMeta;
  private isInitialized = false;
  private cookies: Record<string, string> = {};
  private connected = false;

  constructor() {
    this.siteMeta = {
      DOMAIN: window.location.host,
      TORRENT_REGEX: '^magnet:', // Default: only match magnet links
      TORRENT_URL_ATTRIBUTE: 'href',
      INSTALLED: false,
    };

    // Initialize messenger with global communicator
    if (typeof communicator === 'undefined') {
      throw new Error('Global communicator not found');
    }
    this.messenger = new SafeMessenger(communicator);

    logger.debug('ContentHandler created for domain:', this.siteMeta.DOMAIN);
  }

  /**
   * Initialize content handler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Already initialized');
      return;
    }

    try {
      logger.info('Starting initialization');

      // Check environment
      if (!this.checkEnvironment()) {
        logger.error('Environment check failed');
        return;
      }

      // Initialize communication
      await this.initializeCommunication();

      // Get initial cookies
      await this.fetchCookies();

      // Initialize site functionality
      await this.initializeSite();

      this.isInitialized = true;
      logger.info('Initialization complete');
    } catch (error) {
      logger.error('Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check if environment is suitable
   */
  private checkEnvironment(): boolean {
    if (!document || !document.addEventListener || !document.body) {
      logger.error('Environment check failed - missing document or body');
      return false;
    }

    logger.debug('Environment check passed');
    return true;
  }

  /**
   * Initialize communication with background script
   */
  private async initializeCommunication(): Promise<void> {
    logger.debug('Initializing communication');

    return new Promise((resolve, reject) => {
      // Set up communicator observers
      communicator
        .observeConnect(() => {
          logger.info('Connected to background');
          this.connected = true;
          resolve();
        })
        .observeDisconnect(() => {
          logger.warn('Disconnected from background');
          this.connected = false;
          if (this.isInitialized) {
            this.cleanup();
          }
        })
        .observeMessage(this.handleMessage.bind(this));

      // Initialize connection
      try {
        communicator.init(true); // true = isTab
        logger.debug('Communicator initialized');
      } catch (error) {
        logger.error('Failed to initialize communicator:', error);
        reject(error);
      }

      // Set timeout for connection
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Fetch cookies for current page
   */
  private async fetchCookies(): Promise<void> {
    return new Promise((resolve) => {
      this.messenger.send(
        {
          action: 'getCookies',
          url: window.location.href,
        },
        (response: any) => {
          if (response?.cookies) {
            this.cookies = response.cookies;
            // Store for modal access
            (window as any).lastTorrentCookies = this.cookies;
            logger.debug('Cookies fetched:', this.cookies);
          }
          resolve();
        }
      );
    });
  }

  /**
   * Initialize site-specific functionality
   */
  private async initializeSite(): Promise<void> {
    logger.debug('Initializing site functionality');

    // Get link regex configuration
    const data = await StorageManager.get<{ link_regex?: string }>(['link_regex']);
    const linkRegex = data.link_regex || '^magnet:';
    this.siteMeta.TORRENT_REGEX = linkRegex;
    logger.debug('Using torrent regex:', this.siteMeta.TORRENT_REGEX);

    // Check if we're on a Deluge UI page
    const isDelugeUI = await this.checkIfDelugeUI();
    if (isDelugeUI) {
      logger.warn('On Deluge UI page - not installing handlers');
      return;
    }

    // Initialize UI components
    this.initializeModal();

    // Install event handlers
    this.installEventHandlers();

    logger.info('Site functionality initialized');
  }

  /**
   * Check if current page is a Deluge UI
   */
  private async checkIfDelugeUI(): Promise<boolean> {
    try {
      const connections = await StorageManager.getConnections();
      const currentUrl = new URL(window.location.href);
      const currentPathname = currentUrl.pathname.replace(/\/$/, '');

      for (const conn of connections) {
        try {
          const connUrl = new URL(conn.url);
          const connPathname = connUrl.pathname.replace(/\/$/, '');

          if (
            currentUrl.hostname === connUrl.hostname &&
            currentPathname === connPathname
          ) {
            logger.debug('Detected Deluge UI page:', conn.url);
            return true;
          }
        } catch (error) {
          logger.warn('Invalid connection URL:', conn.url);
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking Deluge UI:', error);
      return false;
    }
  }

  /**
   * Initialize modal component
   */
  private initializeModal(): void {
    this.modal = new Modal(this.messenger, this.handleModalSubmit.bind(this));
    this.modal.init();
    logger.debug('Modal initialized');
  }

  /**
   * Install event handlers for torrent links
   */
  private installEventHandlers(): void {
    if (this.eventHandlers) {
      logger.debug('Event handlers already installed');
      return;
    }

    this.eventHandlers = new EventHandlers(
      this.siteMeta,
      this.handleTorrentLink.bind(this)
    );
    this.eventHandlers.install();

    logger.info('Event handlers installed');
  }

  /**
   * Handle torrent link click
   */
  private handleTorrentLink(url: string, event: Event, withOptions: boolean): void {
    logger.debug('Torrent link clicked:', { url, withOptions });

    // Store cookies for this torrent
    (window as any).lastTorrentCookies = this.cookies;
    (window as any).lastTorrentUrl = url;
    (window as any).lastTorrentDomain = this.siteMeta.DOMAIN;

    if (withOptions) {
      // Show modal for options
      this.showModal({
        url,
        domain: this.siteMeta.DOMAIN,
        info: { name: 'Add Torrent' },
      });
    } else {
      // Add directly without options
      this.addTorrent({
        method: 'addlink-todeluge',
        url,
        domain: this.siteMeta.DOMAIN,
        options: {},
        plugins: {},
        cookies: this.cookies,
      });
    }
  }

  /**
   * Show modal with torrent options
   */
  private showModal(request: TorrentRequest): void {
    if (!this.modal) {
      logger.error('Modal not initialized');
      return;
    }

    logger.debug('Showing modal for:', request);
    this.modal.show(request);
  }

  /**
   * Handle modal form submission
   */
  private handleModalSubmit(data: FormData): void {
    logger.debug('Modal submitted with data:', data);

    // Save selected label as default
    if (data.plugins.Label) {
      StorageManager.set({ default_label: data.plugins.Label });
    }

    // Add torrent
    this.addTorrent(data);
  }

  /**
   * Add torrent to Deluge
   */
  private addTorrent(data: FormData): void {
    logger.debug('Adding torrent:', data);

    // Show loading toast
    const loadingId = NotificationManager.showToast({
      message: 'Adding torrent to Deluge...',
      type: 'info',
      duration: 0, // Don't auto-dismiss
    });

    this.messenger.send(
      {
        method: 'addlink-todeluge',
        url: data.url,
        domain: data.domain,
        serverIndex: data.serverIndex,
        options: data.options,
        plugins: data.plugins,
        cookies: data.cookies,
      },
      (response: any) => {
        // Remove loading toast
        NotificationManager.hideToast(loadingId);

        if (response?.error) {
          logger.error('Error adding torrent:', response.error);

          // Check for specific error cases
          if (response.error.includes('already in session')) {
            NotificationManager.showToast({
              message: 'Torrent already exists in Deluge',
              type: 'warning',
              duration: 5000,
            });
          } else {
            NotificationManager.showToast({
              message: `Error adding torrent: ${response.error}`,
              type: 'error',
              duration: 5000,
            });
          }
        } else {
          logger.info('Torrent added successfully');

          // Build success message
          let message = 'Torrent added successfully';
          if (data.plugins.Label) {
            message += ` with label "${data.plugins.Label}"`;
          }
          if (data.options.add_paused) {
            message += ' (paused)';
          }

          NotificationManager.showToast({
            message,
            type: 'success',
            duration: 5000,
          });
        }
      }
    );
  }

  /**
   * Handle messages from background script
   */
  private async handleMessage(message: any, sendResponse: (response: any) => void): Promise<void> {
    logger.debug('Received message:', message);

    try {
      switch (message.method) {
        case 'context-menu-click':
          logger.debug('Processing context menu click');
          this.showModal({
            url: message.url,
            domain: this.siteMeta.DOMAIN,
            info: { name: 'Add Torrent' },
          });
          sendResponse({ success: true });
          break;

        case 'add_dialog':
        case 'addlink-todeluge:withoptions':
          logger.debug('Showing add dialog');
          this.showModal({
            url: message.url,
            domain: message.domain || this.siteMeta.DOMAIN,
            info: message.info || { name: 'Add Torrent' },
          });
          sendResponse({ success: true });
          break;

        default:
          logger.debug('Unhandled message type:', message.method);
          sendResponse({ error: 'Unhandled message type' });
          break;
      }
    } catch (error) {
      logger.error('Error handling message:', error);
      sendResponse({ error: (error as Error).message });
    }
  }

  /**
   * Cleanup event handlers and UI
   */
  cleanup(): void {
    logger.debug('Cleaning up content handler');

    if (this.eventHandlers) {
      this.eventHandlers.cleanup();
      this.eventHandlers = null;
    }

    if (this.modal) {
      this.modal.cleanup();
      this.modal = null;
    }

    // Clear all toasts
    NotificationManager.clearAll();

    this.isInitialized = false;
    logger.info('Cleanup complete');
  }
}

// Auto-initialize when script loads
(async () => {
  try {
    const handler = new ContentHandler();
    await handler.initialize();
    logger.info('Content handler auto-initialized');

    // Store reference for debugging
    (window as any).delugeflowHandler = handler;
  } catch (error) {
    logger.error('Failed to auto-initialize content handler:', error);
  }
})();
