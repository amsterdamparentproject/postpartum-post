"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * The confirm step for account actions that are hard to take back (canceling,
 * leaving, ending a membership). A bottom sheet on phones, a centered card from
 * `sm` up. The safe choice gets focus first, Escape and a backdrop tap close it
 * (not while the action is running), page scroll is locked while it's open, and
 * focus returns to whatever opened it.
 *
 * Rendered into document.body through a portal: the cards on /billing use
 * backdrop-blur, which makes them the containing block for fixed-position
 * children, so an inline dialog would be clipped to the card.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  cancelLabel,
  confirmLabel,
  pendingLabel,
  pending = false,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  /** The safe choice, e.g. "Keep my rounds". */
  cancelLabel: string;
  confirmLabel: string;
  /** Confirm button text while the action is running. */
  pendingLabel: string;
  pending?: boolean;
  /** Shown above the buttons when the action failed. */
  error?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const safeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    safeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, [open, pending, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-dark/40 sm:px-4"
      onClick={() => {
        if (!pending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="text-xl text-dark" style={{ fontFamily: "var(--font-serif)" }}>
          {title}
        </h3>
        <div className="text-sm text-dark/80 leading-relaxed space-y-2">{children}</div>
        {error && (
          <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed">
            {error}
          </div>
        )}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={safeRef}
            onClick={onClose}
            disabled={pending}
            className="min-h-11 px-4 py-2.5 text-sm border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="min-h-11 px-4 py-2.5 text-sm bg-dark text-white rounded-lg hover:bg-dark/80 transition disabled:opacity-60"
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
