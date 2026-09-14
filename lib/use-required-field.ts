"use client";

import { useState } from "react";

/**
 * Inline "required" validation for a single text field — shows an error
 * the moment the field is blurred empty, rather than staying silent until
 * some later submit/autosave attempt fails. `clear()` on change so the
 * error disappears as soon as the field's no longer blank, not just on the
 * next successful save.
 */
export function useRequiredField(label: string) {
  const [error, setError] = useState<string | null>(null);

  return {
    error,
    clear: () => setError(null),
    onBlur: (value: string) => {
      setError(value.trim() ? null : `${label} is required`);
    },
  };
}
