# Smart Paste

A lightweight Windows clipboard utility built with Tauri 2, React and TypeScript.

- Clipboard text history (last 25 unique entries), kept in memory by polling.
- `Ctrl+Shift+V` pastes the best match straight into the focused window; the
  overlay only appears when Jev is unsure or something fails.
- **Smart Paste** sends the history plus the active window title and app name to
  Jev (`jev-latest`) via [`@typesafe-ai/sdk`](https://docs.typesafe.ai/sdk/javascript),
  and pastes the entry it picks when confidence is high enough.
- Clicking any entry pastes it directly.
- A system tray icon shows the app is alive, opens the overlay, and quits it.

## Setup

```sh
bun install
cp .env.example .env
bun run tauri dev
```

Your TypeSafe API key isn't set via `.env` — open the app, click the tray
icon → **Settings…**, and paste it in there. It's saved to a local config
file and read by Rust (`src-tauri/src/api.rs`); it never reaches the webview
bundle. The request itself is made from Rust: the API rejects browser
origins, so a plain webview `fetch` fails with _Disallowed CORS origin_. The
allowed host is scoped in `src-tauri/src/api.rs`'s `API_ORIGIN` check.

Without a key the overlay still works as a plain clipboard picker; Smart Paste
shows an "Open Settings" prompt instead of failing silently.

## Using it

| Action                 | Result                                              |
| ---------------------- | --------------------------------------------------- |
| `Ctrl+Shift+V`         | Show the overlay (captures the active window first) |
| `Smart Paste`          | Ask Jev to choose, then auto-paste if confident     |
| Click an entry         | Paste that entry                                    |
| `Esc`, click away, `✕` | Hide the overlay                                    |

The window starts hidden and stays out of the taskbar. The tray icon is the
only visible sign that the app is running: its tooltip reports the number of
tracked entries (`Smart Paste · 7 items · Ctrl+Shift+V`), and _Quit_ in its menu
exits the app.

## Layout

```
src/
  components/   presentational UI (Overlay, HistoryList, HistoryItem, …)
  hooks/        stateful side effects (clipboard polling, hotkey, Smart Paste)
  lib/          thin wrappers over Tauri APIs and pure clipboard helpers
  services/     Jev client and the paste sequence
  types/        shared interfaces
  config.ts     thresholds, poll interval, hotkey
  App.tsx       the overlay (default root)
  Settings.tsx  the API key form, rendered instead of App.tsx in the Settings window
src-tauri/
  src/lib.rs              get_active_context (active-win-pos-rs), simulate_paste (enigo)
  src/api.rs              pooled HTTP client, user API key storage
  src/settings_window.rs  opens/focuses the Settings window
  src/tray.rs             tray icon, menu, and the tooltip status
```

## Tuning

`src/config.ts` holds the history limit, poll interval, accelerator and the
`MIN_CHOICE_CONFIDENCE` / `MIN_RELEVANCE` thresholds that gate auto-pasting.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
