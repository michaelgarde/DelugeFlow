import { Logger } from '@/lib/logger/Logger';
import { SafeMessenger } from '@/lib/messaging/SafeMessenger';
import { StorageManager } from '@/lib/storage/StorageManager';

const logger = new Logger('Modal');

export interface TorrentInfo {
  name?: string;
  size?: number;
  [key: string]: unknown;
}

export interface TorrentRequest {
  url: string;
  domain?: string;
  info?: TorrentInfo;
}

export interface ServerInfo {
  index: number;
  url: string;
  isPrimary: boolean;
}

export interface PluginData {
  Label?: string[];
  AutoAdd?: string[];
  [key: string]: unknown;
}

export interface ServerConfig {
  download_location?: string;
  add_paused?: boolean;
  move_completed?: boolean;
  move_completed_path?: string;
  [key: string]: unknown;
}

export interface ModalData {
  servers: ServerInfo[];
  primaryServerIndex: number;
  plugins: PluginData;
  config: ServerConfig;
  defaultLabel: string;
}

export interface FormData {
  method: string;
  url: string;
  domain?: string;
  serverIndex?: number;
  options: Record<string, unknown>;
  plugins: Record<string, string>;
  cookies?: Record<string, string>;
}

export type SubmitCallback = (data: FormData) => void;

/**
 * Manages modal dialog for torrent options
 */
export class Modal {
  private modalId: string;
  private overlayId: string;
  private modal: HTMLElement | null = null;
  private overlay: HTMLElement | null = null;
  private messenger: SafeMessenger;
  private currentRequest: TorrentRequest | null = null;
  private onSubmit?: SubmitCallback;

  constructor(messenger: SafeMessenger, onSubmit?: SubmitCallback) {
    this.messenger = messenger;
    this.onSubmit = onSubmit;

    // Use extension ID for unique modal identifiers
    const extensionId = chrome.runtime.id;
    this.modalId = `delugeflow-modal-${extensionId}`;
    this.overlayId = `delugeflow-backdrop-${extensionId}`;
  }

  /**
   * Initialize modal container and overlay
   */
  init(): void {
    logger.debug('Initializing modal');

    // Get or create modal container
    this.modal = document.getElementById(this.modalId);
    this.overlay = document.getElementById(this.overlayId);

    if (!this.modal) {
      // Create modal container
      this.modal = document.createElement('div');
      this.modal.id = this.modalId;
      this.modal.className = 'delugeflow-modal';
      document.body.appendChild(this.modal);

      // Create overlay
      this.overlay = document.createElement('div');
      this.overlay.id = this.overlayId;
      this.overlay.className = 'delugeflow-modal-overlay';
      document.body.appendChild(this.overlay);

      logger.info('Modal container created');
    }

    // Verify modal exists in DOM
    const addedModal = document.getElementById(this.modalId);
    if (!addedModal) {
      logger.error('Failed to find modal in DOM after creation');
      return;
    }

    logger.info('Modal initialization complete');
  }

  /**
   * Show modal with torrent options
   */
  async show(request: TorrentRequest): Promise<void> {
    logger.debug('Showing modal with request:', request);

    if (!request.url) {
      logger.warn('No URL provided for modal');
      return;
    }

    this.currentRequest = request;

    // Initialize if needed
    if (!this.modal || !this.overlay) {
      this.init();
      if (!this.modal || !this.overlay) {
        logger.error('Failed to initialize modal');
        return;
      }
    }

    // Show loading state immediately
    this.renderLoadingState(request);
    this.modal.classList.add('displayed');
    this.overlay.classList.add('displayed');
    logger.debug('Modal displayed with loading state');

    try {
      // Fetch all required data in parallel
      const data = await this.fetchModalData();
      logger.debug('Fetched modal data:', data);

      // Render content with data
      this.renderContent(data);
    } catch (error) {
      logger.error('Error fetching modal data:', error);

      // Render with empty data on error
      this.renderContent({
        servers: [],
        primaryServerIndex: 0,
        plugins: {},
        config: {},
        defaultLabel: '',
      });
    }
  }

  /**
   * Hide modal and clear content
   */
  hide(): void {
    logger.debug('Hiding modal');

    if (this.modal && this.overlay) {
      this.modal.classList.remove('displayed');
      this.overlay.classList.remove('displayed');
      this.modal.innerHTML = '';
    }

    this.currentRequest = null;
  }

