import { useCallback, useEffect } from "react";

import { HistoryList } from "./components/HistoryList";
import { Overlay } from "./components/Overlay";
import { SmartPasteButton } from "./components/SmartPasteButton";
import { StatusBar } from "./components/StatusBar";
import { useAutoSmartPaste } from "./hooks/useAutoSmartPaste";
import { useClipboardHistory } from "./hooks/useClipboardHistory";
import { useEscapeKey } from "./hooks/useEscapeKey";
import { useOverlay } from "./hooks/useOverlay";
import { useSmartPaste } from "./hooks/useSmartPaste";
import { useTrayStatus } from "./hooks/useTrayStatus";
import { openSettingsWindow } from "./lib/commands";
import { onApiKeyUpdated } from "./lib/events";
import "./App.css";

function App() {
  const { history } = useClipboardHistory();
  const { isVisible, sessionId, context, reveal, close } = useOverlay();
  const { status, error, suggestion, run, paste, reset } = useSmartPaste({
    history,
    context,
    isVisible,
    hide: close,
    reveal,
  });

  // Abort any in-flight request when the overlay is dismissed. Resetting on
  // reveal would wipe the very suggestion the user was asked to confirm; each
  // session already clears its own state when it starts.
  useEffect(() => {
    if (!isVisible) reset();
  }, [isVisible, reset]);

  // The hotkey runs Smart Paste without showing anything; the overlay only
  // appears if Jev is unsure or the request fails.
  useAutoSmartPaste(sessionId, run);

  useEscapeKey(isVisible, () => void close());
  useTrayStatus(history.length);

  // Clear a stale "no key configured" error the moment Settings saves one,
  // so the user doesn't have to dismiss and reopen the overlay to retry.
  useEffect(() => {
    const unlisten = onApiKeyUpdated(reset);
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [reset]);

  const isBusy = status === "thinking" || status === "pasting";

  const handleClose = useCallback(() => void close(), [close]);

  return (
    <Overlay context={context} onClose={handleClose}>
      <SmartPasteButton
        disabled={isBusy || history.length === 0}
        isBusy={isBusy}
        onClick={() => void run()}
      />
      <StatusBar
        status={status}
        error={error}
        suggestion={suggestion}
        itemCount={history.length}
        onOpenSettings={() => void openSettingsWindow()}
      />
      <HistoryList
        items={history}
        suggestedId={suggestion?.item.id ?? null}
        onSelect={(item) => void paste(item)}
      />
    </Overlay>
  );
}

export default App;
