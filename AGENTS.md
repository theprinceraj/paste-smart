# AGENTS.md

Guidance for AI coding agents (Claude Code and similar) working on this
repository. Read this before making changes.

> **Keep this file current.** If you change the architecture, add a command,
> change a performance invariant, discover a new gotcha, or invalidate anything
> written here, update this file as part of the same piece of work. A stale
> AGENTS.md is worse than none — the next agent will trust it. See
> [Maintaining this file](#maintaining-this-file).

---

## What this project is

**Smart Paste** — a Tauri 2 desktop app (Windows-first) that makes pasting
context-aware.

It tracks clipboard text history in the background. When the user presses
`Ctrl+Shift+V`, the app reads the foreground window's title and application
name, asks an AI model (Jev, via the TypeSafe API) which clipboard entry belongs
in that window, writes the winner to the clipboard, and synthesizes `Ctrl+V` —
**showing no UI at all** when it is confident.

The overlay window only appears when the model is unsure, the request fails, or
the user opens the history picker from the tray.

The core product constraint is **latency**: it competes with plain `Ctrl+V`. See
[Performance invariants](#performance-invariants) — several non-obvious design
decisions exist purely to protect this, and they are easy to undo by accident.

## Stack

| Layer    | Choice                                                                |
| -------- | --------------------------------------------------------------------- |
| Shell    | Tauri 2 (2.11.x), Rust 2021                                           |
| Frontend | React 19 + TypeScript (strict), Vite 8                                |
| Package  | **bun** (`bun.lock` — do not introduce npm/yarn/pnpm files)           |
| AI       | `@typesafe-ai/sdk` 0.6, model `jev-latest`                            |
| Lint     | oxlint (`correctness` = error), prettier, and Husky pre-commit checks |

## Commands

Run from the repo root.

```bash
bun run tauri dev      # full app, dev mode (Vite on :1420 + cargo run)
bun run dev            # Vite only
bun run build          # tsc && vite build
bun run lint           # oxlint
bun run lint:fix
bun run format         # prettier --write .
bun run format:check
bunx tsc --noEmit      # typecheck (no script alias for this)

cd src-tauri && cargo check    # fast Rust check
cd src-tauri && cargo clippy   # Rust lints
```

**Before declaring work done**, run: `bunx tsc --noEmit`, `bun run lint`,
`bun run format:check`, and `cargo clippy`. All four must be clean.

> `bun run format:check` currently flags `.claude/skills/typesafe-ai/SKILL.md`,
> which is vendored tooling, not project code. Leave it alone.

## Architecture

### Rust (`src-tauri/src/`)

| File                 | Responsibility                                                           |
| -------------------- | ------------------------------------------------------------------------ |
| `lib.rs`             | Plugin/tray wiring, `get_active_context`, `simulate_paste`, tray status  |
| `api.rs`             | **Pooled HTTP client for the Jev API**, user API key storage — see below |
| `settings_window.rs` | Opens/focuses the Settings window                                        |
| `tray.rs`            | Tray icon, menu, tooltip status, `smart-paste://show-overlay` event      |
| `main.rs`            | Thin entry point; all logic is in `lib.rs`                               |

Registered commands: `get_active_context`, `simulate_paste`, `set_tray_status`,
`api_request`, `has_api_key`, `set_api_key`, `open_settings_window`.

### Frontend (`src/`)

Strict layering — **do not collapse these**:

```
components/   presentational only. No business logic, no side effects.
hooks/        all side effects and state (clipboard, hotkey, window, tray)
services/     orchestration: jev.ts (AI), smartPaste.ts (clipboard→paste flow)
lib/          thin platform wrappers: commands, clipboard, http, events, window
types/        shared types. No `any`, anywhere.
config.ts     every tunable constant. Do not scatter magic numbers.
```

`App.tsx` wires hooks together and renders. It holds no logic of its own.

`Settings.tsx` is a second root component (the API key entry form) rendered
instead of `App.tsx` when the Settings window loads — `main.tsx` branches on
`window.location.hash === "#settings"` since both windows share one Vite
bundle. No router; don't add one for two screens.

### The two paths

**1. Hotkey (silent, the hot path)**

```
Ctrl+Shift+V
  → useGlobalShortcut bumps sessionId        (context is ALREADY known — polled)
  → useAutoSmartPaste fires run() once per session
  → jev.selectBestItem()                      (one pooled HTTPS request)
  → confident?  yes → pasteText(): clipboard write + simulate_paste(false)
                no  → reveal() the overlay with the guess highlighted
```

Nothing is ever shown on the confident path. That is the product.

**2. Tray (history picker)**

Tray click emits `smart-paste://show-overlay` → `useOverlay` reveals the window.
This path asks Jev **nothing**; the user picks manually.

Both paths route through the frontend so active-window context is captured
before anything can steal focus. **Do not show the window from Rust** — React
state would go stale and hide-on-blur would break.

## Performance invariants

These exist because Smart Paste was profiled from ~1.6 s down to ~450 ms. Full
write-up with measurements: `.content/making-smart-paste-fast.md`. Read it
before touching the request path.

1. **One pooled HTTP client. Never a client per request.**
   `src-tauri/src/api.rs` holds a `OnceLock<reqwest::Client>` and keeps its
   connection warm with a ping every 60 s. This saves **~680 ms per paste**
   (measured: 1.088 s cold vs 0.402 s warm).
   - Do **not** reintroduce `tauri-plugin-http` — it builds a fresh
     `reqwest::Client` per call, which is exactly the bug we removed.
   - When adding a request, **always drain the response body**
     (`response.text()` / `.bytes()`). Dropping it early discards the socket and
     silently defeats the pool.

2. **No sleep on the silent path.** `simulate_paste(restore_focus: bool)` only
   sleeps when `restore_focus` is true, i.e. when the overlay was actually
   visible and focus must return to the target. Passing `true` unconditionally
   re-adds 150 ms to every paste.

3. **Keep the request small.** One `choice` question, no second inference. The
   clipboard history goes in the question's criteria **only** — never duplicated
   into `state`. Budget is ~570 bytes / ~430 input tokens. Governed by
   `JEV_CANDIDATE_LIMIT` (8) and `JEV_PREVIEW_LENGTH` (120) in `config.ts`.

4. **The foreground window is polled, not read on keypress.**
   `useActiveContext` samples every 300 ms and pauses while the overlay is
   visible (so the app never mistakes its own window for the paste target).
   Moving this back onto the keypress puts an IPC round trip on the hot path.

## Key domain detail: the `none` label

The choice question includes a synthetic `none` option meaning "nothing here
fits". This replaced a separate `noul` relevance question — one extra label
instead of a whole second inference.

- `relevance = 1 - p(none)`
- Auto-paste requires `choice !== "none" && confidence >= 0.6 && relevance >= 0.6`
  (`MIN_CHOICE_CONFIDENCE`, `MIN_RELEVANCE` in `config.ts`).
- When Jev answers `none`, the picker opens with the highest-probability _real_
  entry highlighted, so the user still sees a suggestion.

**Declining to answer is a feature.** Never "fix" it by forcing a pick.

## Secrets and environment

- There is no build-time or shared API key. Each user pastes **their own**
  TypeSafe API key into the Settings window (tray icon → Settings…, or the
  "Open Settings" button the overlay shows when a request fails for lack of
  one). `api.rs`'s `set_api_key` command persists it to
  `<app_config_dir>/config.json`; `load_api_key` reads it back into memory at
  startup. It never touches `.env`, Vite, or the webview bundle.
- **Never hardcode, log, or print the key.** `api_request` attaches it
  server-side (Rust) as the `Authorization` header; the frontend only ever
  sees a placeholder (`PLACEHOLDER_API_KEY` in `jev.ts`).
- `.env`/`.env.example` only document optional, non-secret Vite-time overrides
  (`TYPESAFE_BASE_URL`, `TYPESAFE_DEFAULT_MODEL`) — nothing sensitive belongs
  there.

## Gotchas

**Tauri capabilities are scoped per window label, not global.** Custom
`#[tauri::command]`s (ours) run unrestricted regardless of capabilities — but
**plugin** commands (anything under `core:*`, e.g. `getCurrentWindow().close()`)
are ACL-checked per window. A capability's `"windows"` array must list every
window label that needs it: `default.json` covers `"main"` (the overlay) only,
so the Settings window has its own `settings.json` capability
(`"windows": ["settings"]`) granting just `core:window:allow-close`. Forgetting
this means the new window's close/show/focus calls fail silently. Non-obvious
too: `core:window:default` does **not** include `allow-start-dragging` — it's
listed explicitly on `default.json` so `data-tauri-drag-region` works.
Platform-gated permissions (global-shortcut) live in `desktop.json`.

**CORS.** The TypeSafe API rejects browser origins outright
(`400 Disallowed CORS origin`). The webview can never call it directly. All
requests go through the Rust `api_request` command, which `src/lib/http.ts`
adapts to a `fetch`-compatible function so the SDK stays unmodified.
`api_request` only accepts `https://api.typesafe.ai` — keep that check.

**oxlint `react(refs)`.** Assigning `ref.current` during render is an error.
Do it inside a `useEffect` (the hooks here follow a latest-ref pattern for this
reason).

**TypeScript lib is ES2020.** `ErrorOptions` does not exist — `new Error(msg,
{ cause })` will not compile.

**SDK state typing.** `SmartPasteState` is an object **type alias**, not an
`interface`, so TypeScript gives it an implicit index signature and it stays
assignable to the SDK's `EntryType`. Converting it to an `interface` breaks the
build with TS2322.

**Port 1420 already in use.** A stale Vite `node` process from a stopped task.
Find and kill the owner:
`netstat -ano | grep ":1420.*LISTENING"` → `taskkill //F //PID <pid>`.

**Disk usage.** Rust debug artifacts are multi-gigabyte. `src-tauri/.cargo/config.toml`
(gitignored, machine-specific) redirects `target-dir` to `C:/rust-target/paste-smart`,
and `[profile.dev]` uses `debug = "line-tables-only"`, `incremental = false`,
with `debug = false` for dependencies. This took the cache from 11.4 GB to
2.3 GB. Don't "restore" full debug symbols without a reason.

## Testing the actual use case

There is no automated test suite. Verify behaviour manually — and design tests
that distinguish _real context-sensitivity_ from "just paste the most recent
item":

1. Create two local HTML files with strong `<title>`s, e.g.
   `Sign in to your account — email address required` and
   `Deploy console — paste the git command to run`.
2. Copy several distinct items (an email, a git command, a URL, a note), ending
   with an **irrelevant decoy** so "most recent" is the wrong answer.
3. Focus each page and press `Ctrl+Shift+V`. Identical history must produce
   _opposite, correct_ answers on the two pages.
4. Focus something unrelated (an image editor) and confirm the model returns
   `none` and the picker opens instead of pasting.

Verified working as of the last change (entry chosen at confidence 0.76 /
relevance 0.81; `none` at 1.00 for an unrelated window).

## Conventions

- **No `any`.** Strict TS throughout, including `noUnusedLocals`/`Parameters`.
- Handle loading, error, and empty states explicitly.
- Comments explain **why**, not what. Match the existing density — the codebase
  documents non-obvious decisions and stays quiet elsewhere.
- Keep the app lightweight; prefer simple polling over OS-level listeners.
- Tunables go in `config.ts` (TS) or as named `const`s with doc comments (Rust).
- **Do not commit or push unless explicitly asked.** Nothing in this project has
  been committed by an agent so far; the working tree carries the changes.

## Deliberately not implemented

Considered, measured, and left out — don't add these without asking:

- **Speculative prefetch** (compute the answer on clipboard/window change so the
  hotkey is a cache hit, ~20 ms). Costs billed API calls for pastes that never
  happen.
- **Local regex fast-path** (skip the API for obviously-unambiguous cases).
  Free and instant when it hits, but it's a second decision system to keep
  consistent with the first.
- **Deeper candidate window.** The 8-entry cap is a behaviour trade, not only a
  speed one: older entries can't be auto-selected, though they remain in the
  picker.

## Maintaining this file

Update `AGENTS.md` whenever you:

- add, rename, or remove a Tauri command, hook, service, or layer;
- change a performance invariant, threshold, or tunable in `config.ts`;
- change how secrets, capabilities, or the build are configured;
- hit a non-obvious failure that cost you time (add it to **Gotchas**);
- implement something listed under **Deliberately not implemented** (move it up);
- or find something here that is simply wrong or out of date.

Edit it in the same change as the code, not afterwards. Prefer correcting or
deleting a stale line over appending a new one next to it. If you learn
something that contradicts this file, the code is the truth — fix the file.
