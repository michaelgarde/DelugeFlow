import { Logger } from '@/lib/logger/Logger';
import { OptionsController } from './OptionsController';
import { OptionsConfig } from './OptionsConfig';
import type { Connection } from '@/types';

const logger = new Logger('OptionsUI');

/**
 * Handles all UI rendering and interaction for the options page
 */
export class OptionsUI {
  private controller: OptionsController;
  private connections: Connection[] = [];
  private primaryServerIndex = 0;

  constructor(controller: OptionsController) {
    this.controller = controller;
  }

  /**
   * Initialize the UI
   */
  async initialize(): Promise<void> {
    logger.debug('Initializing options UI');

    // Load data
    await this.loadData();

    // Render UI
    this.renderConnections();
    this.renderOptions();
    this.renderAccordions();

    // Attach event listeners
    this.attachEventListeners();

    logger.info('Options UI initialized');
  }

  /**
   * Load data from storage
   */
  private async loadData(): Promise<void> {
    this.connections = await this.controller.loadConnections();
    this.primaryServerIndex = this.controller.getPrimaryServerIndex();
    logger.debug('Loaded data:', { connections: this.connections.length, primary: this.primaryServerIndex });
  }

  /**
   * Render connection list
   */
  private renderConnections(): void {
    const container = document.getElementById('connection-list');
    if (!container) return;

    container.innerHTML = '';

    this.connections.forEach((conn, index) => {
      const connDiv = this.createConnectionElement(conn, index);
      container.appendChild(connDiv);
    });

    logger.debug('Rendered connections:', this.connections.length);
  }

  /**
   * Create a connection element
   */
  private createConnectionElement(conn: Connection, index: number): HTMLElement {
    const div = document.createElement('div');
    div.className = 'connection-container';
    div.dataset.index = String(index);

    const isPrimary = index === this.primaryServerIndex;

    div.innerHTML = `
      <div class="connection-row">
        <div class="field-group">
          <label for="url-${index}">Server URL</label>
          <input type="text" id="url-${index}" name="url" class="option_field url-input"
                 placeholder="http://localhost:8112" value="${conn.url || ''}" />
        </div>
        <div class="field-group">
          <label for="pass-${index}">Password</label>
          <input type="password" id="pass-${index}" name="pass" class="option_field pass-input"
                 placeholder="WebUI Password" value="${conn.pass || ''}" />
        </div>
        <div class="field-group">
          <label for="label-${index}">Default Label</label>
          <select id="label-${index}" name="default_label" class="option_field default-label-select"
                  data-server-index="${index}">
            <option value="">No Label</option>
          </select>
        </div>
        <div class="field-group controls-group">
          <label class="server-label">Server ${index + 1}</label>
          <div class="connection-controls">
            <button type="button" class="primary-toggle ${isPrimary ? 'primary' : 'not-primary'}">
              ${isPrimary ? 'Primary' : 'Make Primary'}
            </button>
            <button type="button" class="remove">Remove</button>
          </div>
        </div>
      </div>
    `;

    // Load labels for this server
    this.loadLabelsForServer(index);

    return div;
  }

  /**
   * Load labels for a server
   */
  private async loadLabelsForServer(index: number): Promise<void> {
    const select = document.getElementById(`label-${index}`) as HTMLSelectElement;
    if (!select) return;

    const conn = this.connections[index];
    if (!conn || !conn.url) return;

    try {
      const labels = await this.controller.loadLabelsForServer(index);
      const defaultLabel = await this.controller.getDefaultLabel(index);

      // Clear and repopulate
      select.innerHTML = '<option value="">No Label</option>';
      labels.forEach(label => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        if (label === defaultLabel) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    } catch (error) {
      logger.error('Failed to load labels for server:', index, error);
    }
  }

  /**
   * Render options checkboxes
   */
  private async renderOptions(): Promise<void> {
    const options = await this.controller.loadOptions();

    // Set checkbox states
    const fields = [
      'inpage_notification',
      'enable_context_menu',
      'enable_context_menu_with_options',
      'enable_keyboard_macro',
      'enable_leftclick',
      'intercept_torrent_downloads',
      'send_cookies',
      'enable_debug_logging',
    ];

    fields.forEach(field => {
      const checkbox = document.getElementById(field) as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = options[field] !== false; // Default to true
      }
    });

    // Set number inputs
    const popupWidth = document.getElementById('popup_width') as HTMLInputElement;
    if (popupWidth) {
      popupWidth.value = String(options.popup_width || 480);
    }

    const popupHeight = document.getElementById('popup_height') as HTMLInputElement;
    if (popupHeight) {
      popupHeight.value = String(options.popup_height || 600);
    }

    // Set text input
    const linkRegex = document.getElementById('link_regex') as HTMLInputElement;
    if (linkRegex) {
      linkRegex.value = options.link_regex || '';
    }

    logger.debug('Rendered options');
  }

  /**
   * Render accordions
   */
  private async renderAccordions(): Promise<void> {
    const states = await this.controller.getAccordionStates();

    document.querySelectorAll('.accordion').forEach((accordion) => {
      const header = accordion.querySelector('.accordion-header');
      const content = accordion.querySelector('.accordion-content');
      const icon = accordion.querySelector('.accordion-icon');

      if (!header || !content) return;

      const id = accordion.querySelector('h2')?.textContent?.toLowerCase() || '';
      const isExpanded = states[id] !== false;

      if (isExpanded) {
        content.classList.add('expanded');
        if (icon) icon.textContent = '▲';
      } else {
        content.classList.remove('expanded');
        if (icon) icon.textContent = '▼';
      }
    });
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Add server button
    const addServerBtn = document.getElementById('add-server');
    if (addServerBtn) {
      addServerBtn.addEventListener('click', () => this.handleAddServer());
    }

    // Connection controls (delegated)
    const connectionList = document.getElementById('connection-list');
    if (connectionList) {
      connectionList.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (target.classList.contains('remove')) {
          const container = target.closest('.connection-container');
          if (container) {
            const index = parseInt(container.getAttribute('data-index') || '0');
            this.handleRemoveServer(index);
          }
        } else if (target.classList.contains('primary-toggle')) {
          const container = target.closest('.connection-container');
          if (container) {
            const index = parseInt(container.getAttribute('data-index') || '0');
            this.handleMakePrimary(index);
          }
        }
      });

