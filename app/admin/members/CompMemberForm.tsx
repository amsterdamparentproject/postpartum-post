"use client";

import { useRef, useState, useTransition } from "react";
import { compMemberAction, lookupCompTargetAction } from "./actions";
import { COMP_REASONS, MAX_COMP_ROUNDS, type CompLookup, type CompReason } from "@/lib/comp-member";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-white text-dark placeholder-muted focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition text-sm";
const labelClass = "block text-xs font-medium text-dark mb-1";

const roundsText = (n: number) => (n === 1 ? "1 free round" : `${n} free rounds`);

export default function CompMemberForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [includePerks, setIncludePerks] = useState(true);
  const [rounds, setRounds] = useState(1);
  const [sendEmail, setSendEmail] = useState(true);
  const [reason, setReason] = useState<CompReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const latestEmail = useRef("");
  const [lookup, setLookup] = useState<CompLookup | null>(null);
  const [isPending, startTransition] = useTransition();

  async function checkEmail() {
    const checked = email;
    if (!checked.trim()) return;
    const result = await lookupCompTargetAction(checked);
    // Ignore a slow answer for an email that has since been edited.
    if (latestEmail.current !== checked) return;
    if ("error" in result) {
      setLookup(null);
      setError(result.error);
    } else {
      setLookup(result);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await compMemberAction({ email, name, includePerks, reason: reason as CompReason, rounds, note, sendEmail });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if ("existing" in result) {
        setNotice(
          `${result.email} is already a member, so I added ${roundsText(result.rounds)} to their account (now ${result.matchesRemaining}). Their plan didn't change. ${
            result.emailSent === null
              ? "No email was sent."
              : result.emailSent
                ? "I emailed them to say so."
                : "The email failed to send, so tell them yourself (check the logs)."
          }`
        );
        latestEmail.current = "";
        setEmail("");
        setName("");
        setNote("");
        setRounds(1);
        setReason("");
        setSendEmail(true);
        setLookup(null);
        return;
      }
      setNotice(
        result.emailSent
          ? `Done. ${result.email} has ${roundsText(result.rounds)}${result.includePerks ? " with Post Perks" : " (match only, no Post Perks)"}, and the welcome email is on its way.`
          : `${result.email} has ${roundsText(result.rounds)}, but the welcome email failed to send. Check the logs and send them a sign-in link yourself.`
      );
      latestEmail.current = "";
      setEmail("");
      setName("");
      setNote("");
      setRounds(1);
      setReason("");
      setLookup(null);
    });
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-border p-5 space-y-4">
      <p className="text-sm text-muted">
        Gives a new person free rounds. No card, no Stripe, nothing renews. If the email already
        belongs to an active member, they just get the rounds added and their plan and Perks access stay as they are.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Email</label>
          <input type="email" value={email} onChange={(e) => {
              latestEmail.current = e.target.value;
              setEmail(e.target.value);
              setLookup(null);
              setError(null);
            }}
            onBlur={checkEmail}
            required
            className={inputClass}
          />
        </div>
        <div className={lookup?.kind === "existing" ? "hidden" : ""}>
          <label className={labelClass}>Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
      </div>
      {lookup?.kind === "new" && (
        <p className="text-sm font-medium text-dark bg-green/30 border border-green rounded-lg px-3 py-2">This email is not associated with a member. A new member will be created with {roundsText(rounds)}.</p>
      )}
      {lookup?.kind === "existing" && (
        <p className="text-sm font-medium text-dark bg-green/30 border border-green rounded-lg px-3 py-2">This email is already associated with a member. {rounds === 1 ? "A free round" : `${rounds} free rounds`} will be added to their total.</p>
      )}
      {lookup?.kind === "existing" && (
        <label className="flex items-center gap-2 text-sm text-dark">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="accent-coral" />
          Email them to say rounds were added
        </label>
      )}
      {lookup?.kind === "blocked" && (
        <p className="text-sm text-coral">
          This email belongs to a member whose status is &ldquo;{lookup.status}&rdquo;, so a round can&apos;t be added automatically.
        </p>
      )}
      {lookup?.kind === "invalid" && <p className="text-sm text-coral">That doesn&apos;t look like a valid email address.</p>}
      <div className={lookup?.kind === "existing" && !sendEmail ? "hidden" : ""}>
        <label className={labelClass}>Note in the email (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Congrats, Holly — you won our Post Perks giveaway!"
          className={inputClass}
        />
        <p className="text-xs text-muted mt-1">
          {lookup?.kind === "existing"
            ? <>Replaces the opening &ldquo;Good news!&rdquo;. The email then continues &ldquo;We&apos;ve added free rounds to your account…&rdquo;.</>
            : <>Replaces the opening &ldquo;Welcome!&rdquo;. The email then continues &ldquo;You&apos;ve been gifted a free round…&rdquo;.</>}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="w-28 shrink-0">
          <label htmlFor="comp-rounds" className={labelClass}>Rounds to give</label>
          <input
            id="comp-rounds"
            type="number"
            min={1}
            max={MAX_COMP_ROUNDS}
            step={1}
            value={rounds}
            onChange={(e) => setRounds(Math.max(1, Math.min(MAX_COMP_ROUNDS, Math.floor(Number(e.target.value)) || 1)))}
            className={inputClass}
          />
        </div>
        <div className="shrink-0">
          <label htmlFor="comp-reason" className={labelClass}>Reason</label>
          <select
            id="comp-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as CompReason | "")}
            required
            className={inputClass}
          >
            <option value="">Choose…</option>
            {COMP_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <fieldset className={`space-y-1.5 ${lookup?.kind === "existing" ? "hidden" : ""}`}>
          <legend className={labelClass}>Post Perks</legend>
          <label className="flex items-center gap-2 text-sm text-dark">
            <input type="radio" name="perks" checked={includePerks} onChange={() => setIncludePerks(true)} />
            With Post Perks (a match, Perks, or both)
          </label>
          <label className="flex items-center gap-2 text-sm text-dark">
            <input type="radio" name="perks" checked={!includePerks} onChange={() => setIncludePerks(false)} />
            Match only, no Post Perks
          </label>
        </fieldset>
      </div>
      {error && <p className="text-sm text-coral">{error}</p>}
      {notice && <p className="text-sm text-dark">{notice}</p>}
      <button
        type="submit"
        disabled={isPending || !email.trim() || !reason || lookup?.kind === "blocked" || lookup?.kind === "invalid"}
        className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-coral hover:bg-coral-dark text-white transition disabled:opacity-60"
      >
        {isPending ? "Comping…" : "Comp this member"}
      </button>
    </form>
  );
}
