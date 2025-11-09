import { NOTIFICATION, NOTIFICATION_IDS, EXTENSION_NAME } from '@/config/constants';
import type { NotificationOptions, ToastOptions } from '@/types';

/**
 * Unified notification system that handles both Chrome notifications
 * and in-page toast notifications
 */
export class NotificationManager {
  private static toastContainer: HTMLElement | null = null;

  /**
   * Show a notification (auto-selects between Chrome notification and toast)
   */
  static async show(options: NotificationOptions): Promise<string> {
    const {
      message,
      contextMessage,
      iconType = 'info',
      isClickable = false,
      requireInteraction = false,
      duration,
      id,
    } = options;

    // Use toast for in-page notifications if we have DOM access
    if (typeof document !== 'undefined' && document.body) {
      return this.showToast({
        message: contextMessage ? `${message}\n${contextMessage}` : message,
        type: iconType,
        duration: duration ?? this.getDefaultDuration(iconType),
      });
    }

    // Otherwise use Chrome notifications
    return this.showChromeNotification({
      message,
      contextMessage,
      iconType,
      isClickable,
      requireInteraction,
      id,
    });
  }

  /**
   * Show a Chrome notification
   */
  static async showChromeNotification(
    options: NotificationOptions
  ): Promise<string> {
    const {
      message,
      contextMessage,
      iconType = 'info',
      isClickable = false,
      requireInteraction = false,
      id,
    } = options;

    const notificationId = id || `${EXTENSION_NAME}-${Date.now()}`;

    return new Promise((resolve) => {
      chrome.notifications.create(
        notificationId,
        {
          type: 'basic',
          iconUrl: this.getIconPath(iconType),
          title: EXTENSION_NAME,
          message,
          contextMessage,
          isClickable,
          requireInteraction,
        },
        (createdId) => {
          resolve(createdId);
        }
      );
    });
  }

