# Smart Paste

Smart Paste is a small Windows app that picks the right thing to paste for you.

It remembers the text you copy. When you press `Ctrl+Shift+V`, it looks at the
window you're in (its title and app name), asks an AI model which copied item
fits best, and pastes it. If it's confident, you see nothing — the text just
appears. If it isn't sure, a small picker opens so you can choose.

## Example

You copied your email address, a git command, and a random link — in that
order.

- In a **sign-in page**, `Ctrl+Shift+V` pastes your email.
- In a **terminal**, it pastes the git command.
- In an **image editor**, nothing fits, so the picker opens instead of guessing.

Plain `Ctrl+V` would have pasted the link every time.

## Features

- Keeps your last 25 copied text items (in memory only).
- One hotkey: `Ctrl+Shift+V`.
- No window at all when the answer is clear.
- A history picker when the answer isn't clear, or when you want to choose.
- Runs quietly in the system tray.
- Fast: a smart paste usually takes around half a second.

## Install

Download the latest Windows installer from the
[Releases](https://github.com/theprinceraj/paste-smart/releases) page and run
it.

## Setup

Smart Paste uses [TypeSafe](https://typesafe.ai) to make its choice, so you need
your own TypeSafe API key.

1. Start Smart Paste. It lives in the system tray.
2. Click the tray icon and choose **Settings…**
3. Paste your API key and save.

Your key is stored on your computer only. Without a key, the app still works as
a simple clipboard history picker.

## How to use

| Action                  | What happens                                         |
| ----------------------- | ---------------------------------------------------- |
| `Ctrl+Shift+V`          | Pastes the best match, or opens the picker if unsure |
| Click the tray icon     | Opens the history picker                             |
| Click an item in picker | Pastes that item                                     |
| `Esc` or click away     | Closes the picker                                    |
| Tray menu → **Quit**    | Exits the app                                        |

## Privacy

- Clipboard history is kept in memory and is gone when you quit.
- When you press `Ctrl+Shift+V`, the window title, app name, and short previews
  (up to 120 characters) of your 8 most recent copied items are sent to the
  TypeSafe API to make the choice.
- Nothing is sent when you open the picker from the tray.

## Build from source

You need [Bun](https://bun.sh), [Rust](https://rustup.rs), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```sh
git clone https://github.com/theprinceraj/paste-smart.git
cd paste-smart
bun install
bun run tauri dev     # run in development mode
bun run tauri build   # build an installer
```

## Built with

- [Tauri 2](https://tauri.app) and Rust
- React and TypeScript
- [TypeSafe](https://typesafe.ai) (`jev-latest` model)

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
