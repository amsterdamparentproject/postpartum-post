"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounced autosave: fires `save(value)` `delay`ms after `value` settles,
 * skipping no-op runs (unchanged since the last successful save) and
 * `skip(value)` runs (e.g. a required field that's temporarily empty
 * mid-edit). Out-of-order-safe — if a second save starts before the first
 * resolves, only the result of the most recently *started* save is applied.
 *
 * `value` is compared by JSON.stringify, so pass a small plain object of
 * just the fields this instance should autosave — not the whole form —
 * particularly to exclude any field (e.g. a login email) that needs an
 * explicit, deliberate save instead of firing on every keystroke.
 */
export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<{ success: boolean; error?: string }>,
  options?: { delay?: number; skip?: (value: T) => boolean },
) {
  const delay = options?.delay ?? 900;
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const savedSnapshotRef = useRef(JSON.stringify(value));
  const generationRef = useRef(0);
  const valueJson = JSON.stringify(value);

  useEffect(() => {
    if (valueJson === savedSnapshotRef.current) return;
    if (options?.skip?.(value)) return;

    const timeoutId = setTimeout(() => {
      const generation = ++generationRef.current;
      setStatus("saving");
      setError(null);
      save(value)
        .then((result) => {
          if (generation !== generationRef.current) return; // superseded by a newer save
          if (!result.success) {
            setStatus("error");
            setError(result.error ?? "Couldn't save — try again");
            return;
          }
          savedSnapshotRef.current = valueJson;
          setStatus("saved");
        })
        .catch(() => {
          if (generation !== generationRef.current) return;
          setStatus("error");
          setError("Couldn't save — try again");
        });
    }, delay);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueJson]);

  return { status, error };
}
