import { Logger } from '@/lib/logger/Logger';
import { StorageManager } from '@/lib/storage/StorageManager';
import type { Connection } from '@/types';

const logger = new Logger('PopupUI');

export interface TorrentDisplay {
  name: string;
  progress: number;
  download_speed: number;
  upload_speed: number;
  state: string;
  eta: number;
  time_added?: number;
}

/**
 * Manages popup UI rendering and styling
 */
export class PopupUI {
  private static readonly MIN_WIDTH = 320;
  private static readonly MAX_WIDTH = 800;
  private static readonly MIN_HEIGHT = 300;
  private static readonly MAX_HEIGHT = 800;
  private static readonly MAX_VISIBLE_SERVERS = 3;

  private serverTabs: HTMLElement;
  private serverContainers: HTMLElement;
  private reminder: HTMLElement;
  private activeServerIndex = 0;

  constructor() {
    this.serverTabs = this.getElement('server-tabs');
    this.serverContainers = this.getElement('server-containers');
    this.reminder = this.getElement('reminder');

    this.initializeStyles();
    this.loadPopupSize();
  }

  /**
   * Get element by ID
   */
  private getElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Element with id '${id}' not found`);
    }
    return element;
  }

  /**
   * Initialize styles
   */
  private initializeStyles(): void {
    // Dynamic size style
    const dynamicSizeStyle = document.createElement('style');
    dynamicSizeStyle.id = 'dynamic-size-style';
    dynamicSizeStyle.textContent = '.torrents-container { max-height: 450px; }';
    document.head.appendChild(dynamicSizeStyle);

    // Main styles
    const style = document.createElement('style');
    style.textContent = `
      .server-container {
        display: none;
      }
      .server-container.active {
        display: block;
      }
      .torrents-container {
        margin-top: 10px;
        overflow-y: auto;
        border-top: 1px solid #ddd;
        padding-top: 10px;
      }
      .torrent-item {
        margin-bottom: 8px;
        padding: 8px;
        border-radius: 4px;
        background: #f5f5f5;
      }
      .torrent-name {
        font-weight: bold;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .torrent-progress {
        height: 4px;
        background: #ddd;
        border-radius: 2px;
        margin: 4px 0;
      }
      .torrent-progress-bar {
        height: 100%;
        background: #4285f4;
        border-radius: 2px;
      }
      .torrent-stats {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #666;
      }
      .torrent-eta {
        font-style: italic;
      }
      .no-torrents {
        text-align: center;
        color: #666;
        padding: 10px;
      }
      @media (prefers-color-scheme: dark) {
        .torrent-item {
          background: #333;
        }
        .torrent-progress {
          background: #555;
        }
        .torrent-stats {
          color: #bbb;
        }
        .torrents-container {
          border-top-color: #444;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Load and apply saved popup size
   */
  private async loadPopupSize(): Promise<void> {
    try {
      const data = await StorageManager.get<{
        popup_width?: number;
        popup_height?: number;
      }>(['popup_width', 'popup_height']);

      const width = data.popup_width || 480;
      const height = data.popup_height || 450;
      this.applyPopupSize(width, height);
    } catch (error) {
      logger.error('Failed to load popup size:', error);
    }
  }

  /**
   * Apply popup size
   */
  private applyPopupSize(width: number, height: number): void {
    const container = document.querySelector('body > div') as HTMLElement;

    if (container) {
      const clampedWidth = Math.max(
        PopupUI.MIN_WIDTH,
        Math.min(PopupUI.MAX_WIDTH, width)
      );
      container.style.width = `${clampedWidth}px`;
    }

    // Update dynamic style for torrents-container max-height
    const dynamicStyle = document.getElementById('dynamic-size-style');
    if (dynamicStyle) {
      const clampedHeight = Math.max(
        PopupUI.MIN_HEIGHT,
        Math.min(PopupUI.MAX_HEIGHT, height)
      );
      dynamicStyle.textContent = `.torrents-container { max-height: ${clampedHeight}px; }`;
    }
  }

  /**
   * Update UI with server connections
   */
  updateUI(servers: Connection[], onServerSwitch: (index: number) => void): void {
    logger.debug('Updating UI with servers:', servers);

    if (!servers || servers.length === 0) {
      this.reminder.textContent = "Don't forget to configure your server info first!";
      this.serverTabs.innerHTML = '';
      this.serverContainers.innerHTML = '';
      return;
    }

    this.reminder.textContent = '';

    // Clear existing content
    this.serverTabs.innerHTML = '';
    this.serverContainers.innerHTML = '';

    // Create tabs and containers for visible servers
    const visibleServers = servers.slice(0, PopupUI.MAX_VISIBLE_SERVERS);
    visibleServers.forEach((server, index) => {
      this.serverTabs.appendChild(this.createServerTab(server, index, onServerSwitch));
      this.serverContainers.appendChild(this.createServerContainer(index));
    });
  }

  /**
   * Create server tab element
   */
  private createServerTab(
    server: Connection,
    index: number,
    onServerSwitch: (index: number) => void
  ): HTMLElement {
    const tab = document.createElement('div');
    tab.className = `server-tab ${index === this.activeServerIndex ? 'active' : ''}`;
    tab.setAttribute('data-index', String(index));

    tab.innerHTML = `
      <span class="server-name">Server ${index + 1}</span>
      <a href="${server.url}" class="web-ui-link" target="_deluge_web" title="Open Web UI">⚙️</a>
    `;

    tab.addEventListener('click', (e) => {
      // Don't switch tabs when clicking web UI link
      if ((e.target as HTMLElement).classList.contains('web-ui-link')) {
        return;
      }
      this.switchServer(index);
      onServerSwitch(index);
    });

    return tab;
  }

  /**
   * Create server container element
   */
  private createServerContainer(index: number): HTMLElement {
    const container = document.createElement('div');
    container.className = `server-container ${index === this.activeServerIndex ? 'active' : ''}`;
    container.setAttribute('data-index', String(index));

    const torrentsContainer = document.createElement('div');
    torrentsContainer.className = 'torrents-container';
    container.appendChild(torrentsContainer);

    return container;
  }

  /**
   * Switch active server
   */
  switchServer(index: number): void {
    logger.debug('Switching to server:', index);

    // Update active states
    document.querySelectorAll('.server-tab').forEach((tab) => {
      const tabIndex = parseInt(tab.getAttribute('data-index') || '0');
      tab.classList.toggle('active', tabIndex === index);
    });

    document.querySelectorAll('.server-container').forEach((container) => {
      const containerIndex = parseInt(container.getAttribute('data-index') || '0');
      container.classList.toggle('active', containerIndex === index);
    });

    this.activeServerIndex = index;
  }

  /**
   * Display torrents for a server
   */
  displayTorrents(torrents: TorrentDisplay[] | null, serverIndex: number): void {
    const container = document.querySelector(
      `.server-container[data-index="${serverIndex}"] .torrents-container`
    ) as HTMLElement;

    if (!container) {
      logger.warn('Container not found for server index:', serverIndex);
      return;
    }

    if (!torrents || torrents.length === 0) {
      container.innerHTML = '<div class="no-torrents">No active torrents</div>';
      return;
    }

    // Sort torrents by date added (newest first)
    const sortedTorrents = [...torrents].sort((a, b) => {
      return (b.time_added || 0) - (a.time_added || 0);
    });

    // Create HTML for each torrent
    const html = sortedTorrents
      .map((torrent) => {
        const progress = Math.round(torrent.progress * 100);
        const speedDown = this.formatSpeed(torrent.download_speed);
        const speedUp = this.formatSpeed(torrent.upload_speed);
        const eta = this.formatEta(torrent.eta);

        return `
        <div class="torrent-item">
          <div class="torrent-name" title="${this.escapeHtml(torrent.name)}">${this.escapeHtml(torrent.name)}</div>
          <div class="torrent-progress">
            <div class="torrent-progress-bar" style="width: ${progress}%"></div>
          </div>
          <div class="torrent-stats">
            <div class="torrent-speed">↓ ${speedDown} ↑ ${speedUp}</div>
            <div class="torrent-state">${this.escapeHtml(torrent.state)}</div>
            <div class="torrent-eta">${eta}</div>
          </div>
        </div>
      `;
      })
      .join('');

    const count = sortedTorrents.length;
    const countText = `Showing ${count} torrent${count !== 1 ? 's' : ''}`;

    container.innerHTML = html + `<div class="no-torrents">${countText}</div>`;
  }

  /**
   * Show error message in container
   */
  showError(serverIndex: number, message: string): void {
    const container = document.querySelector(
      `.server-container[data-index="${serverIndex}"] .torrents-container`
    ) as HTMLElement;

    if (container) {
      container.innerHTML = `<div class="no-torrents">${this.escapeHtml(message)}</div>`;
    }
  }

  /**
   * Format speed in bytes/sec to human readable
   */
  private formatSpeed(bytesPerSec: number): string {
    if (!bytesPerSec) return '0 KB/s';

    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let value = bytesPerSec;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return value.toFixed(1) + ' ' + units[unitIndex];
  }

  /**
   * Format ETA in seconds to human readable
   */
  private formatEta(seconds: number): string {
    if (!seconds || seconds < 0) return '∞';
    if (seconds === 0) return 'Done';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
    return `${remainingSeconds}s`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get active server index
   */
  getActiveServerIndex(): number {
    return this.activeServerIndex;
  }
}