      // Save on input change
      connectionList.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.classList.contains('option_field')) {
          this.handleSaveConnections();
        }
      });

      // Save on blur
      connectionList.addEventListener('blur', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.classList.contains('option_field')) {
          this.handleSaveConnections();
        }
      }, true);
    }

    // Options fields
    document.querySelectorAll('.option_field').forEach(field => {
      field.addEventListener('change', () => this.handleSaveOptions());
    });

    // Accordions
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const accordion = header.closest('.accordion');
        if (accordion) {
          this.handleToggleAccordion(accordion as HTMLElement);
        }
      });
    });

    logger.debug('Event listeners attached');
  }

  /**
   * Handle add server
   */
  private async handleAddServer(): Promise<void> {
    logger.debug('Adding server');

    const newConnection: Connection = {
      url: '',
      pass: '',
    };

    this.connections.push(newConnection);
    await this.saveConnections();
    this.renderConnections();
    this.attachEventListeners(); // Re-attach for new elements
  }

  /**
   * Handle remove server
   */
  private async handleRemoveServer(index: number): Promise<void> {
    logger.debug('Removing server:', index);

    if (this.connections.length <= 1) {
      alert('Cannot remove the last server');
      return;
    }

    this.connections.splice(index, 1);

    // Adjust primary index if needed
    if (this.primaryServerIndex >= this.connections.length) {
      this.primaryServerIndex = this.connections.length - 1;
    } else if (this.primaryServerIndex === index) {
      this.primaryServerIndex = 0;
    } else if (this.primaryServerIndex > index) {
      this.primaryServerIndex--;
    }

    await this.controller.removeDefaultLabel(index);
    await this.saveConnections();
    this.renderConnections();
    this.attachEventListeners();
  }

  /**
   * Handle make primary
   */
  private async handleMakePrimary(index: number): Promise<void> {
    logger.debug('Making primary:', index);

    this.primaryServerIndex = index;
    await this.saveConnections();

    // Update button states
    document.querySelectorAll('.primary-toggle').forEach((btn, idx) => {
      if (idx === index) {
        btn.classList.add('primary');
        btn.classList.remove('not-primary');
        btn.textContent = 'Primary';
      } else {
        btn.classList.remove('primary');
        btn.classList.add('not-primary');
        btn.textContent = 'Make Primary';
      }
    });
  }

  /**
   * Handle save connections
   */
  private async handleSaveConnections(): Promise<void> {
    logger.debug('Saving connections');

    // Gather data from DOM
    const containers = document.querySelectorAll('.connection-container');
    const updatedConnections: Connection[] = [];

    containers.forEach((container, index) => {
      const urlInput = container.querySelector('.url-input') as HTMLInputElement;
      const passInput = container.querySelector('.pass-input') as HTMLInputElement;
      const labelSelect = container.querySelector('.default-label-select') as HTMLSelectElement;

      const connection: Connection = {
        url: urlInput?.value || '',
        pass: passInput?.value || '',
      };

      updatedConnections.push(connection);

      // Save default label
      if (labelSelect && labelSelect.value) {
        this.controller.setDefaultLabel(index, labelSelect.value);
      }
    });

    this.connections = updatedConnections;
    await this.saveConnections();
  }

  /**
   * Save connections to storage
   */
  private async saveConnections(): Promise<void> {
    try {
      await this.controller.saveConnections(this.connections, this.primaryServerIndex);
      logger.debug('Connections saved');
    } catch (error) {
      logger.error('Failed to save connections:', error);
      alert('Failed to save connections');
    }
  }

  /**
   * Handle save options
   */
  private async handleSaveOptions(): Promise<void> {
    logger.debug('Saving options');

    const options: Record<string, any> = {};

    // Gather checkboxes
    document.querySelectorAll('.option_field').forEach(field => {
      const input = field as HTMLInputElement;
      if (input.type === 'checkbox') {
        options[input.id] = input.checked;
      } else if (input.type === 'number') {
        options[input.id] = parseInt(input.value) || 0;
      } else if (input.type === 'text') {
        options[input.id] = input.value;
      }
    });

    try {
      await this.controller.saveOptions(options);
      logger.debug('Options saved');
    } catch (error) {
      logger.error('Failed to save options:', error);
      alert('Failed to save options');
    }
  }

  /**
   * Handle toggle accordion
   */
  private handleToggleAccordion(accordion: HTMLElement): void {
    const content = accordion.querySelector('.accordion-content');
    const icon = accordion.querySelector('.accordion-icon');
    const id = accordion.querySelector('h2')?.textContent?.toLowerCase() || '';

    if (!content) return;

    const isExpanded = content.classList.contains('expanded');

    if (isExpanded) {
      content.classList.remove('expanded');
      if (icon) icon.textContent = '▼';
      this.controller.saveAccordionState(id, false);
    } else {
      content.classList.add('expanded');
      if (icon) icon.textContent = '▲';
      this.controller.saveAccordionState(id, true);
    }
  }
}
