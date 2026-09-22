import { invoke } from "@tauri-apps/api/core";

import type { ActiveContext } from "../types";

/** Title and application name of the window that currently has focus. */
export function getActiveContext(): Promise<ActiveContext> {
  return invoke<ActiveContext>("get_active_context");
}

/**
 * Synthesize Ctrl+V in whichever window holds focus.
 *
 * @param restoreFocus - Pass `true` only when the overlay was just hidden, so
 * Rust waits for the OS to hand focus back. On the silent hotkey path nothing
 * took focus in the first place and the wait would be wasted latency.
 */
export function simulatePaste(restoreFocus: boolean): Promise<void> {
  return invoke<void>("simulate_paste", { restoreFocus });
}

/** Whether a TypeSafe API key has been saved. */
export function hasApiKey(): Promise<boolean> {
  return invoke<boolean>("has_api_key");
}

/** Save the user's own TypeSafe API key, replacing any previously saved one. */
export function setApiKey(key: string): Promise<void> {
  return invoke<void>("set_api_key", { key });
}

/** Open the Settings window, or focus it if it's already open. */
export function openSettingsWindow(): Promise<void> {
  return invoke<void>("open_settings_window");
}
