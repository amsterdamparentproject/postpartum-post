"use client";

import { useEffect, useState, useTransition } from "react";
import { getRoundData, type RoundData, testSimulateOptins, testRunMatcher, testCommitMatches, testSimulateMatchEmails, testLockRound, testResetRound, testSendEmail, testCohortMatchPage, testCohortEmail, type CohortEmailKind, type TestEmailKind } from "./actions";
import { DEV_DISTANCES, DEV_SCENARIOS, type DevDistance, type DevScenario } from "@/lib/dev-tools";
import RoundView from "./RoundView";
import AdminNav from "../AdminNav";

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
        <AdminNav active="matches" />

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
        <CohortMatchPageControls />
        <CohortEmailControls />
        <EmailTestControls />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Test controls
// ---------------------------------------------------------------------------

const TEST_STEPS = [
  { label: "Reset round",        action: testResetRound,       note: "Clears this month's test data — run first" },
  { label: "Simulate opt-ins",   action: testSimulateOptins,   note: "No emails — you're always coffee, everyone else random" },
  { label: "Run matcher",        action: testRunMatcher,       note: "Writes drafts — you always get a match" },
  { label: "Commit matches",     action: testCommitMatches,    note: "Promotes drafts → matches in test DB" },
  { label: "Simulate match emails", action: testSimulateMatchEmails, note: "No emails — gives you your match page link" },
  { label: "Lock round",         action: testLockRound,        note: "Locks the test round" },
] as const;