  /**
   * Show an in-page toast notification
   */
  static showToast(options: ToastOptions): string {
    const {
      message,
      type = 'info',
      duration = this.getDefaultDuration(type),
    } = options;

    const toastId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Ensure toast container exists
    this.ensureToastContainer();

    // Create toast element
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `delugeflow-toast delugeflow-toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    // Add icon
    const icon = document.createElement('span');
    icon.className = 'delugeflow-toast-icon';
    icon.textContent = this.getToastIcon(type);
    toast.appendChild(icon);

    // Add message
    const messageEl = document.createElement('span');
    messageEl.className = 'delugeflow-toast-message';
    messageEl.textContent = message;
    toast.appendChild(messageEl);

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'delugeflow-toast-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.onclick = () => this.hideToast(toastId);
    toast.appendChild(closeBtn);

    // Add to container
    this.toastContainer?.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('delugeflow-toast-show'), 10);

    // Auto-hide after duration
    if (duration > 0) {
      setTimeout(() => this.hideToast(toastId), duration);
    }

    return toastId;
  }

  /**
   * Hide a toast notification
   */
  static hideToast(toastId: string): void {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    toast.classList.remove('delugeflow-toast-show');
    toast.classList.add('delugeflow-toast-hide');

    // Remove from DOM after animation
    setTimeout(() => {
      toast.remove();
    }, 300);
  }

  /**
   * Clear all notifications
   */
  static clearAll(): void {
    // Clear Chrome notifications
    chrome.notifications.getAll((notifications) => {
      Object.keys(notifications).forEach((id) => {
        if (id.startsWith(EXTENSION_NAME)) {
          chrome.notifications.clear(id);
        }
      });
    });

    // Clear toasts
    if (this.toastContainer) {
      this.toastContainer.innerHTML = '';
    }
  }

  /**
   * Show success notification
   */
  static success(message: string, contextMessage?: string): Promise<string> {
    return this.show({
      message,
      contextMessage,
      iconType: 'success',
      duration: NOTIFICATION.SUCCESS_DURATION_MS,
    });
  }

  /**
   * Show error notification
   */
  static error(message: string, contextMessage?: string): Promise<string> {
    return this.show({
      message,
      contextMessage,
      iconType: 'error',
      duration: NOTIFICATION.ERROR_DURATION_MS,
      requireInteraction: true,
    });
  }

  /**
   * Show warning notification
   */
  static warning(message: string, contextMessage?: string): Promise<string> {
    return this.show({
      message,
      contextMessage,
      iconType: 'warning',
      duration: NOTIFICATION.WARNING_DURATION_MS,
    });
  }

  /**
   * Show info notification
   */
  static info(message: string, contextMessage?: string): Promise<string> {
    return this.show({
      message,
      contextMessage,
      iconType: 'info',
      duration: NOTIFICATION.INFO_DURATION_MS,
    });
  }

  /**
   * Ensure toast container exists in DOM
   */
  private static ensureToastContainer(): void {
    if (this.toastContainer && document.body.contains(this.toastContainer)) {
      return;
    }

    // Create container
    this.toastContainer = document.createElement('div');
    this.toastContainer.id = 'delugeflow-toast-container';
    this.toastContainer.className = 'delugeflow-toast-container';

    // Inject styles if not already present
    if (!document.getElementById('delugeflow-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'delugeflow-toast-styles';
      style.textContent = this.getToastStyles();
      document.head.appendChild(style);
    }

    document.body.appendChild(this.toastContainer);
  }

  /**
   * Get icon path for notification type
   */
  private static getIconPath(type: string): string {
    const iconMap: Record<string, string> = {
      success: 'images/icon-success-128.png',
      error: 'images/icon-error-128.png',
      warning: 'images/icon-warning-128.png',
      info: 'images/icon-128.png',
    };

    return iconMap[type] || iconMap.info;
  }

  /**
   * Get emoji icon for toast type
   */
  private static getToastIcon(type: string): string {
    const iconMap: Record<string, string> = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ',
    };

    return iconMap[type] || iconMap.info;
  }

  /**
   * Get default duration for notification type
   */
  private static getDefaultDuration(type: string): number {
    const durationMap: Record<string, number> = {
      success: NOTIFICATION.SUCCESS_DURATION_MS,
      error: NOTIFICATION.ERROR_DURATION_MS,
      warning: NOTIFICATION.WARNING_DURATION_MS,
      info: NOTIFICATION.INFO_DURATION_MS,
    };

    return durationMap[type] || NOTIFICATION.INFO_DURATION_MS;
  }

  /**
   * Get CSS styles for toast notifications
   */
  private static getToastStyles(): string {
    return `
      .delugeflow-toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 400px;
      }

      .delugeflow-toast {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        opacity: 0;
        transform: translateX(400px);
        transition: all 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.4;
      }

      .delugeflow-toast-show {
        opacity: 1;
        transform: translateX(0);
      }

      .delugeflow-toast-hide {
        opacity: 0;
        transform: translateX(400px);
      }

      .delugeflow-toast-icon {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-weight: bold;
        font-size: 16px;
      }

      .delugeflow-toast-success .delugeflow-toast-icon {
        background: #10b981;
        color: white;
      }

      .delugeflow-toast-error .delugeflow-toast-icon {
        background: #ef4444;
        color: white;
      }

      .delugeflow-toast-warning .delugeflow-toast-icon {
        background: #f59e0b;
        color: white;
      }

      .delugeflow-toast-info .delugeflow-toast-icon {
        background: #3b82f6;
        color: white;
      }

      .delugeflow-toast-message {
        flex: 1;
        color: #1f2937;
      }

      .delugeflow-toast-close {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        color: #6b7280;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        transition: color 0.2s;
      }

      .delugeflow-toast-close:hover {
        color: #1f2937;
      }

      @media (prefers-color-scheme: dark) {
        .delugeflow-toast {
          background: #1f2937;
        }

        .delugeflow-toast-message {
          color: #f9fafb;
        }

        .delugeflow-toast-close {
          color: #9ca3af;
        }

        .delugeflow-toast-close:hover {
          color: #f9fafb;
        }
      }
    `;
  }
}
