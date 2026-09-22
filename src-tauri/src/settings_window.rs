//! The Settings window: a plain, decorated window for entering the user's own
//! TypeSafe API key. Deliberately not the overlay window — that one is a
//! small frameless always-on-top popup, unsuitable for a form the user needs
//! to find again later.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

/// Label of the settings window, used to find it again instead of opening a
/// second copy.
const SETTINGS_LABEL: &str = "settings";

/// Label of the overlay window (see `tauri.conf.json`), which is permanently
/// always-on-top. Settings must outrank it somehow when opened; hiding the
/// overlay is far more reliable than trying to out-rank it in z-order, since
/// `set_focus`'s underlying `SetForegroundWindow` can silently no-op on
/// Windows when the caller isn't already the foreground process.
const OVERLAY_LABEL: &str = "main";

/// Loaded by the same frontend bundle as the overlay; `main.tsx` branches on
/// the URL hash to render the settings form instead of the overlay.
const SETTINGS_URL: &str = "index.html#settings";

/// Build the Settings window hidden, ahead of time.
///
/// A WebView2 controller takes a moment to spin up on its first creation; if
/// the window were built lazily on first open and shown immediately, it could
/// briefly (or, if the user closes it before that finishes, permanently) show
/// as a blank white rectangle. Building it once at startup, hidden, means the
/// content has already finished loading by the time the user ever asks to see
/// it — `open_settings` then only ever shows and focuses an existing window.
pub fn preload<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.get_webview_window(SETTINGS_LABEL).is_some() {
        return Ok(());
    }
    build(app)?;
    Ok(())
}

/// Open the Settings window, or focus it if it's already open.
///
/// Generic over `Runtime` so it can be called both from the tray (which is
/// itself generic, to stay testable) and from the concrete command below.
pub fn open_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    // The overlay is permanently always-on-top, so anything opened while it's
    // visible would otherwise appear behind it regardless of focus. Hiding it
    // outright sidesteps the always-on-top band entirely, rather than trying
    // to win a z-order fight against it.
    if let Some(overlay) = app.get_webview_window(OVERLAY_LABEL) {
        overlay.hide().map_err(|e| e.to_string())?;
    }

    let window = match app.get_webview_window(SETTINGS_LABEL) {
        Some(window) => window,
        // Only reached if `preload` hasn't run yet or the window was somehow
        // dropped; the normal path always finds the preloaded window above.
        None => build(app).map_err(|e| e.to_string())?,
    };

    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings(&app)
}

fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::WebviewWindow<R>> {
    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App(SETTINGS_URL.into()))
        .title("Smart Paste Settings")
        .inner_size(420.0, 280.0)
        .resizable(true)
        .decorations(true)
        .always_on_top(false)
        .skip_taskbar(false)
        .visible(false)
        .center()
        .build()
}
