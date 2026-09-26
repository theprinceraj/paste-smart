use std::thread;
use std::time::Duration;

use active_win_pos_rs::get_active_window;
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Serialize;
use tauri::AppHandle;

mod api;
mod settings_window;
mod tray;

/// Milliseconds to wait before synthesizing the paste, so the OS has time to
/// restore focus to the window that was active before the overlay appeared.
const FOCUS_RESTORE_DELAY_MS: u64 = 150;

/// Title and owning application of the window the user was working in.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveContext {
    title: String,
    app_name: String,
}

#[tauri::command]
fn get_active_context() -> Result<ActiveContext, String> {
    get_active_window()
        .map(|window| ActiveContext {
            title: window.title,
            app_name: window.app_name,
        })
        .map_err(|_| "Failed to read the active window".to_string())
}

/// Synthesize Ctrl+V in whichever window currently holds focus.
///
/// `restore_focus` is set only when the overlay was on screen and has just
/// been hidden. On the silent hotkey path nothing ever took focus away from
/// the target window, so waiting would be pure latency.
#[tauri::command]
fn simulate_paste(restore_focus: bool) -> Result<(), String> {
    if restore_focus {
        thread::sleep(Duration::from_millis(FOCUS_RESTORE_DELAY_MS));
    }

    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| e.to_string())?;
    let typed = enigo.key(Key::Unicode('v'), Direction::Click);
    // Always release Control, even if the keystroke failed, so the modifier
    // is never left stuck down for the user.
    let released = enigo.key(Key::Control, Direction::Release);

    typed.map_err(|e| e.to_string())?;
    released.map_err(|e| e.to_string())?;
    Ok(())
}

/// Show how many clipboard entries are tracked in the tray tooltip.
#[tauri::command]
fn set_tray_status(app: AppHandle, items: usize) -> Result<(), String> {
    tray::set_status(&app, items)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))?;

            tray::setup(app)?;
            // Load the user's saved API key, if any, before anything might need it.
            api::load_api_key(app.handle());
            // Open the connection to the API now, not on the first paste.
            api::warm_up();
            // Build the Settings window hidden now, so its first-ever appearance
            // later isn't a blank rectangle while WebView2 spins up.
            settings_window::preload(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_active_context,
            simulate_paste,
            set_tray_status,
            api::api_request,
            api::has_api_key,
            api::set_api_key,
            settings_window::open_settings_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
