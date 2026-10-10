"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import MatchCards from "@/app/matches/[id]/MatchCards";
import { PREVIEW_MEMBERS } from "@/lib/match-preview-fixture";
import type { PublicPerk } from "@/lib/public-perks";

// The overlay body (calendar, map, list, perks) loads only once someone
// taps the teaser — and starts loading on hover/touch/focus, so it's usually
// ready by the time the sheet opens. Keeps it out of the homepage's initial
// JavaScript.
const loadBody = () => import("@/components/MatchPreviewBody");
const MatchPreviewBody = dynamic(loadBody, {
  ssr: false,
  loading: () => (
    <div className="space-y-4" aria-busy="true">
      <div className="h-8 w-40 mx-auto rounded-full bg-border/40 animate-pulse" />
      <div className="h-40 rounded-2xl bg-border/30 animate-pulse" />
      <div className="h-72 rounded-2xl bg-border/30 animate-pulse" />
    </div>
  ),
});

/**
 * "Here's what you'll get" on the homepage: a teaser card that opens a
 * sample match page in an overlay. The overlay is the real match page's
 * own components (match cards, ActivitiesSection with its calendar, map
 * and List view) fed fictional data (lib/match-preview-fixture.ts), so it
 * can't drift from the real page. The map, calendar and tabs are live to
 * play with, but `preview` strips every link into the member area, and
 * nothing here touches a real match. The Perks tab and map pins use the
 * live public perks (same data as /perks).
 *
 * It's a native <dialog> (focus trap + Esc for free): a centered card on
 * desktop, a full-screen sheet on phones, with a sticky header (close) and
 * a sticky "Get my match" button that closes it and jumps to the signup
 * form. Opening pushes a history entry so the phone's back button closes
 * the sheet instead of leaving the site.
 */
export default function MatchPreview({ perks }: { perks: PublicPerk[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  function openSample() {
    const dlg = dialogRef.current;
    if (!dlg || dlg.open) return;
    history.pushState({ sampleMatch: true }, "");
    setOpen(true);
    dlg.showModal();
  }

  // Back button (or our own history.back()) closes the sheet.
  useEffect(() => {
    const onPop = () => {
      const dlg = dialogRef.current;
      if (dlg?.open) dlg.close();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Keep the page behind from scrolling while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Fires for every way of closing (✕, Esc, CTA, back): unwind the history
  // entry we pushed, unless the back button already did.
  function handleClosed() {
    setOpen(false);
    if (history.state?.sampleMatch) history.back();
  }

  function requestClose() {
    dialogRef.current?.close();
  }

  function joinNow() {
    requestClose();
    setTimeout(() => document.getElementById("subscribe")?.scrollIntoView({ behavior: "smooth" }), 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={openSample}
        onPointerEnter={loadBody}
        onFocus={loadBody}
        onTouchStart={loadBody}
        data-umami-event="Home: Open sample match"
        className="group block w-full text-center bg-white/80 rounded-2xl border border-border shadow-sm p-5 hover:border-coral/40 hover:shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-coral/40"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none select-none max-h-28 overflow-hidden text-left [mask-image:linear-gradient(to_bottom,black_40%,transparent)]"
        >
          <MatchCards members={PREVIEW_MEMBERS} preview />
        </div>
        <span className="inline-block mt-3 bg-coral text-white text-sm font-semibold rounded-full px-5 py-2 group-hover:opacity-90 transition-opacity">
          See a sample match page
        </span>
      </button>

      <dialog
        ref={dialogRef}
        onClose={handleClosed}
        aria-label="Sample match page"
        className="m-0 p-0 w-full max-w-none h-[100dvh] max-h-none bg-white open:flex flex-col sm:m-auto sm:max-w-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-2xl sm:shadow-xl backdrop:bg-dark/50"
      >
        {open && (
          <>
            <div className="shrink-0 flex items-center justify-between gap-3 pr-5 bg-coral text-white sm:rounded-t-2xl">
              <button
                type="button"
                onClick={requestClose}
                data-umami-event="Home: Sample match close"
                className="flex-1 flex items-center gap-2 px-5 py-4 text-left text-sm font-semibold hover:bg-white/10 transition-colors sm:rounded-tl-2xl"
              >
                <span aria-hidden="true">←</span>
                Return to the homepage
              </button>
              <button
                type="button"
                onClick={requestClose}
                data-umami-event="Home: Sample match close"
                aria-label="Close"
                className="shrink-0 w-9 h-9 rounded-full border border-white/60 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6">
              <MatchPreviewBody perks={perks} />
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-border bg-white">
              <button
                type="button"
                onClick={joinNow}
                data-umami-event="Home: Sample match CTA"
                className="w-full bg-coral text-white font-semibold rounded-lg py-3 hover:opacity-90 transition-opacity"
              >
                Get my match
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
