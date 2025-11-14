import { DaemonError, ConnectionError } from '@/lib/errors/DelugeErrors';
import { DELUGE_METHODS } from '@/config/constants';
import { Logger } from '@/lib/logger/Logger';
import type { DelugeRequest } from './DelugeRequest';
import type { DaemonInfo, ServerConfig } from '@/types';

const logger = new Logger('DelugeDaemon');

interface DaemonHost {
  0: string; // host_id
  1: string; // ip
  2: number; // port
  3: string; // status
}

interface DaemonStatusInfo {
  status: string;
  info: any;
  hostId: string;
  host: DaemonHost | undefined;
}

/**
 * Manages daemon connection and configuration
 */
export class DelugeDaemon {
  private daemonInfo: DaemonInfo | null = null;
  private serverConfig: ServerConfig = {};
  private daemonHosts: DaemonHost[] = [];
  private connectAttempts = 0;

  constructor(private request: DelugeRequest) {}

  /**
   * Check if daemon is connected
   */
  async checkConnection(): Promise<boolean> {
    logger.debug('Checking daemon connection');

    try {
      const response = await this.request.request<boolean>(
        DELUGE_METHODS.WEB_CONNECTED,
        []
      );

      if (response.result === true) {
        logger.info('Daemon is connected');
        return true;
      }

      logger.info('Daemon is not connected, will try to connect to one');
      return false;
    } catch (error) {
      logger.error('Failed to check daemon connection:', error);
      throw new DaemonError('Failed to check daemon connection', error as Error);
    }
  }

  /**
   * Get list of available daemon hosts
   */
  async getDaemons(): Promise<DaemonHost[]> {
    logger.debug('Getting daemon hosts');

    try {
      const payload = await this.request.request<DaemonHost[]>(
        DELUGE_METHODS.WEB_GET_HOSTS,
        []
      );

      logger.debug('Daemon hosts response:', payload);
      this.daemonHosts = payload.result || [];
      return this.daemonHosts;
    } catch (error) {
      logger.error('Failed to get daemons:', error);
      throw new DaemonError('Failed to get daemon list', error as Error);
    }
  }

  /**
   * Get status of specific daemon host
   */
  async getHostStatus(hostId: string): Promise<DaemonStatusInfo> {
    logger.debug('Getting host status for:', hostId);

    try {
      const payload = await this.request.request<[string, string, string]>(
        DELUGE_METHODS.WEB_GET_HOST_STATUS,
        [hostId]
      );

      if (!payload.result) {
        logger.error('Get host status failed:', hostId, payload);
        throw new DaemonError('Failed to get host status');
      }

      // API returns [hostId, status, version]
      const [returnedHostId, status, version] = payload.result;

      const daemonInfo: DaemonStatusInfo = {
        status,
        info: { version },
        hostId: returnedHostId,
        host: this.daemonHosts.find(h => h[0] === returnedHostId),
      };

      logger.debug('Host status:', daemonInfo);
      return daemonInfo;
    } catch (error) {
      logger.error('Failed to get host status:', error);
      throw new DaemonError(`Failed to get status for host ${hostId}`, error as Error);
    }
  }

  /**
   * Connect to daemon
   */
  async connectToDaemon(): Promise<DaemonInfo> {
    // If already connected, return existing info
    if (this.daemonInfo?.host_id) {
      logger.debug('Using existing daemon connection');
      return this.daemonInfo;
    }

    // Get list of daemons
    const daemonHosts = await this.getDaemons();

    if (!daemonHosts || daemonHosts.length === 0) {
      throw new DaemonError('No daemons available');
    }

    // Try to connect to each daemon sequentially
    let lastError: Error | null = null;

    for (const daemonHost of daemonHosts) {
      try {
        const daemonInfo = await this.attemptDaemonConnection(daemonHost);
        this.daemonInfo = daemonInfo;
        this.connectAttempts = 1;
        return daemonInfo;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Failed to connect to daemon ${daemonHost[0]}:`, error);
        // Continue to next daemon
      }
    }

    // All daemons failed
    throw new DaemonError(
      'Failed to connect to any daemon',
      lastError || undefined
    );
  }

  /**
   * Attempt to connect to a specific daemon
   */
  private async attemptDaemonConnection(daemonHost: DaemonHost): Promise<DaemonInfo> {
    const hostId = daemonHost[0];
    const daemonInfo = await this.getHostStatus(hostId);

    switch (daemonInfo.status) {
      case 'Connected':
        logger.info('Daemon already connected:', daemonInfo);
        return this.buildDaemonInfo(daemonInfo);

      case 'Online':
        logger.info('Daemon online, connecting...');
        await this.connect(hostId);
        return this.buildDaemonInfo(daemonInfo);

      case 'Offline':
        logger.info('Daemon offline, starting and connecting...');
        await this.startDaemon(hostId);
        await this.connect(hostId);
        return this.buildDaemonInfo(daemonInfo);

      default:
        logger.warn('Unknown daemon status:', daemonInfo.status);
        throw new DaemonError(`Unknown daemon status: ${daemonInfo.status}`);
    }
  }

  /**
   * Start a daemon
   */
  private async startDaemon(hostId: string): Promise<void> {
    logger.debug('Starting daemon:', hostId);

    try {
      await this.request.request(
        DELUGE_METHODS.WEB_START_DAEMON,
        [hostId]
      );
      logger.info('Daemon started');
    } catch (error) {
      logger.error('Failed to start daemon:', error);
      throw new DaemonError('Failed to start daemon', error as Error);
    }
  }

  /**
   * Connect to a daemon
   */
  private async connect(hostId: string): Promise<void> {
    logger.debug('Connecting to daemon:', hostId);

    try {
      await this.request.request(
        DELUGE_METHODS.WEB_CONNECT,
        [hostId]
      );
      logger.info('Connected to daemon');
    } catch (error) {
      logger.error('Failed to connect to daemon:', error);
      throw new DaemonError('Failed to connect to daemon', error as Error);
    }
  }

  /**
   * Build DaemonInfo object from status info
   */
  private buildDaemonInfo(statusInfo: DaemonStatusInfo): DaemonInfo {
    const host = statusInfo.host;
    return {
      status: statusInfo.status,
      port: host ? host[2] : null,
      ip: host ? host[1] : null,
      host_id: statusInfo.hostId,
      version: statusInfo.info?.version || null,
    };
  }

  /**
   * Get server configuration
   */
  async getServerConfig(): Promise<ServerConfig> {
    logger.debug('Getting server configuration');

    try {
      const payload = await this.request.request<ServerConfig>(
        DELUGE_METHODS.CORE_GET_CONFIG,
        []
      );

      if (!payload.result) {
        throw new ConnectionError('No config result');
      }

      logger.debug('Server config retrieved');
      this.serverConfig = payload.result;
      return this.serverConfig;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Access denied by remote server') {
          logger.error('Remote connections disabled');
          throw new ConnectionError('Remote connections are not enabled on your Deluge server');
        }
      }

      logger.error('Failed to get server config:', error);
      throw new ConnectionError('Failed to get server configuration', error as Error);
    }
  }

  /**
   * Get current daemon info
   */
  getDaemonInfo(): DaemonInfo | null {
    return this.daemonInfo;
  }

  /**
   * Get server configuration
   */
  getConfig(): ServerConfig {
    return this.serverConfig;
  }
}
