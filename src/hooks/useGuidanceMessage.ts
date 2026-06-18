import { useCallback, useState } from 'react';

/**
 * Manages the transient guidance hint shown when an answer is unscored and the
 * user should try again (wrong reading type, invalid characters, okurigana
 * mismatch, reading typed for a meaning prompt).
 *
 * Review and lesson sessions share the same lifecycle: show the hint on a
 * "retry" outcome, and clear it when the user edits their answer or advances to
 * the next prompt. Keeping it in one hook avoids duplicating that wiring across
 * both screens.
 */
export function useGuidanceMessage() {
  const [guidanceMessage, setGuidanceMessage] = useState<string | null>(null);

  const showGuidance = useCallback((message: string) => {
    setGuidanceMessage(message);
  }, []);

  const clearGuidance = useCallback(() => {
    setGuidanceMessage((current) => (current === null ? current : null));
  }, []);

  return { guidanceMessage, showGuidance, clearGuidance };
}
