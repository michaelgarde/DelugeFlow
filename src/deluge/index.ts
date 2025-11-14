/**
 * Deluge module exports
 * Provides easy access to all Deluge-related classes
 */

export { DelugeAuth } from './DelugeAuth';
export { DelugeRequest } from './DelugeRequest';
export { DelugeDaemon } from './DelugeDaemon';
export { DelugePlugins } from './DelugePlugins';
export { DelugeTorrent } from './DelugeTorrent';
export { DelugeConnection, delugeConnection } from './DelugeConnection';

// Re-export for convenience
export type { Connection, PluginInfo, TorrentOptions, PluginOptions, CookieMap } from '@/types';
