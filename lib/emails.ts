/**
 * Transactional email send functions — all go via Resend API.
 *
 * Auth emails (magic link) are handled separately by Supabase custom SMTP → Resend.
 * Match emails (1st of month, postcards) are handled by n8n → Resend.
 *
 * This module covers:
 *   - Welcome (on checkout complete)
 *   - Unsubscribed (on subscription deleted)
 *   - Auto-pause (on 3 consecutive skips, monthly plan only)
 */

import { getResend } from "@/lib/resend";

const FROM = "Postpartum Post <hello@amsterdamparentproject.nl>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://postpartumpost.nl";

// ---------------------------------------------------------------------------
// Shared layout wrapper
// ---------------------------------------------------------------------------

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Postpartum Post</title>
</head>
<body style="margin:0;padding:0;background:#fdf6f0;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf6f0;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#fff;border-radius:16px;border:1px solid #e8ddd5;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#fff8f4;border-bottom:1px solid #e8ddd5;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:600;color:#1a1a1a;letter-spacing:-0.3px;">
                <span style="color:#e85d3a;font-style:italic;">Postpartum</span> Post 💌
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;color:#1a1a1a;font-size:16px;line-height:1.7;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fdf6f0;border-top:1px solid #e8ddd5;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 4px;font-size:12px;color:#9e8c82;">
                Run by <a href="https://amsterdamparentproject.nl" style="color:#e85d3a;text-decoration:none;">Alex from Amsterdam Parent Project</a>
              </p>
              <p style="margin:0;font-size:12px;color:#9e8c82;">
                Manage your subscription at <a href="${SITE_URL}/billing" style="color:#e85d3a;text-decoration:none;">postpartumpost.nl/billing</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Welcome email
// ---------------------------------------------------------------------------

function welcomeHtml(firstName: string): string {
  return layout(`
    <p style="margin:0 0 20px;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;">
      Welcome to Postpartum Post — I'm so glad you're here. 🎉
    </p>
    <p style="margin:0 0 20px;">
      Each month, I'll introduce you to another new parent in Amsterdam. Think of it as a little letter arriving in your inbox — a warm introduction to someone nearby who's in the same chapter of life as you.
    </p>
    <p style="margin:0 0 20px;">
      Before your first match, I'd love to know a little more about you. It only takes a couple of minutes, and it helps me find you the best possible match.
    </p>
    <p style="margin:0 32px;">
      <a href="${SITE_URL}/profile"
        style="display:inline-block;background:#e85d3a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;font-family:sans-serif;">
        Complete your profile →
      </a>
    </p>
    <p style="margin:0 0 20px;">
      If you ever need to skip a month, just use the link in your monthly email — no forms, no explanations needed. I'll adjust your billing automatically.
    </p>
    <p style="margin:0;">
      Looking forward to introducing you to someone wonderful,<br />
      <strong>Alex</strong>
    </p>
  `);
}

export async function sendWelcomeEmail(email: string, firstName: string) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Welcome to Postpartum Post 💌",
    html: welcomeHtml(firstName),
  });
  if (error) {
    console.error("[resend] sendWelcomeEmail error:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Unsubscribed email
// ---------------------------------------------------------------------------

function unsubscribedHtml(firstName: string): string {
  return layout(`
    <p style="margin:0 0 20px;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;">
      Your Postpartum Post subscription has been canceled. No more charges will be made, and your current period runs until the end of the billing cycle.
    </p>
    <p style="margin:0 0 20px;">
      I'm sorry to see you go. I hope Postpartum Post brought you at least one meaningful connection — that was always the goal.
    </p>
    <p style="margin:0 0 20px;">
      If you'd like to come back, you're always welcome. Whenever the timing is right, you can resubscribe at:
    </p>
    <p style="margin:0 32px;">
      <a href="${SITE_URL}"
        style="display:inline-block;background:#e85d3a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;font-family:sans-serif;">
        postpartumpost.nl →
      </a>
    </p>
    <p style="margin:0;">
      Take good care,<br />
      <strong>Alex</strong>
    </p>
  `);
}

export async function sendUnsubscribedEmail(email: string, firstName: string) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "You've unsubscribed from Postpartum Post",
    html: unsubscribedHtml(firstName),
  });
  if (error) {
    console.error("[resend] sendUnsubscribedEmail error:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Auto-pause email
// ---------------------------------------------------------------------------

function autoPauseHtml(firstName: string): string {
  return layout(`
    <p style="margin:0 0 20px;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;">
      You've skipped the last three months in a row, so I've automatically paused your subscription — no more charges until you're ready to come back.
    </p>
    <p style="margin:0 0 20px;">
      Life with a little one is unpredictable, and there's no pressure here. When things settle down and you'd like to start receiving matches again, just log in to billing and resume whenever you're ready.
    </p>
    <p style="margin:0 32px;">
      <a href="${SITE_URL}/billing"
        style="display:inline-block;background:#e85d3a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;font-family:sans-serif;">
        Manage billing →
      </a>
    </p>
    <p style="margin:0 0 20px;">
      Or simply reply to this email and I'll help you sort it out personally.
    </p>
    <p style="margin:0;">
      Talk soon,<br />
      <strong>Alex</strong>
    </p>
  `);
}

export async function sendAutoPauseEmail(email: string, firstName: string) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your Postpartum Post subscription has been paused",
    html: autoPauseHtml(firstName),
  });
  if (error) {
    console.error("[resend] sendAutoPauseEmail error:", error);
    throw error;
  }
}
