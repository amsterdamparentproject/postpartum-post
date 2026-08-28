/**
 * Preview script — sends transactional emails to a given address.
 * Usage: yarn emails:preview [email] [name]
 * Default recipient: amsterdamparentproject@gmail.com
 * Pass an email name to send just that one (e.g. yarn emails:preview welcome)
 * Pass an email address first if you also want to filter (e.g. yarn emails:preview you@example.com welcome)
 *
 * match-reveal has 6 variants covering Track C4's billing-notice states
 * (billing plan §3.3):
 *   match-reveal             — no notice (comped/FYP member, or the pre-C4 default)
 *   match-reveal-counter     — bundle member, 2+ matches left this term
 *   match-reveal-last-match  — bundle member, exactly 1 match left
 *   match-reveal-quiet       — monthly member's renewal one-liner
 *   match-reveal-loud        — bundle member's counter just hit zero
 *   match-reveal-loud-gift   — same, but the ending term was gift-covered
 */

import { sendWelcomeEmail } from "../lib/emails/welcome.ts";
import { sendUnsubscribedEmail } from "../lib/emails/unsubscribed.ts";
import { sendAutoPauseEmail } from "../lib/emails/auto-pause.ts";
import { sendOptinEmail } from "../lib/emails/optin.ts";
import { sendMatchRevealEmail } from "../lib/emails/match-reveal.ts";
import type { BillingNotice } from "../lib/billing-notice.ts";
import { sendRematchConfirmationEmail } from "../lib/emails/rematch-confirmation.ts";
import { sendMemberUpdateEmail } from "../lib/emails/member-update.ts";
import { sendMeetupReminderEmail } from "../lib/emails/meetup-reminder.ts";
import { sendPendingFollowupEmail } from "../lib/emails/pending-followup.ts";

const args = process.argv.slice(2);
const isEmail = (s: string) => s.includes("@");

const TO = isEmail(args[0] ?? "") ? args[0] : "amsterdamparentproject@gmail.com";
const filter = isEmail(args[0] ?? "") ? args[1] : args[0];

const results: { name: string; ok: boolean; error?: string }[] = [];

async function send(name: string, fn: () => Promise<void>) {
  if (filter && name !== filter) return;
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (e: any) {
    results.push({ name, ok: false, error: e?.message });
    console.error(`✗ ${name}:`, e?.message);
  }
}

await send("welcome", () =>
  sendWelcomeEmail(TO, "Alex", "https://postpartumpost.com/profile", "3-month commitment (€8/mo)", "5 July 2026")
);

await send("unsubscribed", () =>
  sendUnsubscribedEmail(TO, "Alex")
);

await send("auto-pause", () =>
  sendAutoPauseEmail(TO, "Alex")
);

await send("optin", () =>
  sendOptinEmail(
    TO,
    "Alex",
    "https://postpartumpost.com/optin?action=coffee",
    "https://postpartumpost.com/optin?action=playdate",
    "https://postpartumpost.com/optin?action=skip"
  )
);

// Track C4 — base args shared by every match-reveal variant below; only
// the trailing BillingNotice differs. isRecipientInitiator pinned to
// false explicitly (rather than relying on the default) so the tuple
// spread lines up 1:1 with sendMatchRevealEmail's 11 positional params.
const matchRevealArgs = [
  TO,
  "Alex",
  "Sarah",
  "van der Berg",
  "sarah.vanderberg@example.com",
  "coffee",
  "https://postpartumpost.com/matches/preview",
  "https://postpartumpost.com/matches",
  false,
  false,
] as const;

const RENEWAL_CANCEL_URL =
  "https://postpartumpost.com/billing?utm_source=email&utm_campaign=transactional&utm_content=renewal-notice";

await send("match-reveal", () =>
  sendMatchRevealEmail(...matchRevealArgs, { kind: "none" } satisfies BillingNotice)
);

await send("match-reveal-counter", () =>
  sendMatchRevealEmail(...matchRevealArgs, { kind: "counter", matchesRemaining: 2 } satisfies BillingNotice)
);

await send("match-reveal-last-match", () =>
  sendMatchRevealEmail(...matchRevealArgs, { kind: "counter", matchesRemaining: 1 } satisfies BillingNotice)
);

await send("match-reveal-quiet", () =>
  sendMatchRevealEmail(...matchRevealArgs, {
    kind: "quiet",
    renewDate: "20 September 2026",
    amount: "€12",
  } satisfies BillingNotice)
);

await send("match-reveal-loud", () =>
  sendMatchRevealEmail(...matchRevealArgs, {
    kind: "loud",
    renewDate: "20 September 2026",
    amount: "€24",
    isFirstAfterGift: false,
    cancelUrl: RENEWAL_CANCEL_URL,
  } satisfies BillingNotice)
);

await send("match-reveal-loud-gift", () =>
  sendMatchRevealEmail(...matchRevealArgs, {
    kind: "loud",
    renewDate: "20 September 2026",
    amount: "€24",
    isFirstAfterGift: true,
    cancelUrl: RENEWAL_CANCEL_URL,
  } satisfies BillingNotice)
);

await send("rematch-confirmation", () =>
  sendRematchConfirmationEmail(TO, "Alex")
);

await send("member-update", () =>
  sendMemberUpdateEmail(TO, "Alex", "00000000-0000-0000-0000-000000000000")
);

await send("meetup-reminder", () =>
  sendMeetupReminderEmail(TO, "Alex", "Sarah", "sarah.vanderberg@example.com", "https://postpartumpost.com/feedback")
);

await send("pending-followup", () =>
  sendPendingFollowupEmail(TO, "Alex", "Test")
);

if (results.length === 0 && filter) {
  console.error(`Unknown email name: "${filter}". Valid names: welcome, unsubscribed, auto-pause, optin, match-reveal, match-reveal-counter, match-reveal-last-match, match-reveal-quiet, match-reveal-loud, match-reveal-loud-gift, rematch-confirmation, member-update, meetup-reminder, pending-followup`);
  process.exit(1);
}

console.log(`\nDone: ${results.filter(r => r.ok).length} sent, ${results.filter(r => !r.ok).length} failed`);
