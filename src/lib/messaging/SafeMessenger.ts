import { NETWORK } from '@/config/constants';
import type { Message, MessageResponse } from '@/types';
import { Logger } from '@/lib/logger/Logger';

const logger = new Logger('SafeMessenger');

/**
 * Safe message passing system with automatic reconnection and queuing
 * Eliminates duplication of message handling logic across components
 */
export class SafeMessenger {
  private messageQueue: Array<{
    message: Message;
    callback?: (response: MessageResponse) => void;
  }> = [];
  private isReconnecting = false;
  private communicator: any; // TODO: Type this properly when refactoring communicator
  private reconnectTimer: number | null = null;

  constructor(communicator: any) {
    this.communicator = communicator;
  }

  /**
   * Send a message with automatic queuing if disconnected
   */
  async send(
    message: Message,
    callback?: (response: MessageResponse) => void
  ): Promise<void> {
    logger.debug('Attempting to send message:', message);

    // Check if connected
    if (!this.communicator || !this.communicator._Connected) {
      logger.warn('Connection not available, queueing message:', message);
      this.enqueueMessage(message, callback);

      if (!this.isReconnecting) {
        this.reconnect();
      }
      return;
    }

    // Check queue size
    if (this.messageQueue.length >= NETWORK.MAX_MESSAGE_QUEUE_SIZE) {
      logger.error('Message queue full, dropping oldest message');
      this.messageQueue.shift();
    }

    try {
      logger.debug('Sending message via communicator:', message);

      this.communicator.sendMessage(
        message,
        (response: MessageResponse) => {
          logger.debug('Received response from background:', response);
          if (callback) {
            callback(response);
          }
        },
        (error: Error) => {
          logger.error('Message send failed:', error);
          this.enqueueMessage(message, callback);

          if (!this.isReconnecting) {
            this.reconnect();
          }
        }
      );
    } catch (e) {
      logger.error('Error sending message:', e);
      this.enqueueMessage(message, callback);

      if (!this.isReconnecting) {
        this.reconnect();
      }
    }
  }

  /**
   * Add message to queue
   */
  private enqueueMessage(
    message: Message,
    callback?: (response: MessageResponse) => void
  ): void {
    if (this.messageQueue.length >= NETWORK.MAX_MESSAGE_QUEUE_SIZE) {
      logger.warn('Queue full, dropping message:', message);
      return;
    }

    this.messageQueue.push({ message, callback });
    logger.debug(`Message queued. Queue size: ${this.messageQueue.length}`);
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    logger.debug(`Processing message queue (${this.messageQueue.length} messages)`);

    while (
      this.messageQueue.length > 0 &&
      this.communicator &&
      this.communicator._Connected
    ) {
      const item = this.messageQueue.shift();
      if (!item) continue;

      try {
        this.communicator.sendMessage(item.message, item.callback);
      } catch (e) {
        logger.error('Error processing queued message:', e);
        // Put it back at the start
        this.messageQueue.unshift(item);
        break;
      }
    }
  }

  /**
   * Attempt to reconnect
   */
  private reconnect(): void {
    if (this.isReconnecting) return;

    this.isReconnecting = true;
    logger.info('Attempting to reconnect...');

    // Reset communicator state
    if (this.communicator) {
      this.communicator._Connected = false;
      this.communicator._port = null;
    }

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Try to reinitialize after delay
    this.reconnectTimer = window.setTimeout(() => {
      this.attemptReconnection();
    }, NETWORK.RECONNECT_DELAY_MS);
  }

  /**
   * Actually attempt the reconnection
   */
  private async attemptReconnection(): Promise<void> {
    try {
      // Reinitialize communicator if it has init method
      if (this.communicator && typeof this.communicator.init === 'function') {
        this.communicator.init(true); // true = isTab
      }

      // Check if connected
      if (this.communicator && this.communicator._Connected) {
        logger.info('Reconnection successful');
        this.isReconnecting = false;
        this.processMessageQueue();
      } else {
        throw new Error('Connection still not available');
      }
    } catch (e) {
      logger.error('Reconnection failed:', e);
      this.isReconnecting = false;

      // Try again after delay
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnect();
      }, NETWORK.RECONNECT_DELAY_MS);
    }
  }

  /**
   * Stop reconnection attempts
   */
  stopReconnecting(): void {
    this.isReconnecting = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Clear message queue
   */
  clearQueue(): void {
    this.messageQueue = [];
    logger.debug('Message queue cleared');
  }

  /**
   * Check if currently reconnecting
   */
  isAttemptingReconnect(): boolean {
    return this.isReconnecting;
  }
}
