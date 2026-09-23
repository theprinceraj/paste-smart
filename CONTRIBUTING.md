# Contributing to Smart Paste

Thanks for helping out! Bug reports, ideas, and pull requests are all welcome.

## Reporting a bug

Open an issue and include:

- What you did, what you expected, and what happened instead.
- Your Windows version and the Smart Paste version.
- Which app or window you were pasting into, if it matters.

Please don't paste your API key or private clipboard content into issues.

## Getting started

You need [Bun](https://bun.sh), [Rust](https://rustup.rs), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```sh
bun install
bun run tauri dev
```

Add your TypeSafe API key through the tray icon → **Settings…** to try smart
pasting.

## Before you open a pull request

Run these and make sure they all pass:

```sh
bunx tsc --noEmit
bun run lint
bun run format:check
cd src-tauri && cargo clippy
```

A pre-commit hook runs most of these for you. CI runs them again on every pull
request.

## Guidelines

- **Keep it fast.** Smart Paste competes with plain `Ctrl+V`. Avoid adding work
  to the hotkey path, and mention any speed impact in your pull request.
- **Keep the layers separate.** UI goes in `src/components`, state and side
  effects in `src/hooks`, and logic in `src/services`.
- **Put settings in `src/config.ts`** instead of scattering numbers in the code.
- **No `any`** in TypeScript.
- **Never log or hardcode API keys.**
- Use **bun** only. Don't add npm, yarn, or pnpm lock files.
- Keep pull requests small and focused on one change.

For a deeper look at how the app works, read [AGENTS.md](AGENTS.md).

## Testing your change

There are no automated tests yet, so please test by hand. A good check:

1. Copy a few different items (an email, a command, a link).
2. Open two windows where different items clearly fit, and press
   `Ctrl+Shift+V` in each. Each should get the right item.
3. Try an unrelated window. The picker should open instead of pasting.

Describe what you tested in your pull request.
