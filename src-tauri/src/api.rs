//! A pooled HTTP client for the Jev API.
//!
//! The generic HTTP plugin builds a fresh `reqwest::Client` per call, so every
//! Smart Paste paid a full DNS + TCP + TLS handshake — roughly 700 ms before a
//! single request byte left the machine. One long-lived client keeps the
//! connection open between pastes, and a background ping stops it going idle,
//! so the hotkey usually spends nothing on setup.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// Only this origin may be reached. The webview hands us a URL, so the host is
/// pinned here rather than trusted from the frontend.
const API_ORIGIN: &str = "https://api.typesafe.ai";

/// How long an unused connection is kept in the pool.
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(300);

/// How often the connection is exercised so the next paste finds it warm.
/// One tiny request per minute is cheap next to the handshake it avoids.
const WARM_UP_INTERVAL: Duration = Duration::from_secs(60);

/// Ceiling for a Smart Paste request, well beyond normal inference time.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// Upper bound for the warm-up ping, which must never outlive its interval.
const WARM_UP_TIMEOUT: Duration = Duration::from_secs(10);

/// Headers describing a transfer encoding we have already undone by the time
/// the body reaches the webview; forwarding them would mislead `Response`.
const STRIPPED_HEADERS: [&str; 2] = ["content-encoding", "content-length"];

/// Shown to the user (via the overlay's error text) when no key is on file.
/// Mirrored verbatim in `src/config.ts` — the frontend matches on this exact
/// string to decide when to offer an "Open Settings" button.
pub const MISSING_KEY_MESSAGE: &str = "No TypeSafe API key configured. Add one in Settings.";

/// Emitted after `set_api_key` saves successfully, so an already-open overlay
/// can clear a stale "no key" message without restarting the app.
const API_KEY_UPDATED_EVENT: &str = "smart-paste://api-key-updated";

static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// The user's own API key, loaded from disk at startup and updated in place
/// by `set_api_key`. Never sent to the webview: the SDK running there is
/// given a placeholder, and every real request gets its `Authorization`
/// header attached here instead.
static API_KEY: OnceLock<RwLock<Option<String>>> = OnceLock::new();

/// On-disk shape of the config file. `#[serde(default)]` so an empty or
/// partially-written file is just "no key yet", not a parse error.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Config {
    #[serde(default)]
    typesafe_api_key: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

/// Load the saved API key (if any) from disk into memory.
///
/// A missing or unreadable config file just means no key has been saved yet;
/// that's the normal state for a fresh install, not an error.
pub fn load_api_key(app: &AppHandle) {
    let key = config_path(app)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| serde_json::from_str::<Config>(&text).ok())
        .and_then(|config| config.typesafe_api_key);
    let _ = API_KEY.set(RwLock::new(key));
}

fn api_key() -> Option<String> {
    API_KEY.get()?.read().ok()?.clone()
}

/// Whether a key has been saved, so the UI can tell "not configured" apart
/// from any other failure.
#[tauri::command]
pub fn has_api_key() -> bool {
    api_key().is_some()
}

/// Save the user's API key to disk and make it take effect immediately.
#[tauri::command]
pub fn set_api_key(app: AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    let value = if trimmed.is_empty() { None } else { Some(trimmed) };

    let path = config_path(&app)?;
    let config = Config {
        typesafe_api_key: value.clone(),
    };
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;

    if let Some(lock) = API_KEY.get() {
        *lock.write().map_err(|e| e.to_string())? = value;
    } else {
        let _ = API_KEY.set(RwLock::new(value));
    }

    let _ = app.emit(API_KEY_UPDATED_EVENT, ());
    Ok(())
}

/// The shared client. Cloning is cheap; the connection pool is what matters.
fn client() -> &'static reqwest::Client {
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .pool_idle_timeout(POOL_IDLE_TIMEOUT)
            .tcp_keepalive(POOL_IDLE_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .expect("failed to build the HTTP client")
    })
}

/// Open the connection at startup and keep it from going idle.
///
/// Failures are ignored: a cold connection is a slow paste, not a broken one.
pub fn warm_up() {
    tauri::async_runtime::spawn(async {
        loop {
            if let Ok(response) = client()
                .head(API_ORIGIN)
                .timeout(WARM_UP_TIMEOUT)
                .send()
                .await
            {
                // The body must be drained before the connection returns to
                // the pool, otherwise the socket is dropped and this was moot.
                let _ = response.bytes().await;
            }
            tokio::time::sleep(WARM_UP_INTERVAL).await;
        }
    });
}

/// A `fetch` call forwarded from the webview.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequest {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

/// Enough of a `Response` for the webview to rebuild one.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

/// Perform a request against the Jev API over the pooled connection.
#[tauri::command]
pub async fn api_request(request: ApiRequest) -> Result<ApiResponse, String> {
    if !request.url.starts_with(API_ORIGIN) {
        return Err(format!("Refusing to call a host other than {API_ORIGIN}"));
    }

    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|_| format!("Unsupported HTTP method: {}", request.method))?;

    let mut builder = client().request(method, &request.url);
    for (name, value) in &request.headers {
        // The webview's SDK sets its own placeholder Authorization header;
        // the real key is attached below instead of forwarded from the frontend.
        if name.eq_ignore_ascii_case("authorization") {
            continue;
        }
        builder = builder.header(name, value);
    }
    builder = builder.header(
        "authorization",
        format!("Bearer {}", api_key().ok_or_else(|| MISSING_KEY_MESSAGE.to_string())?),
    );
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .filter(|(name, _)| !STRIPPED_HEADERS.contains(&name.as_str()))
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.to_string(), value.to_string()))
        })
        .collect();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(ApiResponse {
        status,
        headers,
        body,
    })
}
