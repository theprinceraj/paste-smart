//! The Settings window: a plain, decorated window for entering the user's own
//! TypeSafe API key. Deliberately not the overlay window — that one is a
//! small frameless always-on-top popup, unsuitable for a form the user needs
//! to find again later.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

/// Label of the settings window, used to find it again instead of opening a
/// second copy.
const SETTINGS_LABEL: &str = "settings";

/// Loaded by the same frontend bundle as the overlay; `main.tsx` branches on
/// the URL hash to render the settings form instead of the overlay.
const SETTINGS_URL: &str = "index.html#settings";

/// Open the Settings window, or focus it if it's already open.
///
/// Generic over `Runtime` so it can be called both from the tray (which is
/// itself generic, to stay testable) and from the concrete command below.
pub fn open_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    build(app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings(&app)
}

fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App(SETTINGS_URL.into()))
        .title("Smart Paste Settings")
        .inner_size(420.0, 280.0)
        .resizable(true)
        .decorations(true)
        .always_on_top(false)
        .skip_taskbar(false)
        .center()
        .build()?;
    Ok(())
}
