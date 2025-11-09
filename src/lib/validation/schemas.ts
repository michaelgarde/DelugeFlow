import { z } from 'zod';

/**
 * Connection schema validation
 */
export const ConnectionSchema = z.object({
  url: z.string().url('Invalid server URL'),
  pass: z.string().min(1, 'Password is required'),
});

/**
 * Daemon info schema
 */
export const DaemonInfoSchema = z.object({
  status: z.string(),
  port: z.number().nullable(),
  ip: z.string().nullable(),
  host_id: z.string().nullable(),
  version: z.string().nullable(),
});

/**
 * Server config schema
 */
export const ServerConfigSchema = z.record(z.unknown());

/**
 * Plugin info schema
 */
export const PluginInfoSchema = z.object({
  labels: z.array(z.string()).optional(),
  hasLabelPlugin: z.boolean().optional(),
  hasLabelPlusPlugin: z.boolean().optional(),
});

/**
 * Torrent options schema
 */
export const TorrentOptionsSchema = z.object({
  download_location: z.string().optional(),
  add_paused: z.boolean().optional(),
  move_completed_path: z.string().optional(),
  move_completed: z.boolean().optional(),
  max_download_speed: z.number().optional(),
  max_upload_speed: z.number().optional(),
  max_connections: z.number().optional(),
  max_upload_slots: z.number().optional(),
  prioritize_first_last_pieces: z.boolean().optional(),
});

/**
 * Plugin options schema
 */
export const PluginOptionsSchema = z.object({
  label: z.string().optional(),
}).catchall(z.unknown());

/**
 * Cookie schema
 */
export const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  sameSite: z.string().optional(),
  expirationDate: z.number().optional(),
});

/**
 * Storage data schema
 */
export const StorageDataSchema = z.object({
  connections: z.array(ConnectionSchema).optional().default([]),
  primaryServerIndex: z.number().int().nonnegative().optional().default(0),
  enable_context_menu: z.boolean().optional().default(true),
  enable_context_menu_with_options: z.boolean().optional().default(true),
  enable_keyboard_macro: z.boolean().optional().default(true),
  enable_leftclick: z.boolean().optional().default(false),
  send_cookies: z.boolean().optional().default(true),
  intercept_torrent_downloads: z.boolean().optional().default(true),
  enable_debug_logging: z.boolean().optional().default(false),
  link_regex: z.string().optional().default('^magnet:'),
  popup_width: z.number().int().positive().optional().default(500),
  popup_height: z.number().int().positive().optional().default(400),
  inpage_notification: z.boolean().optional().default(true),
  server_default_labels: z.record(z.string()).optional().default({}),
  accordion_states: z.record(z.boolean()).optional().default({}),
});

/**
 * Torrent info schema
 */
export const TorrentInfoSchema = z.object({
  hash: z.string().optional(),
  name: z.string(),
  progress: z.number().optional(),
  download_speed: z.number().optional(),
  upload_speed: z.number().optional(),
  eta: z.number().optional(),
  state: z.string().optional(),
  total_size: z.number().optional(),
  total_done: z.number().optional(),
  total_uploaded: z.number().optional(),
  time_added: z.number().optional(),
});

/**
 * Deluge request schema
 */
export const DelugeRequestSchema = z.object({
  method: z.string(),
  params: z.array(z.unknown()),
  id: z.string(),
});

/**
 * Deluge response schema
 */
export const DelugeResponseSchema = z.object({
  result: z.unknown().optional(),
  error: z
    .object({
      message: z.string(),
      code: z.number(),
    })
    .optional(),
  id: z.string(),
});

/**
 * Message schema
 */
export const MessageSchema = z.object({
  action: z.string().optional(),
  method: z.string().optional(),
}).catchall(z.unknown());

/**
 * Message response schema
 */
export const MessageResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
}).catchall(z.unknown());

/**
 * Context menu click data schema
 */
export const ContextMenuClickDataSchema = z.object({
  url: z.string(),
  serverIndex: z.number().int().nonnegative().optional(),
});

/**
 * Validation helper - parse with default
 */
export function parseWithDefault<T extends z.ZodType>(
  schema: T,
  data: unknown,
  defaultValue: z.infer<T>
): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (error) {
    console.error('Validation error, using default:', error);
    return defaultValue;
  }
}

/**
 * Validation helper - safe parse
 */
export function safeParse<T extends z.ZodType>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
