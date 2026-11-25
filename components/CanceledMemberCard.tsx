"use client";

import { useState, useTransition } from "react";
import { endMembershipNow } from "@/app/actions/end-membership";
import { resumeMembership } from "@/app/actions/resume-membership";
import ConfirmDialog from "@/components/ConfirmDialog";

/**
 * Notice banner at the top of every account tab (see CanceledMemberBanner) for a member who has canceled. Two ways
 * out of that state:
 *
 * - Resume: they changed their mind. Only offered while there's a live
 *   subscription to resume into (see resumeMembership).
 * - End everything now: cancel only stops billing, so they keep getting the
 *   monthly opt-in email until their remaining rounds run out. This is the
 *   explicit way to stop now instead. Forfeiting paid-for rounds can't be
 *   undone by the member, so it goes through the same confirm dialog as
 *   canceling.
 */
export default function CanceledMemberCard({
  accessToken,
  roundsLeft,
  hasLiveSubscription,
  openEndDialog = false,
  onEnded,
}: {
  accessToken: string;
  roundsLeft: number;
  hasLiveSubscription: boolean;
  /** Open the "End everything now" dialog on mount (the link in the opt-in email). Ignored with no rounds left. */
  openEndDialog?: boolean;
  onEnded: () => void;
}) {
  const [open, setOpen] = useState(openEndDialog && roundsLeft > 0);
  const [done, setDone] = useState(false);
  const [endFailed, setEndFailed] = useState(false);
  const [resumeFailed, setResumeFailed] = useState(false);
  const [isEnding, startEnding] = useTransition();
  const [isResuming, startResuming] = useTransition();

  const roundWord = roundsLeft === 1 ? "round" : "rounds";

  function confirmEnd() {
    setEndFailed(false);
    startEnding(async () => {
      const result = await endMembershipNow(accessToken);
      if (result.ok) {
        setOpen(false);
        setDone(true);
        onEnded();
      } else {
        setEndFailed(true);
      }
    });
  }

  function resume() {
    setResumeFailed(false);
    startResuming(async () => {
      const result = await resumeMembership(accessToken);
      if (result.ok) {
        // The account context loads the member once, so reload to pick up
        // the new status everywhere on the page.
        window.location.reload();
      } else {
        setResumeFailed(true);
      }
    });
  }

  if (done) {
    return (
      <div className="bg-[#caadff]/30 border border-[#caadff] rounded-2xl px-5 py-4 text-sm leading-relaxed text-dark">
        <strong>Everything has ended.</strong> You won&apos;t get any more monthly opt-in emails. We hope to see you
        again someday.
      </div>
    );
  }

  return (
    <>
      <div className="bg-[#caadff]/30 border border-[#caadff] rounded-2xl px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
        <div className="text-sm leading-relaxed text-dark space-y-1">
          <p>
            <strong>Your membership is canceled.</strong>{" "}
            {roundsLeft > 0 ? (
              <>
                You won&apos;t be charged again. You still have{" "}
                <strong>
                  {roundsLeft} {roundWord}
                </strong>{" "}
                left, and we&apos;ll keep sending the monthly opt-in email until they&apos;re used.
              </>
            ) : (
              "You won't be charged again."
            )}
          </p>
          {hasLiveSubscription && (
            <p>
              Changed your mind? Resume and it will renew as usual
              {roundsLeft > 0 ? " when your rounds run out." : ", on the 10th of the month."}
            </p>
          )}
          {resumeFailed && (
            <p className="text-red-700">
              Something went wrong. Please try again, or contact us at{" "}
              <a href="mailto:post@amsterdamparentproject.nl" className="underline">
                post@amsterdamparentproject.nl
              </a>
              .
            </p>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2 md:items-end md:shrink-0">
          {hasLiveSubscription && (
            <button
              onClick={resume}
              disabled={isResuming}
              className="py-2 px-4 text-sm bg-coral hover:bg-coral-dark text-white font-medium rounded-lg transition disabled:opacity-60"
            >
              {isResuming ? "Resuming…" : "Resume membership"}
            </button>
          )}
          {roundsLeft > 0 && (
            <button
              onClick={() => {
                setEndFailed(false);
                setOpen(true);
              }}
              className="text-xs text-muted hover:text-dark underline underline-offset-2 transition"
            >
              End everything now
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={open}
        title="End everything now?"
        cancelLabel={`Keep my ${roundWord}`}
        confirmLabel="Yes, end everything"
        pendingLabel="Ending…"
        pending={isEnding}
        error={
          endFailed ? (
            <>
              Something went wrong and your membership wasn&apos;t ended. Please try again, or contact us at{" "}
              <a href="mailto:post@amsterdamparentproject.nl" className="underline">
                post@amsterdamparentproject.nl
              </a>
              .
            </>
          ) : undefined
        }
        onConfirm={confirmEnd}
        onClose={() => {
          setOpen(false);
          // Drop ?end=1 so a refresh doesn't reopen the dialog.
          const url = new URL(window.location.href);
          if (url.searchParams.has("end")) {
            url.searchParams.delete("end");
            window.history.replaceState(null, "", url);
          }
        }}
      >
        <p>
          You&apos;ll get no more monthly opt-in emails, and your remaining {roundsLeft} {roundWord} will be
          forfeited. This can&apos;t be undone. A match you already have this month isn&apos;t affected.
        </p>
      </ConfirmDialog>
    </>
  );
}
