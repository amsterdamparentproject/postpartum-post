"use client";

import type { AutosaveStatus as Status } from "@/lib/use-autosave";

/** Small status text for a useAutosave-backed form — pairs with a section heading. */
export default function AutosaveStatus({ status, error }: { status: Status; error: string | null }) {
  if (status === "saving") return <span className="text-xs text-muted">Saving…</span>;
  if (status === "saved") return <span className="text-xs text-muted">Saved</span>;
  if (status === "error") return <span className="text-xs text-coral">{error ?? "Couldn't save — try again"}</span>;
  return null;
}
