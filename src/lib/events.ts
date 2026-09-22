import { listen } from "@tauri-apps/api/event";

/** Emitted by the tray when the user asks for the overlay. Mirrors `tray.rs`. */
const SHOW_OVERLAY_EVENT = "smart-paste://show-overlay";

/** Emitted after the Settings window saves a key. Mirrors `api.rs`. */
const API_KEY_UPDATED_EVENT = "smart-paste://api-key-updated";

/**
 * Subscribe to overlay requests coming from the tray icon.
 * Resolves to an unlisten function.
 */
export function onShowOverlayRequested(handler: () => void): Promise<() => void> {
  return listen(SHOW_OVERLAY_EVENT, () => handler());
}

/**
 * Subscribe to API key saves, so an already-open overlay can clear a stale
 * "no key" message without restarting the app.
 * Resolves to an unlisten function.
 */
export function onApiKeyUpdated(handler: () => void): Promise<() => void> {
  return listen(API_KEY_UPDATED_EVENT, () => handler());
}
