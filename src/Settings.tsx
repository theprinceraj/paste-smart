import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

import { useEscapeKey } from "./hooks/useEscapeKey";
import { hasApiKey, setApiKey } from "./lib/commands";

type SaveState = "idle" | "saving" | "error";
type AutostartState = "loading" | "idle" | "saving" | "error";

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : "Failed to save the key.";

const describeAutostartError = (error: unknown): string =>
  error instanceof Error ? error.message : "Failed to update the startup setting.";

/** Settings window: API key plus optional launch-on-startup behavior. */
function Settings() {
  const [keyInput, setKeyInput] = useState("");
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [startOnStartup, setStartOnStartup] = useState(false);
  const [autostartState, setAutostartState] = useState<AutostartState>("loading");
  const [autostartError, setAutostartError] = useState<string | null>(null);

  const refreshAutostart = useCallback(async () => {
    try {
      const enabled = await isEnabled();
      setStartOnStartup(enabled);
      setAutostartState("idle");
      setAutostartError(null);
    } catch (caught) {
      setAutostartState("error");
      setAutostartError(describeAutostartError(caught));
    }
  }, []);

  useEffect(() => {
    void hasApiKey().then(setAlreadyConfigured);
    void isEnabled()
      .then((enabled) => {
        setStartOnStartup(enabled);
        setAutostartState("idle");
        setAutostartError(null);
      })
      .catch((caught) => {
        setAutostartState("error");
        setAutostartError(describeAutostartError(caught));
      });
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
      setAutostartState("loading");
      void hasApiKey().then(setAlreadyConfigured);
      void refreshAutostart();
    });
    return () => void unlisten.then((stop) => stop());
  }, [refreshAutostart]);

  // Hidden rather than closed, so the next open reuses the already-loaded
  // window instead of paying WebView2's startup cost again.
  const close = useCallback(() => void getCurrentWindow().hide(), []);
  useEscapeKey(true, close);

  const handleAutostartChange = useCallback(
    async (checked: boolean) => {
      const previous = startOnStartup;
      setStartOnStartup(checked);
      setAutostartState("saving");
      setAutostartError(null);

      try {
        if (checked) {
          await enable();
        } else {
          await disable();
        }

        // Read back the OS registration rather than trusting optimistic UI.
        setStartOnStartup(await isEnabled());
        setAutostartState("idle");
      } catch (caught) {
        setStartOnStartup(previous);
        setAutostartState("error");
        setAutostartError(describeAutostartError(caught));
      }
    },
    [startOnStartup],
  );

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

  const autostartBusy = autostartState === "loading" || autostartState === "saving";

  return (
    <div className="overlay">
      <header className="overlay__header">
        <div className="overlay__target" data-tauri-drag-region>
          <span className="overlay__app">Settings</span>
          <span className="overlay__title">Smart Paste preferences</span>
        </div>
        <button className="overlay__close" type="button" onClick={close} aria-label="Close">
          ✕
        </button>
      </header>
      <main className="overlay__body settings">
        <section className="settings__section">
          <label className="settings__toggle">
            <input
              type="checkbox"
              checked={startOnStartup}
              disabled={autostartBusy}
              onChange={(event) => void handleAutostartChange(event.target.checked)}
            />
            <span>Start Smart Paste when Windows starts</span>
          </label>
          <p className="settings__hint">
            Starts quietly in the system tray, just like a normal launch.
          </p>
          {autostartState === "loading" && <p className="status">Checking startup setting…</p>}
          {autostartError && (
            <p className="status status--error" role="alert">
              {autostartError}
            </p>
          )}
        </section>

        <section className="settings__section settings__section--key">
          <p className="settings__hint">
            {alreadyConfigured
              ? "A TypeSafe API key is already saved. Paste a new one to replace it."
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
        </section>
      </main>
    </div>
  );
}

export default Settings;
