import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Connection, StorageData } from '@/types';
import { DEFAULTS, STORAGE_KEYS } from '@/config/constants';

/**
 * Chrome storage adapter for Zustand
 */
const chromeStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.local.get(name);
      return result[name] ? JSON.stringify(result[name]) : null;
    } catch (error) {
      console.error('Error reading from chrome.storage:', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await chrome.storage.local.set({ [name]: JSON.parse(value) });
    } catch (error) {
      console.error('Error writing to chrome.storage:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await chrome.storage.local.remove(name);
    } catch (error) {
      console.error('Error removing from chrome.storage:', error);
    }
  },
};

/**
 * Application state interface
 */
interface DelugeFlowState extends StorageData {
  // Actions
  addConnection: (connection: Connection) => void;
  updateConnection: (index: number, connection: Connection) => void;
  removeConnection: (index: number) => void;
  setPrimaryServerIndex: (index: number) => void;

  setSetting: <K extends keyof StorageData>(
    key: K,
    value: StorageData[K]
  ) => void;

  setServerDefaultLabel: (serverIndex: number, label: string) => void;
  getServerDefaultLabel: (serverIndex: number) => string | undefined;

  setAccordionState: (id: string, state: boolean) => void;
  getAccordionState: (id: string) => boolean;

  reset: () => void;
}

/**
 * Initial state with defaults
 */
const initialState: StorageData = {
  connections: [],
  primaryServerIndex: 0,
  enable_context_menu: DEFAULTS.ENABLE_CONTEXT_MENU,
  enable_context_menu_with_options: DEFAULTS.ENABLE_CONTEXT_MENU_WITH_OPTIONS,
  enable_keyboard_macro: DEFAULTS.ENABLE_KEYBOARD_MACRO,
  enable_leftclick: DEFAULTS.ENABLE_LEFTCLICK,
  send_cookies: DEFAULTS.SEND_COOKIES,
  intercept_torrent_downloads: DEFAULTS.INTERCEPT_TORRENT_DOWNLOADS,
  enable_debug_logging: DEFAULTS.ENABLE_DEBUG_LOGGING,
  link_regex: DEFAULTS.TORRENT_LINK_REGEX,
  popup_width: DEFAULTS.POPUP_WIDTH,
  popup_height: DEFAULTS.POPUP_HEIGHT,
  inpage_notification: DEFAULTS.INPAGE_NOTIFICATION,
  server_default_labels: {},
  accordion_states: {},
};

/**
 * Zustand store for DelugeFlow state management
 */
export const useStore = create<DelugeFlowState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Connection management
      addConnection: (connection) =>
        set((state) => ({
          connections: [...(state.connections || []), connection],
        })),

      updateConnection: (index, connection) =>
        set((state) => ({
          connections: state.connections?.map((conn, i) =>
            i === index ? connection : conn
          ),
        })),

      removeConnection: (index) =>
        set((state) => ({
          connections: state.connections?.filter((_, i) => i !== index),
          // Reset primary index if we removed the primary server
          primaryServerIndex:
            state.primaryServerIndex === index
              ? 0
              : state.primaryServerIndex! > index
              ? state.primaryServerIndex! - 1
              : state.primaryServerIndex,
        })),

      setPrimaryServerIndex: (index) =>
        set({ primaryServerIndex: index }),

      // Generic setting setter
      setSetting: (key, value) =>
        set({ [key]: value }),

      // Server default labels
      setServerDefaultLabel: (serverIndex, label) =>
        set((state) => ({
          server_default_labels: {
            ...state.server_default_labels,
            [serverIndex.toString()]: label,
          },
        })),

      getServerDefaultLabel: (serverIndex) => {
        return get().server_default_labels?.[serverIndex.toString()];
      },

      // Accordion states
      setAccordionState: (id, state) =>
        set((prev) => ({
          accordion_states: {
            ...prev.accordion_states,
            [id]: state,
          },
        })),

      getAccordionState: (id) => {
        return get().accordion_states?.[id] ?? false;
      },

      // Reset to defaults
      reset: () => set(initialState),
    }),
    {
      name: 'delugeflow-storage',
      storage: createJSONStorage(() => chromeStorage),
    }
  )
);

/**
 * Hook to get connections
 */
export const useConnections = () => useStore((state) => state.connections);

/**
 * Hook to get primary server index
 */
export const usePrimaryServerIndex = () =>
  useStore((state) => state.primaryServerIndex);

/**
 * Hook to get a specific setting
 */
export const useSetting = <K extends keyof StorageData>(key: K) =>
  useStore((state) => state[key]);

/**
 * Hook to get all settings
 */
export const useSettings = () =>
  useStore((state) => ({
    enable_context_menu: state.enable_context_menu,
    enable_context_menu_with_options: state.enable_context_menu_with_options,
    enable_keyboard_macro: state.enable_keyboard_macro,
    enable_leftclick: state.enable_leftclick,
    send_cookies: state.send_cookies,
    intercept_torrent_downloads: state.intercept_torrent_downloads,
    enable_debug_logging: state.enable_debug_logging,
    inpage_notification: state.inpage_notification,
    link_regex: state.link_regex,
    popup_width: state.popup_width,
    popup_height: state.popup_height,
  }));
