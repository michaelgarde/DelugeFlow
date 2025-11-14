/**
 * Content Script Modules
 *
 * This module exports all content script components:
 * - EventHandlers: DOM event handling for torrent link interception
 * - Modal: UI component for torrent options
 * - ContentHandler: Main coordinator that ties everything together
 */

export { EventHandlers, SiteMeta, EventCallback } from './handlers/EventHandlers';
export {
  Modal,
  TorrentInfo,
  TorrentRequest,
  ServerInfo,
  PluginData,
  ServerConfig,
  ModalData,
  FormData,
  SubmitCallback,
} from './ui/Modal';
export { ContentHandler } from './ContentHandler';
