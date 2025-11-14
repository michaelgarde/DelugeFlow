/**
 * Popup Entry Point
 *
 * Initializes and manages the extension popup interface
 */

import { Logger } from '@/lib/logger/Logger';
import { PopupUI } from './PopupUI';
import { PopupController } from './PopupController';

const logger = new Logger('Popup');

/**
 * Initialize popup
 */
async function initializePopup(): Promise<void> {
  try {
    logger.info('Initializing popup');

    // Create UI
    const ui = new PopupUI();

    // Create controller
    const controller = new PopupController(ui);

    // Initialize controller
    await controller.initialize();

    // Store for debugging
    (window as any).popupUI = ui;
    (window as any).popupController = controller;

    logger.info('Popup initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize popup:', error);

    // Show error to user
    const reminder = document.getElementById('reminder');
    if (reminder) {
      reminder.textContent = 'Failed to initialize popup. Please try again.';
      reminder.style.color = 'red';
    }
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup();
}
