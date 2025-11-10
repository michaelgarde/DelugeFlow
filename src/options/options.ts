/**
 * Options Page Entry Point
 */

import { Logger } from '@/lib/logger/Logger';
import { OptionsController } from './OptionsController';
import { OptionsUI } from './OptionsUI';
import { OptionsConfig } from './OptionsConfig';

const logger = new Logger('Options');

/**
 * Initialize options page
 */
async function initializeOptions(): Promise<void> {
  try {
    logger.info('Initializing options page');

    // Get manifest version
    const manifest = chrome.runtime.getManifest();
    const version = manifest.version;
    document.title = `DelugeFlow Options v${version}`;

    const h2 = document.querySelector('h2');
    if (h2) {
      h2.textContent = `DelugeFlow Options`;
    }

    // Create controller
    const controller = new OptionsController();

    // Initialize communication
    await controller.initialize();
    logger.info('Communication initialized');

    // Create and initialize UI
    const ui = new OptionsUI(controller);
    await ui.initialize();
    logger.info('UI initialized');

    // Store for debugging
    (window as any).optionsController = controller;
    (window as any).optionsUI = ui;
    (window as any).OptionsConfig = OptionsConfig;

    logger.info('Options page initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize options page:', error);
    alert('Failed to initialize options page. Check console for details.');
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeOptions);
} else {
  initializeOptions();
}