  /**
   * Cleanup modal from DOM
   */
  cleanup(): void {
    logger.debug('Cleaning up modal');

    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /**
   * Render loading state
   */
  private renderLoadingState(request: TorrentRequest): void {
    if (!this.modal) return;

    const torrentName = request.info?.name || 'Add Torrent';
    const url = this.escapeHtml(request.url);

    this.modal.innerHTML = `
      <form action="javascript:void(0);" class="delugeflow-form">
        <h3>${this.escapeHtml(torrentName)}</h3>
        <div class="note">${url}</div>
        <input type="hidden" name="url" value="${url}"/>
        <div class="loading">Loading options...</div>
      </form>
    `;
  }

  /**
   * Fetch all data needed for modal
   */
  private async fetchModalData(): Promise<ModalData> {
    return new Promise((resolve, reject) => {
      // Fetch all data
      Promise.all([
        new Promise<any>((res) => {
          this.messenger.send({ method: 'get-server-info' }, res);
        }),
        new Promise<any>((res) => {
          this.messenger.send({ method: 'plugins-getinfo' }, res);
        }),
        StorageManager.get<{ server_default_labels?: Record<number, string> }>([
          'server_default_labels',
        ]).then((data) => data.server_default_labels || {}),
      ])
        .then(([serverResponse, pluginResponse, serverLabels]) => {
          const primaryIndex = serverResponse?.primaryServerIndex || 0;

          resolve({
            servers: serverResponse?.servers || [],
            primaryServerIndex: primaryIndex,
            plugins: pluginResponse?.value?.plugins || {},
            config: pluginResponse?.value?.config || {},
            defaultLabel: serverLabels[primaryIndex] || '',
          });
        })
        .catch(reject);
    });
  }

  /**
   * Render modal content with data
   */
  private renderContent(data: ModalData): void {
    if (!this.modal || !this.currentRequest) return;

    try {
      logger.debug('Rendering modal content with data:', data);

      const request = this.currentRequest;
      const torrentName = request.info?.name || 'Add Torrent';
      const url = this.escapeHtml(request.url);
      const plugins = data.plugins || {};
      const config = data.config || {};

      this.modal.innerHTML = `
        <form action="javascript:void(0);" class="delugeflow-form">
          <h3>${this.escapeHtml(torrentName)}</h3>
          <div class="note">${url}</div>
          <input type="hidden" name="url" value="${url}"/>

          ${this.renderServerSelect(data)}
          ${this.renderLabelSelect(plugins, data.defaultLabel)}
          ${this.renderAutoAddSelect(plugins)}
          ${this.renderDownloadLocation(config)}
          ${this.renderAddPausedCheckbox(config)}
          ${this.renderMoveCompletedCheckbox(config)}
          ${this.renderMoveCompletedPath(config)}

          <div class="actions">
            <button type="button" class="cancel">Cancel</button>
            <button type="submit">Add</button>
          </div>
        </form>
      `;

      this.setupEventListeners();
    } catch (error) {
      logger.error('Error rendering modal content:', error);
      this.renderErrorState();
    }
  }

  /**
   * Render server selection dropdown
   */
  private renderServerSelect(data: ModalData): string {
    if (data.servers.length <= 1) {
      return '';
    }

    const options = data.servers
      .map(
        (server) => `
        <option value="${server.index}" ${server.isPrimary ? 'selected' : ''}>
          ${this.escapeHtml(server.url)}${server.isPrimary ? ' (Primary)' : ''}
        </option>
      `
      )
      .join('\n');

    return `
      <div class="form-group">
        <label>Server:</label>
        <select name="server" class="server-select">
          ${options}
        </select>
      </div>
    `;
  }

  /**
   * Render label selection dropdown
   */
  private renderLabelSelect(plugins: PluginData, defaultLabel: string): string {
    const labels = plugins.Label;
    if (!labels || labels.length === 0) {
      return '';
    }

    const options = labels
      .map(
        (label) => `
        <option value="${this.escapeHtml(label)}" ${label === defaultLabel ? 'selected' : ''}>
          ${this.escapeHtml(label)}
        </option>
      `
      )
      .join('\n');

    return `
      <div class="form-group">
        <label>Label:</label>
        <select name="plugins[Label]">
          <option value="">No Label</option>
          ${options}
        </select>
      </div>
    `;
  }

  /**
   * Render AutoAdd watch directory dropdown
   */
  private renderAutoAddSelect(plugins: PluginData): string {
    const paths = plugins.AutoAdd;
    if (!paths || paths.length === 0) {
      return '';
    }

    const options = paths
      .map(
        (path) => `
        <option value="${this.escapeHtml(path)}">${this.escapeHtml(path)}</option>
      `
      )
      .join('\n');

    return `
      <div class="form-group">
        <label>Watch Directory:</label>
        <select name="plugins[AutoAdd]">
          <option value="">Default Location</option>
          ${options}
        </select>
      </div>
    `;
  }

  /**
   * Render download location input
   */
  private renderDownloadLocation(config: ServerConfig): string {
    const location = config.download_location || '';
    return `
      <div class="form-group">
        <label>Download Location:</label>
        <input type="text" name="options[download_location]" value="${this.escapeHtml(location)}"/>
      </div>
    `;
  }

  /**
   * Render add paused checkbox
   */
  private renderAddPausedCheckbox(config: ServerConfig): string {
    const checked = config.add_paused ? 'checked' : '';
    return `
      <div class="form-group">
        <label>
          <input type="checkbox" name="options[add_paused]" ${checked}/>
          Add Paused
        </label>
      </div>
    `;
  }

  /**
   * Render move completed checkbox
   */
  private renderMoveCompletedCheckbox(config: ServerConfig): string {
    const checked = config.move_completed ? 'checked' : '';
    return `
      <div class="form-group">
        <label>
          <input type="checkbox" name="options[move_completed]" ${checked}/>
          Move on Completion
        </label>
      </div>
    `;
  }

  /**
   * Render move completed path input
   */
  private renderMoveCompletedPath(config: ServerConfig): string {
    const path = config.move_completed_path || '';
    const display = config.move_completed ? 'block' : 'none';
    return `
      <div class="form-group move-completed-path" style="display: ${display}">
        <label>Move Completed To:</label>
        <input type="text" name="options[move_completed_path]" value="${this.escapeHtml(path)}"/>
      </div>
    `;
  }

  /**
   * Render error state
   */
  private renderErrorState(): void {
    if (!this.modal || !this.currentRequest) return;

    const url = this.escapeHtml(this.currentRequest.url);

    this.modal.innerHTML = `
      <form action="javascript:void(0);" class="delugeflow-form">
        <h3>Add Torrent</h3>
        <div class="note">${url}</div>
        <input type="hidden" name="url" value="${url}"/>
        <div class="form-group">
          <label>Error loading options. Add anyway?</label>
        </div>
        <div class="actions">
          <button type="button" class="cancel">Cancel</button>
          <button type="submit">Add</button>
        </div>
      </form>
    `;

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for modal
   */
  private setupEventListeners(): void {
    if (!this.modal) return;

    const form = this.modal.querySelector('form');
    if (!form) return;

    // Form submit handler
    form.addEventListener('submit', this.handleSubmit.bind(this));

    // Cancel button handler
    const cancelBtn = form.querySelector('button.cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.hide());
    }

    // Overlay click handler
    if (this.overlay) {
      this.overlay.addEventListener('click', () => this.hide());
    }

    // Server selection change handler
    const serverSelect = form.querySelector('.server-select') as HTMLSelectElement;
    if (serverSelect) {
      serverSelect.addEventListener('change', () => {
        const serverIndex = parseInt(serverSelect.value);
        this.handleServerChange(serverIndex);
      });
    }

    // Move completed checkbox handler
    const moveCompleted = form.querySelector('input[name="options[move_completed]"]') as HTMLInputElement;
    const moveCompletedPath = form.querySelector('.move-completed-path') as HTMLElement;
    if (moveCompleted && moveCompletedPath) {
      moveCompleted.addEventListener('change', () => {
        moveCompletedPath.style.display = moveCompleted.checked ? 'block' : 'none';
      });
    }
  }

  /**
   * Handle server selection change
   */
  private handleServerChange(serverIndex: number): void {
    if (!this.modal) return;

    logger.debug('Server selection changed to:', serverIndex);

    const form = this.modal.querySelector('form');
    if (!form) return;

    // Show loading overlay
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-overlay';
    loadingDiv.innerHTML = 'Loading server options...';
    form.appendChild(loadingDiv);

    // Get server-specific default label and plugin info
    Promise.all([
      StorageManager.get<{ server_default_labels?: Record<number, string> }>([
        'server_default_labels',
      ]).then((data) => data.server_default_labels || {}),
      new Promise<any>((resolve) => {
        this.messenger.send({ method: 'plugins-getinfo', serverIndex }, resolve);
      }),
    ])
      .then(([serverLabels, pluginResponse]) => {
        const defaultLabel = serverLabels[serverIndex] || '';
        const plugins = pluginResponse?.value?.plugins || {};
        const config = pluginResponse?.value?.config || {};

        // Update form fields with new data
        this.updateFormFields(plugins, config, defaultLabel);
      })
      .catch((error) => {
        logger.error('Error loading server options:', error);
      })
      .finally(() => {
        // Remove loading overlay
        loadingDiv.remove();
      });
  }

  /**
   * Update form fields with new plugin/config data
   */
  private updateFormFields(plugins: PluginData, config: ServerConfig, defaultLabel: string): void {
    if (!this.modal) return;

    // Update label select
    const labelSelect = this.modal.querySelector('select[name="plugins[Label]"]') as HTMLSelectElement;
    const labelGroup = labelSelect?.closest('.form-group') as HTMLElement;
    if (labelGroup) {
      const labels = plugins.Label;
      if (labels && labels.length > 0) {
        labelGroup.style.display = '';
        const options = labels
          .map(
            (label) => `
            <option value="${this.escapeHtml(label)}" ${label === defaultLabel ? 'selected' : ''}>
              ${this.escapeHtml(label)}
            </option>
          `
          )
          .join('\n');
        labelSelect.innerHTML = `<option value="">No Label</option>${options}`;
      } else {
        labelGroup.style.display = 'none';
      }
    }

    // Update AutoAdd select
    const watchSelect = this.modal.querySelector('select[name="plugins[AutoAdd]"]') as HTMLSelectElement;
    const watchGroup = watchSelect?.closest('.form-group') as HTMLElement;
    if (watchGroup) {
      const paths = plugins.AutoAdd;
      if (paths && paths.length > 0) {
        watchGroup.style.display = '';
        const options = paths
          .map((path) => `<option value="${this.escapeHtml(path)}">${this.escapeHtml(path)}</option>`)
          .join('\n');
        watchSelect.innerHTML = `<option value="">Default Location</option>${options}`;
      } else {
        watchGroup.style.display = 'none';
      }
    }

    // Update download location
    const downloadLocation = this.modal.querySelector(
      'input[name="options[download_location]"]'
    ) as HTMLInputElement;
    if (downloadLocation && config.download_location) {
      downloadLocation.value = config.download_location;
    }

    // Update add paused checkbox
    const addPaused = this.modal.querySelector('input[name="options[add_paused]"]') as HTMLInputElement;
    if (addPaused) {
      addPaused.checked = config.add_paused || false;
    }

    // Update move completed checkbox and path
    const moveCompleted = this.modal.querySelector(
      'input[name="options[move_completed]"]'
    ) as HTMLInputElement;
    const moveCompletedPath = this.modal.querySelector(
      'input[name="options[move_completed_path]"]'
    ) as HTMLInputElement;
    const moveCompletedGroup = moveCompletedPath?.closest('.form-group') as HTMLElement;

    if (moveCompleted) {
      moveCompleted.checked = config.move_completed || false;
      if (moveCompletedGroup) {
        moveCompletedGroup.style.display = moveCompleted.checked ? 'block' : 'none';
      }
    }

    if (moveCompletedPath && config.move_completed_path) {
      moveCompletedPath.value = config.move_completed_path;
    }
  }

  /**
   * Handle form submission
   */
  private handleSubmit(event: Event): void {
    event.preventDefault();

    if (!this.currentRequest || !this.modal) return;

    this.hide();

    const form = event.target as HTMLFormElement;

    const data: FormData = {
      method: 'addlink-todeluge',
      url: this.currentRequest.url,
      domain: this.currentRequest.domain,
      options: {},
      plugins: {},
    };

    // Get selected server if available
    const serverSelect = form.querySelector('.server-select') as HTMLSelectElement;
    if (serverSelect) {
      data.serverIndex = parseInt(serverSelect.value);
    }

    // Extract form values directly from inputs
    // Handle options
    const downloadLocation = form.querySelector('input[name="options[download_location]"]') as HTMLInputElement;
    if (downloadLocation && downloadLocation.value) {
      data.options.download_location = downloadLocation.value;
    }

    const addPaused = form.querySelector('input[name="options[add_paused]"]') as HTMLInputElement;
    if (addPaused && addPaused.checked) {
      data.options.add_paused = true;
    }

    const moveCompleted = form.querySelector('input[name="options[move_completed]"]') as HTMLInputElement;
    if (moveCompleted && moveCompleted.checked) {
      data.options.move_completed = true;
    }

    const moveCompletedPath = form.querySelector('input[name="options[move_completed_path]"]') as HTMLInputElement;
    if (moveCompletedPath && moveCompletedPath.value) {
      data.options.move_completed_path = moveCompletedPath.value;
    }

    // Handle plugins
    const labelSelect = form.querySelector('select[name="plugins[Label]"]') as HTMLSelectElement;
    if (labelSelect && labelSelect.value) {
      data.plugins.Label = labelSelect.value;
    }

    const autoAddSelect = form.querySelector('select[name="plugins[AutoAdd]"]') as HTMLSelectElement;
    if (autoAddSelect && autoAddSelect.value) {
      data.plugins.AutoAdd = autoAddSelect.value;
    }

    // Add cookies from window context
    data.cookies = (window as any).lastTorrentCookies;

    logger.debug('Form submitted with data:', data);

    // Save selected label as default
    if (data.plugins.Label) {
      StorageManager.set({ default_label: data.plugins.Label });
    }

    // Call submit callback if provided
    if (this.onSubmit) {
      this.onSubmit(data);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