function TestControls() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Record<string, { text: string; link?: string }>>({});
  const [isPending, startTransition] = useTransition();

  function run(label: string, action: () => Promise<{ success: boolean; message?: string; error?: string; link?: string }>) {
    startTransition(async () => {
      const result = await action();
      setResults((prev) => ({
        ...prev,
        [label]: {
          text: result.success ? `✓ ${result.message ?? "ok"}` : `✗ ${result.error}`,
          link: result.success ? result.link : undefined,
        },
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
                <span className={`text-xs font-mono ml-auto ${results[label].text.startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
                  {results[label].text.slice(0, 80)}
                  {results[label].link && (
                    <>
                      {" "}
                      <a
                        href={results[label].link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-sans font-semibold text-coral hover:underline"
                      >
                        Open match page →
                      </a>
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cohort match page — builds a test match for the test member in any member
// type (cohort / comped / subscriber) and distance. Same generator as the
// panel on the match page itself.
// ---------------------------------------------------------------------------

function CohortMatchPageControls() {
  const [scenario, setScenario] = useState<DevScenario>("cohort_comped");
  const [distance, setDistance] = useState<DevDistance>("local");
  const [result, setResult] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const r = await testCohortMatchPage(scenario, distance);
      setResult(
        r.success
          ? { ok: true, text: `✓ ${r.message}`, link: r.link }
          : { ok: false, text: `✗ ${r.error}` },
      );
    });
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-2xl px-5 py-4 space-y-3">
      <p className="text-sm font-medium text-gray-500">Cohort match page</p>
      <p className="text-xs text-muted">
        Rebuilds a test match for your test member. Changes its cohort and plan; &ldquo;No cohort, subscriber&rdquo; resets it. Local only.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={scenario}
          onChange={(e) => setScenario(e.target.value as DevScenario)}
          className="text-xs border border-border rounded-lg px-2 py-1.5 text-dark bg-white"
        >
          {Object.entries(DEV_SCENARIOS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={distance}
          onChange={(e) => setDistance(e.target.value as DevDistance)}
          className="text-xs border border-border rounded-lg px-2 py-1.5 text-dark bg-white"
        >
          {Object.entries(DEV_DISTANCES).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button
          onClick={generate}
          disabled={isPending}
          className="text-xs px-3 py-1.5 border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-50"
        >
          {isPending ? "Generating…" : "Generate"}
        </button>
        {result && (
          <span className={`text-xs font-mono ${result.ok ? "text-green-600" : "text-red-600"}`}>
            {result.text.slice(0, 100)}
            {result.link && (
              <>
                {" "}
                <a href={result.link} target="_blank" rel="noopener noreferrer" className="font-sans font-semibold text-coral hover:underline">
                  Open match page →
                </a>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cohort emails — every cohort email, sent to the test member with sample data
// and the real cohort wiring. No committed round or Stripe offer needed.
// ---------------------------------------------------------------------------

const COHORT_EMAILS: { kind: CohortEmailKind; label: string; note: string }[] = [
  { kind: "welcome", label: "Welcome", note: "New cohort signup (free match, nothing renews)" },
  { kind: "existing-member", label: "Existing member", note: "Paying member who redeemed the cohort code" },
  { kind: "optin", label: "Opt-in", note: "Monthly invitation, comped variant" },
  { kind: "match-reveal", label: "Match reveal", note: "Generic cohort version: banner, cohort name, no “in Amsterdam”" },
  { kind: "continue", label: "Continue offer", note: "After the free match: €4 off, 1 or 3 rounds (sample prices)" },
];

function CohortEmailControls() {
  const [results, setResults] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function send(kinds: CohortEmailKind[]) {
    startTransition(async () => {
      for (const kind of kinds) {
        const r = await testCohortEmail(kind);
        setResults((prev) => ({ ...prev, [kind]: r.success ? "✓ Sent" : `✗ ${r.error}` }));
      }
    });
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-2xl px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">Cohort emails (Dutch Speaking Academy)</p>
        <button
          onClick={() => send(COHORT_EMAILS.map((e) => e.kind))}
          disabled={isPending}
          className="text-xs px-3 py-1.5 border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send all"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Sends only to the test member, with sample data. Links are plain, so don&apos;t click through.
      </p>
      {COHORT_EMAILS.map(({ kind, label, note }) => (
        <div key={kind} className="flex items-center gap-3">
          <button
            onClick={() => send([kind])}
            disabled={isPending}
            className="shrink-0 w-36 text-xs px-3 py-1.5 border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-50"
          >
            {label}
          </button>
          <span className="text-xs text-muted">{note}</span>
          {results[kind] && (
            <span className={`text-xs font-mono ml-auto ${results[kind].startsWith("✓") ? "text-green-600" : "text-red-600"}`}>
              {results[kind].slice(0, 80)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email test controls — separate from the round controls above because these
// work against whatever database this admin is pointed at, production included.
// ---------------------------------------------------------------------------

const EMAIL_TESTS: { kind: TestEmailKind; label: string; note: string }[] = [
  { kind: "optin", label: "Opt-in", note: "Monthly \u201cLet\u2019s meet this month\u201d, real signed buttons" },
  { kind: "match-reveal", label: "Match reveal", note: "Your match this month; needs a committed match" },
  { kind: "meetup-reminder", label: "Meetup reminder", note: "\u201cDid you meet?\u201d links; needs a match this month" },
  { kind: "welcome", label: "Welcome", note: "Signs you in to /profile" },
  { kind: "cancellation-confirmed", label: "Cancellation confirmed", note: "Shows 2 matches left" },
  { kind: "unsubscribed", label: "Unsubscribed", note: "Feedback link signs you in" },
  { kind: "rematch-confirmation", label: "Report confirmation", note: "Problem report received" },
  { kind: "gift-card", label: "Gift card", note: "Placeholder code TESTCODE, so redeeming won\u2019t work" },
  { kind: "partner-welcome", label: "Partner welcome", note: "Magic link into /partners/profile" },
  { kind: "perk-live", label: "Perk live", note: "Sample perk, links to /perks" },
];

function EmailTestControls() {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [pendingKind, setPendingKind] = useState<TestEmailKind | null>(null);
  const [isPending, startTransition] = useTransition();

  function send(kind: TestEmailKind) {
    setPendingKind(kind);
    setResults((prev) => {
      const next = { ...prev };
      delete next[kind];
      return next;
    });
    startTransition(async () => {
      const res = await testSendEmail(kind);
      setResults((prev) => ({ ...prev, [kind]: res.success ? { ok: true, text: res.message } : { ok: false, text: res.error } }));
      setPendingKind(null);
    });
  }

  return (
    <div className="border border-dashed border-gray-300 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm text-gray-500 hover:text-dark transition"
      >
        <span className="font-medium">Test controls: emails</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-dashed border-gray-300 pt-4">
          <p className="text-xs text-muted">
            Sends only to the test member, with real links, and works in production. Clicking a link in the email acts
            on that member&apos;s real record (opt-ins, consent, sign-in).
          </p>
          {EMAIL_TESTS.map(({ kind, label, note }) => (
            <div key={kind} className="flex items-center gap-3">
              <button
                onClick={() => send(kind)}
                disabled={isPending}
                className="shrink-0 w-44 text-left text-xs px-3 py-1.5 border border-border rounded-lg text-dark hover:border-coral hover:text-coral transition disabled:opacity-50"
              >
                {pendingKind === kind ? "Sending…" : label}
              </button>
              <span className="text-xs text-muted">{note}</span>
              {results[kind] && (
                <span className={`text-xs font-mono ml-auto ${results[kind].ok ? "text-green-600" : "text-red-600"}`}>
                  {results[kind].ok ? "✓" : "✗"} {results[kind].text.slice(0, 90)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
