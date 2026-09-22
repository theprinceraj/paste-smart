//! System tray icon: proof that Smart Paste is running, plus a way to summon
//! the overlay and quit without a taskbar entry.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Runtime};

use crate::settings_window::open_settings;

/// Id of the tray icon, used to look it up when the tooltip changes.
pub const TRAY_ID: &str = "smart-paste";

/// Event the webview listens for to open the overlay, mirroring the hotkey.
pub const SHOW_OVERLAY_EVENT: &str = "smart-paste://show-overlay";

/// Ask the frontend to open the overlay so it follows the same path as the
/// hotkey: capture the active window first, then show.
fn request_overlay<R: Runtime>(app: &AppHandle<R>) {
    if let Err(error) = app.emit(SHOW_OVERLAY_EVENT, ()) {
        eprintln!("Failed to request the overlay: {error}");
    }
}

/// Build the tray icon and wire its menu and click handlers.
pub fn setup<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show Smart Paste", true, None::<&str>)?;
    let hotkey = MenuItem::with_id(app, "hotkey", "Hotkey: Ctrl+Shift+V", false, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hotkey, &settings, &separator, &quit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(
            app.default_window_icon()
                .expect("the bundle always embeds a default icon")
                .clone(),
        )
        .tooltip("Smart Paste · running")
        .menu(&menu)
        // Left click opens the overlay; the menu stays on right click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => request_overlay(app),
            "settings" => {
                if let Err(error) = open_settings(app) {
                    eprintln!("Failed to open Settings: {error}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                request_overlay(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

/// Reflect the tracked clipboard count in the tray tooltip.
pub fn set_status<R: Runtime>(app: &AppHandle<R>, items: usize) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "Tray icon is not available".to_string())?;

    let label = match items {
        0 => "Smart Paste · no clipboard history yet".to_string(),
        1 => "Smart Paste · 1 item · Ctrl+Shift+V".to_string(),
        n => format!("Smart Paste · {n} items · Ctrl+Shift+V"),
    };

    tray.set_tooltip(Some(label)).map_err(|e| e.to_string())
}
