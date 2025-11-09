/**
 * Server connection configuration
 */
export interface Connection {
  /** Deluge Web UI URL */
  url: string;
  /** Deluge Web UI password */
  pass: string;
}

/**
 * Daemon information
 */
export interface DaemonInfo {
  /** Connection status */
  status: string;
  /** Daemon port */
  port: number | null;
  /** Daemon IP address */
  ip: string | null;
  /** Host ID */
  host_id: string | null;
  /** Deluge version */
  version: string | null;
}

/**
 * Server configuration from Deluge
 */
export interface ServerConfig {
  [key: string]: unknown;
}

/**
 * Plugin information
 */
export interface PluginInfo {
  /** Available labels */
  labels?: string[];
  /** Whether label plugin is available */
  hasLabelPlugin?: boolean;
  /** Whether labelplus plugin is available */
  hasLabelPlusPlugin?: boolean;
}

/**
 * Torrent options for adding
 */
export interface TorrentOptions {
  /** Download location */
  download_location?: string;
  /** Add torrent paused */
  add_paused?: boolean;
  /** Move completed location */
  move_completed_path?: string;
  /** Enable move on completion */
  move_completed?: boolean;
  /** Max download speed */
  max_download_speed?: number;
  /** Max upload speed */
  max_upload_speed?: number;
  /** Max connections */
  max_connections?: number;
  /** Max upload slots */
  max_upload_slots?: number;
  /** Prioritize first/last pieces */
  prioritize_first_last_pieces?: boolean;
}

/**
 * Plugin options (e.g., labels)
 */
export interface PluginOptions {
  /** Label to assign to torrent */
  label?: string;
  [key: string]: unknown;
}

/**
 * Cookie object
 */
export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expirationDate?: number;
}

/**
 * Cookie map (name -> value)
 */
export type CookieMap = Record<string, string>;

/**
 * Notification options
 */
export interface NotificationOptions {
  /** Notification message */
  message: string;
  /** Context message (subtitle) */
  contextMessage?: string;
  /** Icon type */
  iconType?: 'success' | 'error' | 'warning' | 'info';
  /** Whether notification is clickable */
  isClickable?: boolean;
  /** Require user interaction to dismiss */
  requireInteraction?: boolean;
  /** Auto-dismiss timeout (ms), 0 = never */
  duration?: number;
  /** Notification ID */
  id?: string;
}

/**
 * Toast notification options
 */
export interface ToastOptions {
  /** Toast message */
  message: string;
  /** Toast type */
  type?: 'success' | 'error' | 'warning' | 'info';
  /** Duration before auto-dismiss (ms), 0 = never */
  duration?: number;
}

/**
 * Message sent between contexts
 */
export interface Message {
  /** Action/method name */
  action?: string;
  method?: string;
  /** Message data */
  [key: string]: unknown;
}

/**
 * Message response
 */
export interface MessageResponse {
  /** Success flag */
  success?: boolean;
  /** Error message if failed */
  error?: string;
  /** Response data */
  [key: string]: unknown;
}

/**
 * Storage data structure
 */
export interface StorageData {
  connections?: Connection[];
  primaryServerIndex?: number;
  enable_context_menu?: boolean;
  enable_context_menu_with_options?: boolean;
  enable_keyboard_macro?: boolean;
  enable_leftclick?: boolean;
  send_cookies?: boolean;
  intercept_torrent_downloads?: boolean;
  enable_debug_logging?: boolean;
  link_regex?: string;
  popup_width?: number;
  popup_height?: number;
  inpage_notification?: boolean;
  server_default_labels?: Record<string, string>;
  accordion_states?: Record<string, boolean>;
}

/**
 * Torrent info from Deluge
 */
export interface TorrentInfo {
  /** Torrent hash */
  hash?: string;
  /** Torrent name */
  name: string;
  /** Download progress (0-100) */
  progress?: number;
  /** Download speed (bytes/s) */
  download_speed?: number;
  /** Upload speed (bytes/s) */
  upload_speed?: number;
  /** ETA (seconds) */
  eta?: number;
  /** State */
  state?: string;
  /** Total size (bytes) */
  total_size?: number;
  /** Downloaded (bytes) */
  total_done?: number;
  /** Uploaded (bytes) */
  total_uploaded?: number;
  /** Date added (timestamp) */
  time_added?: number;
}

/**
 * Deluge JSON-RPC request
 */
export interface DelugeRequest {
  method: string;
  params: unknown[];
  id: string;
}

/**
 * Deluge JSON-RPC response
 */
export interface DelugeResponse<T = unknown> {
  result?: T;
  error?: {
    message: string;
    code: number;
  };
  id: string;
}

/**
 * Retry options for exponential backoff
 */
export interface RetryOptions {
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Base delay in ms */
  baseDelay?: number;
  /** Maximum delay in ms */
  maxDelay?: number;
  /** Function to determine if retry should happen */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'log' | 'info' | 'warn' | 'error' | 'important';

/**
 * Context menu click data
 */
export interface ContextMenuClickData {
  url: string;
  serverIndex?: number;
}
