/**
 * Preview script — sends transactional emails to a given address.
 * Usage: yarn emails:preview [email] [name]
 * Default recipient: amsterdamparentproject@gmail.com
 * Pass an email name to send just that one (e.g. yarn emails:preview welcome)
 * Pass an email address first if you also want to filter (e.g. yarn emails:preview you@example.com welcome)
 */

import { sendWelcomeEmail } from "../lib/emails/welcome.ts";
import { sendUnsubscribedEmail } from "../lib/emails/unsubscribed.ts";
import { sendAutoPauseEmail } from "../lib/emails/auto-pause.ts";
import { sendOptinEmail } from "../lib/emails/optin.ts";
import { sendMatchRevealEmail } from "../lib/emails/match-reveal.ts";
import { sendRematchConfirmationEmail } from "../lib/emails/rematch-confirmation.ts";
import { sendMemberUpdateEmail } from "../lib/emails/member-update.ts";

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

await send("match-reveal", () =>
  sendMatchRevealEmail(
    TO,
    "Alex",
    "Sarah",
    "van der Berg",
    "coffee",
    "https://postpartumpost.com/matches/preview",
    "https://postpartumpost.com/matches",
    false
  )
);

await send("rematch-confirmation", () =>
  sendRematchConfirmationEmail(TO, "Alex")
);

await send("member-update", () =>
  sendMemberUpdateEmail(TO, "Alex", "00000000-0000-0000-0000-000000000000")
);

if (results.length === 0 && filter) {
  console.error(`Unknown email name: "${filter}". Valid names: welcome, unsubscribed, auto-pause, optin, match-reveal, rematch-confirmation, member-update`);
  process.exit(1);
}

console.log(`\nDone: ${results.filter(r => r.ok).length} sent, ${results.filter(r => !r.ok).length} failed`);
