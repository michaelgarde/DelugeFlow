/**
 * Network-related constants
 */
export const NETWORK = {
  /** Delay before attempting to reconnect after disconnect (ms) */
  RECONNECT_DELAY_MS: 2000,

  /** Maximum delay for exponential backoff (ms) */
  MAX_BACKOFF_DELAY_MS: 10000,

  /** Base delay for exponential backoff (ms) */
  BASE_BACKOFF_DELAY_MS: 1000,

  /** Maximum number of retry attempts */
  MAX_RETRIES: 3,

  /** Request timeout duration (ms) */
  REQUEST_TIMEOUT_MS: 30000,

  /** Maximum message queue size before dropping messages */
  MAX_MESSAGE_QUEUE_SIZE: 100,

  /** Jitter factor for randomizing backoff (0.9 - 1.1) */
  JITTER_MIN: 0.9,
  JITTER_MAX: 1.1,
} as const;

/**
 * Notification/Toast duration constants
 */
export const NOTIFICATION = {
  /** Duration for success messages (ms) */
  SUCCESS_DURATION_MS: 3000,

  /** Duration for error messages (ms) */
  ERROR_DURATION_MS: 5000,

  /** Duration for warning messages (ms) */
  WARNING_DURATION_MS: 5000,

  /** Duration for info messages (ms) */
  INFO_DURATION_MS: 5000,

  /** Duration for persistent messages (0 = no auto-dismiss) */
  PERSISTENT_DURATION_MS: 0,
} as const;

/**
 * UI-related constants
 */
export const UI = {
  /** Popup refresh interval when active (ms) */
  POPUP_REFRESH_INTERVAL_MS: 3000,

  /** Minimum popup width (px) */
  POPUP_MIN_WIDTH: 400,

  /** Maximum popup width (px) */
  POPUP_MAX_WIDTH: 800,

  /** Minimum popup height (px) */
  POPUP_MIN_HEIGHT: 300,

  /** Maximum popup height (px) */
  POPUP_MAX_HEIGHT: 600,

  /** Maximum visible server tabs in popup */
  MAX_VISIBLE_SERVER_TABS: 3,
} as const;

/**
 * Storage keys used in chrome.storage.local
 */
export const STORAGE_KEYS = {
  /** Server connection configurations */
  CONNECTIONS: 'connections',

  /** Index of primary server */
  PRIMARY_SERVER_INDEX: 'primaryServerIndex',

  /** Enable context menu feature */
  ENABLE_CONTEXT_MENU: 'enable_context_menu',

  /** Enable context menu with options dialog */
  ENABLE_CONTEXT_MENU_WITH_OPTIONS: 'enable_context_menu_with_options',

  /** Enable keyboard macro (Ctrl+click) */
  ENABLE_KEYBOARD_MACRO: 'enable_keyboard_macro',

  /** Enable left-click interception */
  ENABLE_LEFTCLICK: 'enable_leftclick',

  /** Send cookies with torrent requests */
  SEND_COOKIES: 'send_cookies',

  /** Intercept .torrent file downloads */
  INTERCEPT_TORRENT_DOWNLOADS: 'intercept_torrent_downloads',

  /** Enable debug logging */
  ENABLE_DEBUG_LOGGING: 'enable_debug_logging',

  /** Custom link regex pattern */
  LINK_REGEX: 'link_regex',

  /** Popup width */
  POPUP_WIDTH: 'popup_width',

  /** Popup height */
  POPUP_HEIGHT: 'popup_height',

  /** Enable in-page notifications */
  INPAGE_NOTIFICATION: 'inpage_notification',

  /** Per-server default labels */
  SERVER_DEFAULT_LABELS: 'server_default_labels',

  /** Accordion UI states */
  ACCORDION_STATES: 'accordion_states',
} as const;

/**
 * Default settings values
 */
export const DEFAULTS = {
  /** Default torrent link regex pattern */
  TORRENT_LINK_REGEX: '^magnet:',

  /** Default URL attribute for torrent links */
  TORRENT_URL_ATTRIBUTE: 'href',

  /** Default popup width */
  POPUP_WIDTH: 500,

  /** Default popup height */
  POPUP_HEIGHT: 400,

  /** Enable context menu by default */
  ENABLE_CONTEXT_MENU: true,

  /** Enable context menu with options by default */
  ENABLE_CONTEXT_MENU_WITH_OPTIONS: true,

  /** Enable keyboard macro by default */
  ENABLE_KEYBOARD_MACRO: true,

  /** Enable left-click handler by default */
  ENABLE_LEFTCLICK: false,

  /** Send cookies by default */
  SEND_COOKIES: true,

  /** Intercept torrent downloads by default */
  INTERCEPT_TORRENT_DOWNLOADS: true,

  /** Debug logging disabled by default */
  ENABLE_DEBUG_LOGGING: false,

  /** Enable in-page notifications by default */
  INPAGE_NOTIFICATION: true,
} as const;

/**
 * Deluge API method names
 */
export const DELUGE_METHODS = {
  // Authentication
  AUTH_LOGIN: 'auth.login',
  AUTH_CHECK_SESSION: 'auth.check_session',
  AUTH_DELETE_SESSION: 'auth.delete_session',

  // Web/Daemon
  WEB_CONNECTED: 'web.connected',
  WEB_GET_HOSTS: 'web.get_hosts',
  WEB_GET_HOST_STATUS: 'web.get_host_status',
  WEB_START_DAEMON: 'web.start_daemon',
  WEB_CONNECT: 'web.connect',
  WEB_UPDATE_UI: 'web.update_ui',
  WEB_GET_PLUGINS: 'web.get_plugins',

  // Core
  CORE_GET_CONFIG: 'core.get_config',
  CORE_ADD_TORRENT_URL: 'core.add_torrent_url',
  CORE_ADD_TORRENT_MAGNET: 'core.add_torrent_magnet',
  CORE_ADD_TORRENT_FILE: 'core.add_torrent_file',

  // Labels
  LABEL_GET_LABELS: 'label.get_labels',
  LABEL_GET_CONFIG: 'label.get_config',
  LABEL_SET_TORRENT: 'label.set_torrent',

  // LabelPlus
  LABELPLUS_GET_LABELS: 'labelplus.get_labels',
} as const;

/**
 * Notification IDs
 */
export const NOTIFICATION_IDS = {
  NEEDS_SETTINGS: 'needs-settings',
  TORRENT_ADDED: 'torrent-added',
  TORRENT_ERROR: 'torrent-error',
  CONNECTION_ERROR: 'connection-error',
  AUTH_ERROR: 'auth-error',
} as const;

/**
 * Extension name for logging and notifications
 */
export const EXTENSION_NAME = 'DelugeFlow';

/**
 * User agent string
 */
export const USER_AGENT = navigator.userAgent;
