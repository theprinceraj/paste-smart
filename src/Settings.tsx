import { getCurrentWindow } from "@tauri-apps/api/window";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

import { useEscapeKey } from "./hooks/useEscapeKey";
import { hasApiKey, setApiKey } from "./lib/commands";

type SaveState = "idle" | "saving" | "error";

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : "Failed to save the key.";

/** Settings window: lets the user paste in their own TypeSafe API key. */
function Settings() {
  const [keyInput, setKeyInput] = useState("");
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hasApiKey().then(setAlreadyConfigured);
  }, []);

  // The window is preloaded once and reused (hidden, not destroyed) rather
  // than rebuilt on every open — see `settings_window.rs::preload` — so its
  // own state has to be refreshed on each reopen instead of via remount.
  useEffect(() => {
    const window = getCurrentWindow();
    const unlisten = window.onFocusChanged(({ payload: focused }) => {
      if (!focused) return;
      setKeyInput("");
      setSaveState("idle");
      setError(null);
      void hasApiKey().then(setAlreadyConfigured);
    });
    return () => void unlisten.then((stop) => stop());
  }, []);

  // Hidden rather than closed, so the next open reuses the already-loaded
  // window instead of paying WebView2's startup cost again.
  const close = useCallback(() => void getCurrentWindow().hide(), []);
  useEscapeKey(true, close);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSaveState("saving");
      setError(null);
      try {
        await setApiKey(keyInput);
        close();
      } catch (caught) {
        setSaveState("error");
        setError(describeError(caught));
      }
    },
    [keyInput, close],
  );

  return (
    <div className="overlay">
      <header className="overlay__header">
        <div className="overlay__target" data-tauri-drag-region>
          <span className="overlay__app">Settings</span>
          <span className="overlay__title">TypeSafe API key</span>
        </div>
        <button className="overlay__close" type="button" onClick={close} aria-label="Close">
          ✕
        </button>
      </header>
      <main className="overlay__body settings">
        <p className="settings__hint">
          {alreadyConfigured
            ? "A key is already saved. Paste a new one to replace it."
            : "Paste your TypeSafe API key to enable Smart Paste."}
        </p>
        <form className="settings__form" onSubmit={(event) => void handleSubmit(event)}>
          <input
            className="settings__input"
            type="password"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder="apikey_…"
            autoFocus
          />
          {error && (
            <p className="status status--error" role="alert">
              {error}
            </p>
          )}
          <div className="settings__actions">
            <button type="button" className="settings__cancel" onClick={close}>
              Cancel
            </button>
            <button
              type="submit"
              className="settings__save"
              disabled={saveState === "saving" || keyInput.trim().length === 0}
            >
              {saveState === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default Settings;
