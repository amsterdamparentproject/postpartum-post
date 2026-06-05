"use client";

import { useEffect, useState, useTransition } from "react";
import { getRoundData, type RoundData, testSendOptinEmail, testRunMatcher, testCommitMatches, testSendMatchEmails, testLockRound, testResetRound } from "./actions";
import RoundView from "./RoundView";

type PageState =
  | { status: "loading" }
  | { status: "no_round" }
  | { status: "ready"; round: RoundData };

export default function AdminMatchesPage() {
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    getRoundData().then((round) => {
      setState(round ? { status: "ready", round } : { status: "no_round" });
    });
  }, []);

  return (
    <main className="min-h-screen bg-[#f0f1f5] px-6 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-bold text-dark">Match review</h1>

        {state.status === "loading" && (
          <p className="text-muted text-sm text-center">Loading…</p>
        )}

        {state.status === "no_round" && (
          <div className="bg-white/80 backdrop-blur rounded-2xl border border-border shadow-sm p-8 text-center space-y-2">
            <p className="text-dark font-medium">No match round yet this month.</p>
            <p className="text-muted text-sm">The matcher runs on EOD the 5th.</p>
          </div>
        )}

        {state.status === "ready" && (
          <RoundView initialRound={state.round} />
        )}

        <TestControls />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Test controls
// ---------------------------------------------------------------------------

const TEST_STEPS = [
  { label: "Reset round",        action: testResetRound,       note: "Clears this month's test data — run first" },
  { label: "Send opt-in email",  action: testSendOptinEmail,   note: "Sends to test DB members" },
  { label: "Run matcher",        action: testRunMatcher,       note: "Writes drafts to test DB" },
  { label: "Commit matches",     action: testCommitMatches,    note: "Promotes drafts → matches in test DB" },
  { label: "Send match emails",  action: testSendMatchEmails,  note: "Sends to test DB member emails" },
  { label: "Lock round",         action: testLockRound,        note: "Locks the test round" },
] as const;

function TestControls() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function run(label: string, action: () => Promise<{ success: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      setResults((prev) => ({
        ...prev,
        [label]: result.success ? `✓ ${result.message ?? "ok"}` : `✗ ${result.error}`,
      }));
    });
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-500 hover:text-dark transition"
      >
        <span className="font-medium">Test controls</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-dashed border-gray-300 pt-4">
          <p className="text-xs text-muted">Runs against the test database. Use locally only.</p>
          {TEST_STEPS.map(({ label, action, note }) => (
            <div key={label} className="flex items-center gap-3">
              <button
                onClick={() => run(label, action)}
                disabled={isPending}
                className="shrink-0 text-xs px-3 py-1.5 border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-50"
              >
                {label}
              </button>
              <span className="text-xs text-muted">{note}</span>
              {results[label] && (
                <span className={`text-xs font-mono ml-auto ${results[label].startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                  {results[label].slice(0, 80)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
