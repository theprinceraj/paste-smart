import { useCallback, useEffect, useRef, useState } from "react";

import { MISSING_KEY_MESSAGE } from "../config";
import { hasApiKey } from "../lib/commands";
import { selectBestItem } from "../services/jev";
import { pasteText } from "../services/smartPaste";
import type { ActiveContext, ClipboardItem, SmartPasteStatus, Suggestion } from "../types";

interface UseSmartPasteOptions {
  /** Clipboard entries, most recent first. */
  history: ClipboardItem[];
  /** Window the overlay was summoned from, or `null` when unknown. */
  context: ActiveContext | null;
  /** Whether the overlay is on screen, which decides if focus must be restored. */
  isVisible: boolean;
  /** Hides the overlay; awaited before the keystroke is synthesized. */
  hide: () => Promise<void>;
  /**
   * Shows the overlay. Called only when the user has to decide — a confident
   * run never displays anything.
   */
  reveal: () => Promise<void>;
}

interface UseSmartPaste {
  status: SmartPasteStatus;
  /** Human-readable failure, or `null`. */
  error: string | null;
  /** Jev's pick, kept even when it was not confident enough to auto-paste. */
  suggestion: Suggestion | null;
  /** Ask Jev to pick an entry, pasting it when confidence is high enough. */
  run: () => Promise<void>;
  /** Paste a specific entry the user picked. */
  paste: (item: ClipboardItem) => Promise<void>;
  /** Abort any in-flight request and clear the transient state. */
  reset: () => void;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : "Something went wrong.";

/** Drives the Smart Paste flow: ask Jev, then write and paste the result. */
export function useSmartPaste({
  history,
  context,
  isVisible,
  hide,
  reveal,
}: UseSmartPasteOptions): UseSmartPaste {
  const [status, setStatus] = useState<SmartPasteStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setStatus("idle");
    setError(null);
    setSuggestion(null);
  }, []);

  // Drop the in-flight request if the overlay unmounts.
  useEffect(() => () => requestRef.current?.abort(), []);

  const paste = useCallback(
    async (item: ClipboardItem): Promise<void> => {
      setStatus("pasting");
      setError(null);
      try {
        await pasteText(item.text, hide, isVisible);
        setStatus("done");
      } catch (caught) {
        setStatus("error");
        setError(describeError(caught));
        await reveal();
      }
    },
    [hide, isVisible, reveal],
  );

  const run = useCallback(async (): Promise<void> => {
    if (history.length === 0) {
      setStatus("error");
      setError("Clipboard history is empty.");
      await reveal();
      return;
    }
    if (!context) {
      setStatus("error");
      setError("Could not determine the active window.");
      await reveal();
      return;
    }
    // Checked up front rather than left to the request: a missing key surfaces
    // as a generic "Connection error" once it round-trips through the SDK's
    // fetch error wrapping, losing the exact message StatusBar matches on.
    if (!(await hasApiKey())) {
      setStatus("error");
      setError(MISSING_KEY_MESSAGE);
      await reveal();
      return;
    }

    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;

    setStatus("thinking");
    setError(null);
    setSuggestion(null);

    try {
      const picked = await selectBestItem(history, context, request.signal);
      if (request.signal.aborted) return;

      setSuggestion(picked);
      if (picked.isConfident) {
        // Confident: paste straight into the target, showing nothing at all.
        await paste(picked.item);
      } else {
        // Ambiguous: fall back to the picker, with Jev's guess highlighted.
        setStatus("idle");
        await reveal();
      }
    } catch (caught) {
      if (request.signal.aborted) return;
      setStatus("error");
      setError(describeError(caught));
      await reveal();
    }
  }, [context, history, paste, reveal]);

  return { status, error, suggestion, run, paste, reset };
}
