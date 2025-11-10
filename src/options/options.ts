/**
 * Options Page Entry Point
 *
 * Note: This is a simplified TypeScript version.
 * The full implementation would include a comprehensive OptionsUI class.
 * For now, we're providing the controller and config modules, and the
 * existing options.js will continue to work until full migration.
 */

import { Logger } from '@/lib/logger/Logger';
import { OptionsController } from './OptionsController';
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
    document.title = `DelugeFlow v${version}`;

    const h2 = document.querySelector('h2');
    if (h2) {
      h2.textContent = `DelugeFlow v${version}`;
    }

    // Create controller
    const controller = new OptionsController();

    // Initialize communication
    await controller.initialize();
    logger.info('Communication initialized');

    // Store for debugging
    (window as any).optionsController = controller;
    (window as any).OptionsConfig = OptionsConfig;

    logger.info('Options page initialized successfully');

    // Note: The existing options.js handles the full UI implementation
    // This TypeScript version provides the foundation for future migration
  } catch (error) {
    logger.error('Failed to initialize options page:', error);
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeOptions);
} else {
  initializeOptions();
}
