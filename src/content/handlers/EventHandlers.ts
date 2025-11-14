import { Logger } from '@/lib/logger/Logger';
import { stopEvent } from '@/lib/utils/utils';

const logger = new Logger('EventHandlers');

export interface SiteMeta {
  DOMAIN: string;
  TORRENT_REGEX: string;
  TORRENT_URL_ATTRIBUTE: string;
  INSTALLED: boolean;
}

export type EventCallback = (url: string, event: Event, withOptions: boolean) => void;

/**
 * Handles DOM events for torrent link interception
 */
export class EventHandlers {
  private controlKeyDepressed = false;
  private siteMeta: SiteMeta;
  private onTorrentLink: EventCallback;

  // Event handler references for cleanup
  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;
  private contextmenuHandler: (e: MouseEvent) => void;
  private leftclickHandler: (e: MouseEvent) => void;

  constructor(siteMeta: SiteMeta, onTorrentLink: EventCallback) {
    this.siteMeta = siteMeta;
    this.onTorrentLink = onTorrentLink;

    // Bind event handlers
    this.keydownHandler = this.handleKeydown.bind(this);
    this.keyupHandler = this.handleKeyup.bind(this);
    this.contextmenuHandler = this.handleContextMenu.bind(this);
    this.leftclickHandler = this.handleLeftClick.bind(this);
  }

  /**
   * Install event listeners
   */
  install(): void {
    logger.debug('Installing event handlers');

    document.addEventListener('keydown', this.keydownHandler, false);
    document.addEventListener('keyup', this.keyupHandler, false);
    document.addEventListener('contextmenu', this.contextmenuHandler, false);
    document.body.addEventListener('click', this.leftclickHandler, false);

    this.siteMeta.INSTALLED = true;
    logger.info('Event handlers installed');
  }

  /**
   * Remove event listeners
   */
  cleanup(): void {
    logger.debug('Cleaning up event handlers');

    document.removeEventListener('keydown', this.keydownHandler, false);
    document.removeEventListener('keyup', this.keyupHandler, false);
    document.removeEventListener('contextmenu', this.contextmenuHandler, false);
    document.body.removeEventListener('click', this.leftclickHandler, false);

    this.siteMeta.INSTALLED = false;
    logger.info('Event handlers cleaned up');
  }

  /**
   * Extract torrent URL from click target
   */
  extractTorrentUrl(target: EventTarget | null): string | null {
    if (!target) return null;

    let element = target as HTMLElement;
    const attr = this.siteMeta.TORRENT_URL_ATTRIBUTE;
    const regex = new RegExp(this.siteMeta.TORRENT_REGEX);

    logger.debug('Extracting torrent URL from:', element, 'with attribute:', attr);

    // Try the target element first
    if (!element.getAttribute(attr)) {
      // Try parent if no attribute on target
      element = element.parentElement as HTMLElement;
      logger.debug('Trying parent element:', element);
    }

    if (!element?.getAttribute(attr)) {
      // Try finding closest anchor tag
      const anchor = (target as HTMLElement).closest('a');
      if (anchor) {
        element = anchor as HTMLElement;
        logger.debug('Trying anchor element:', element);
      }
    }

    if (!element) {
      logger.debug('No suitable element found');
      return null;
    }

    // Get the URL value
    const val = attr === 'href'
      ? (element as HTMLAnchorElement).href
      : element.getAttribute(attr);

    logger.debug('Found URL value:', val);

    if (!val) return null;

    // First try exact regex match
    let torrentMatch = val.match(regex);
    logger.debug('Regex match result:', torrentMatch);

    if (!torrentMatch) {
      // Fallback: check if it's a magnet link
      if (val.startsWith('magnet:')) {
        logger.debug('URL is a magnet link, using as fallback');
        return val;
      }
      // Fallback: check if it ends with .torrent
      else if (val.endsWith('.torrent')) {
        logger.debug('URL ends with .torrent, using as fallback');
        return val;
      }
      // Fallback: check if it contains download patterns
      else if (
        val.includes('download.php') ||
        val.includes('dl.php') ||
        val.includes('get.php')
      ) {
        logger.debug('URL contains download pattern, using as fallback');
        return val;
      }

      logger.debug('No torrent URL pattern matched');
      return null;
    }

    const torrentUrl = torrentMatch.input || null;
    logger.debug('Successfully extracted torrent URL:', torrentUrl);
    return torrentUrl;
  }

  /**
   * Handle keydown event (Ctrl key tracking)
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (e.ctrlKey) {
      this.controlKeyDepressed = true;
      logger.debug('Control key pressed');
    }
  }

  /**
   * Handle keyup event (Ctrl key tracking)
   */
  private handleKeyup(_e: KeyboardEvent): void {
    if (this.controlKeyDepressed) {
      logger.debug('Control key released');
      this.controlKeyDepressed = false;
    }
  }

  /**
   * Handle context menu event (right-click)
   */
  private handleContextMenu(e: MouseEvent): void {
    logger.debug('Processing context menu event');
    const torrentUrl = this.extractTorrentUrl(e.target);
    logger.debug('Extracted torrent URL:', torrentUrl);

    if (torrentUrl) {
      // Store for potential use by background script
      (window as any).lastTorrentUrl = torrentUrl;
      (window as any).lastTorrentDomain = this.siteMeta.DOMAIN;
    }
  }

  /**
   * Handle left click event
   */
  private handleLeftClick(e: MouseEvent): void {
    logger.debug('Left click detected, CTRL:', this.controlKeyDepressed);

    // Ignore clicks on modal
    if ((e.target as HTMLElement).closest('.delugeflow-modal')) {
      logger.debug('Click inside modal, ignoring');
      return;
    }

    const torrentUrl = this.extractTorrentUrl(e.target);
    logger.debug('Extracted torrent URL:', torrentUrl);

    if (torrentUrl) {
      stopEvent(e);

      // Call callback with appropriate flag
      const withOptions = this.controlKeyDepressed;
      logger.debug('Triggering torrent link callback:', { url: torrentUrl, withOptions });
      this.onTorrentLink(torrentUrl, e, withOptions);
    }
  }

  /**
   * Check if control key is currently pressed
   */
  isControlKeyPressed(): boolean {
    return this.controlKeyDepressed;
  }
}
