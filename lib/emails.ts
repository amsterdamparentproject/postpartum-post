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

const FROM = "Postpartum Post <post@amsterdamparentproject.nl>";
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
// Email image assets must always point to production — localhost URLs are unreachable by email clients.
const ASSETS_URL = "https://postpartumpost.com";

const INSTAGRAM_ICON = `${ASSETS_URL}/email-images/instagram.png`;
const EMAIL_ICON = `${ASSETS_URL}/email-images/email.png`;

// ---------------------------------------------------------------------------
// Base template helpers
// ---------------------------------------------------------------------------

/** <head> block shared by all emails. Pass a preload link string for email-specific images. */
function emailHead(extraPreloads = ""): string {
  return `<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${extraPreloads}
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
  <meta name="x-apple-disable-message-reformatting">
  <style>
    body{margin:0;padding:0}
    table{mso-table-lspace:0;mso-table-rspace:0}
    p,span,h1,h2,h3,h4,h5,h6{margin:0;padding:0}
    p{line-height:inherit}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:inherit!important}
    #MessageViewBody a{color:inherit;text-decoration:none}
    img+div{display:none}
    .ecw{width:100%!important;min-width:0!important}
  </style>
  <!--[if mso]><div>
    <noscript>
      <xml>
        <w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word">
          <w:DontUseAdvancedTypographyReadingMail/>
        </w:WordDocument>
        <o:OfficeDocumentSettings>
          <o:AllowPNG/>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    </noscript>
  </div><![endif]-->
  <!--[if !mso]><!-->
  <style>
    @media (max-width:100px) {
      .l3-c0,.l3-c1{display:block!important;width:100%!important}
      .l3-s0{display:block!important;width:auto!important;height:3px;font-size:0}
    }
  </style>
  <!--<![endif]-->
</head>`;
}

/** Shared footer: APP + contact callout, social icons, copyright. */
function emailFooter(): string {
  return `
                  <!-- Amsterdam Parent Project + contact -->
                  <tr><td style="padding:0 24px 16px">
                    <table border="0" cellpadding="0" cellspacing="0" align="center"
                      style="display:table;width:100%;max-width:100%;table-layout:fixed;margin:0 auto;background-color:#cbdfbd;border-radius:15px">
                      <tbody><tr><td style="padding:36px">
                        <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
                          style="color:#000;font-size:16px;line-height:1.4;text-align:left;font-family:Arial,Helvetica,sans-serif;border-collapse:collapse;word-wrap:break-word;word-break:break-word">
                          <tbody>
                            <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                              <span style="font-weight:700">Postpartum Post is a project by Amsterdam Parent Project</span>, a <a href="https://amsterdamparentproject.nl/about" target="_blank" rel="noopener noreferrer" style="color:#000000;text-decoration:underline;">nonprofit community organization</a> helping parents with babies and toddlers thrive in Amsterdam.
                            </td></tr>
                            <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                              We'd love to hear from you — send us any questions, concerns, or feedback via <a href="mailto:post@amsterdamparentproject.nl" style="color:#000000;text-decoration:underline;">post@amsterdamparentproject.nl</a>.
                            </td></tr>
                          </tbody>
                        </table>
                      </td></tr>
                    </table>
                  </td></tr>

                  <!-- Social icons -->
                  <tr><td style="padding:0 24px 16px">
                    <table border="0" cellpadding="0" cellspacing="0" align="center"
                      style="display:table;width:100%;max-width:100%;table-layout:fixed;margin:0 auto">
                      <tbody><tr><td style="text-align:center">
                        <table border="0" cellpadding="0" cellspacing="0"
                          style="width:100%;max-width:171px;table-layout:fixed;margin:0 auto">
                          <tbody><tr>
                            <td width="50.62%" class="l3-c0" style="width:50.62%;box-sizing:border-box;vertical-align:middle">
                              <table border="0" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed">
                                <tbody><tr><td style="padding:10px">
                                  <a href="http://amsterdamparentproject.nl/instagram" target="_blank" rel="noopener nofollow"
                                    style="display:block;text-decoration:none;border:none;outline:none" aria-label="Instagram">
                                    <table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr>
                                      <td align="center">
                                        <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="24" style="width:24px"><tbody><tr><td><![endif]-->
                                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:24px"><tbody><tr>
                                          <td style="width:100%">
                                            <img src="${INSTAGRAM_ICON}" width="24" height="24"
                                              alt="Instagram" style="display:block;width:100%;height:auto;max-width:100%">
                                          </td>
                                        </tr></tbody></table>
                                        <!--[if mso]></td></tr></tbody></table><![endif]-->
                                      </td>
                                    </tr></tbody></table>
                                  </a>
                                </td></tr>
                              </table>
                            </td>
                            <td width="3" class="l3-s0" style="width:3px;box-sizing:border-box;font-size:0">&nbsp;</td>
                            <td width="47.62%" class="l3-c1" style="width:47.62%;box-sizing:border-box;vertical-align:middle">
                              <table border="0" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed">
                                <tbody><tr><td style="padding:10px">
                                  <a href="mailto:post@amsterdamparentproject.nl" target="_blank" rel="noopener nofollow"
                                    style="display:block;text-decoration:none;border:none;outline:none" aria-label="Email us">
                                    <table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr>
                                      <td align="center">
                                        <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="23" style="width:23px"><tbody><tr><td><![endif]-->
                                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:23px"><tbody><tr>
                                          <td style="width:100%">
                                            <img src="${EMAIL_ICON}" width="23" height="18"
                                              alt="Email" style="display:block;width:100%;height:auto;max-width:100%">
                                          </td>
                                        </tr></tbody></table>
                                        <!--[if mso]></td></tr></tbody></table><![endif]-->
                                      </td>
                                    </tr></tbody></table>
                                  </a>
                                </td></tr>
                              </table>
                            </td>
                          </tr></tbody>
                        </table>
                      </td></tr>
                    </table>
                  </td></tr>

                  <!-- Copyright -->
                  <tr><td dir="ltr" style="font-size:13.3px;text-align:center;padding:0 24px 24px;line-height:18.2px;mso-line-height-alt:18.2px">
                    &copy; 2026 Postpartum Post. All rights reserved.
                    You're receiving this email because you subscribed to Postpartum Post.
                    &middot; <a href="${SITE_URL}/billing?utm_source=email&utm_campaign=transactional&utm_content=manage-subscription" style="color:#000000;">Manage subscription</a>
                  </td></tr>`;
}

/**
 * Purple pill CTA button — consistent styling across all emails.
 * Returns a full <tr> ready to drop into the email body.
 */
function ctaButton(label: string, url: string): string {
  return `
                  <!-- CTA button -->
                  <tr><td style="padding:0 24px 16px">
                    <table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr>
                      <td align="center">
                        <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="317" style="width:317px"><tbody><tr><td><![endif]-->
                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:317px"><tbody><tr>
                          <td style="width:100%">
                            <a href="${url}" target="_blank" rel="noopener" style="color:#000000;text-decoration:none">
                              <!--[if mso]>
                              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                                href="${url}" style="height:52px;width:317px;v-text-anchor:middle;" arcsize="100%" fillcolor="#caadff">
                                <v:stroke dashstyle="Solid" weight="0px" color="#caadff"/>
                                <w:anchorlock/>
                                <v:textbox inset="0px,0px,0px,0px">
                                  <center dir="false" style="color:#000000;font-family:sans-serif;font-size:17.8px">
                              <![endif]-->
                              <span style="background-color:#caadff;border-radius:134px;color:#000000;display:table;font-family:Arial,Helvetica,sans-serif;font-size:17.8px;font-weight:700;height:52px;text-align:center;width:100%;box-sizing:border-box;letter-spacing:0.047em;line-height:24.9px">
                                <span style="padding-left:8px;padding-right:8px;display:table-cell;height:100%;vertical-align:middle">
                                  ${label}
                                </span>
                              </span>
                              <!--[if mso]></center></v:textbox></v:roundrect><![endif]-->
                            </a>
                          </td>
                        </tr></tbody></table>
                        <!--[if mso]></td></tr></tbody></table><![endif]-->
                      </td>
                    </tr></tbody></table>
                  </td></tr>`;
}

/**
 * Body copy section — pass inner <tr><td>...</td></tr> rows.
 * Handles all the email-table nesting boilerplate.
 */
function bodySection(rows: string): string {
  return `
                  <tr><td style="padding:0 24px 16px">
                    <table border="0" cellpadding="0" cellspacing="0" align="center"
                      style="display:table;width:100%;max-width:100%;table-layout:fixed;margin:0 auto">
                      <tbody><tr><td>
                        <table border="0" cellpadding="0" cellspacing="0"
                          style="width:100%;max-width:552px;table-layout:fixed;margin:0 auto">
                          <tbody><tr><td style="width:100%;box-sizing:border-box;vertical-align:top">
                            <table border="0" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed">
                              <tbody><tr><td style="padding:26px">
                                <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
                                  style="color:#000;font-size:16px;line-height:1.4;text-align:left;font-family:Arial,Helvetica,sans-serif;border-collapse:collapse;word-wrap:break-word;word-break:break-word">
                                  <tbody>
                                    ${rows}
                                  </tbody>
                                </table>
                              </td></tr>
                            </table>
                          </td></tr>
                        </table>
                      </td></tr>
                    </table>
                  </td></tr>`;
}

/**
 * Full email wrapper — wraps content rows in the Canva-style layout and appends the shared footer.
 * @param content  One or more <tr> rows (use bodySection / ctaButton helpers)
 * @param extraPreloads  Optional <link rel="preload"> tags for email-specific images
 */
function baseEmail(content: string, extraPreloads = ""): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
${emailHead(extraPreloads)}
<body style="width:100%;-webkit-text-size-adjust:100%;text-size-adjust:100%;background-color:#f0f1f5;margin:0;padding:0">

<table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5" style="background-color:#f0f1f5">
  <tbody><tr><td style="background-color:#f0f1f5">

    <!--[if mso]><center>
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600"><tbody><tr><td>
    <![endif]-->

    <table align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" class="ecw"
      style="max-width:600px;min-height:600px;margin:0 auto;background-color:#ffffff;width:600px;min-width:600px">
      <tbody>
        <tr><td style="vertical-align:top"></td></tr>
        <tr><td style="vertical-align:top;padding:0">
          <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
            <tbody><tr><td style="padding:24px 0 24px 0;vertical-align:top">
              <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
                style="color:#000;font-size:16px;line-height:1.4;text-align:left;font-family:Arial,Helvetica,sans-serif;border-collapse:collapse;word-wrap:break-word;word-break:break-word">
                <tbody>
                  ${content}
                  ${emailFooter()}
                </tbody>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td height="100%" style="height:100%;font-size:0;line-height:0" aria-hidden="true">&nbsp;</td></tr>
      </tbody>
    </table>

    <!--[if mso]></td></tr></tbody></table></center><![endif]-->

  </td></tr></tbody>
</table>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Welcome email
// ---------------------------------------------------------------------------

function welcomeHtml(firstName: string, profileLink: string, planLabel: string, nextBillingDate: string): string {
  const headerImage = `
                  <!-- Header image -->
                  <tr><td style="padding:0 24px 16px">
                    <table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr>
                      <td align="center">
                        <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="408" style="width:408px"><tbody><tr><td><![endif]-->
                        <table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:408px"><tbody><tr>
                          <td style="width:100%">
                            <img src="${ASSETS_URL}/email-images/welcome-header.png" width="408" height="409"
                              alt="Welcome to Postpartum Post"
                              style="display:block;width:100%;height:auto;max-width:100%">
                          </td>
                        </tr></tbody></table>
                        <!--[if mso]></td></tr></tbody></table><![endif]-->
                      </td>
                    </tr></tbody></table>
                  </td></tr>`;

  const welcomeCopy = bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Welcome, ${firstName}!</span>
                                      <span> We're really excited to have you in the community.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>You're subscribed to the </span><span style="font-weight:700">${planLabel}</span><span> plan. Your first billing date is </span><span style="font-weight:700">${nextBillingDate}</span><span>. You can manage or cancel your subscription any time from your billing page.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span>Each month, we'll introduce you to another new or expecting parent nearby. Think of it as a</span>
                                      <span style="font-weight:700"> friendship starter pack</span><span>: you'll both have each others' names, contact, and a list of fun activities to do by yourselves or together with your families.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      In order to find the best matches for you, we've put together a profile. If you haven't already, fill out as much — or as little — as you want; we'll find you a match with whatever information we have.
                                    </td></tr>`);

  const schedule = bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Here's what to expect from us each month:
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-align:left;padding:0 0 16px;line-height:1.43;mso-line-height-alt:22.9px">
                                      <span style="text-decoration:underline">1st to 5th of the month:</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.43;mso-line-height-alt:22.9px">
                                      <span style="font-weight:700">Opt into matching</span>
                                      <span> by choosing a topic and how you want to meet — online or offline. You can always skip a month at no charge and get your subscription extended automatically.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-decoration:underline;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      7th of the month:
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Receive your match</span>
                                      <span>! Your introduction, accompanied by a whimsical piece of art from our community.</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="color:#c56850;font-size:16px;font-weight:700;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="text-decoration:underline">Before the 14th of the month:</span>
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">Request a rematch</span>
                                      <span> if it's not working out</span>
                                    </td></tr>`);

  return baseEmail(
    headerImage + welcomeCopy + ctaButton("Go to your profile", profileLink) + schedule,
    `<link rel="preload" as="image" href="${ASSETS_URL}/email-images/welcome-header.png">`
  );
}

export async function sendWelcomeEmail(
  email: string,
  firstName: string,
  profileLink: string,
  planLabel: string,
  nextBillingDate: string,
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Welcome to Postpartum Post 💌",
    html: welcomeHtml(firstName, profileLink, planLabel, nextBillingDate),
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
  const content =
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your Postpartum Post subscription has been canceled. No more charges will be made, and your current period runs until the end of the billing cycle.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      I'm sorry to see you go. I hope Postpartum Post brought you at least one meaningful connection — that was always the goal.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      If you'd like to come back, you're always welcome. Whenever the timing is right, you can resubscribe below.
                                    </td></tr>`) +
    ctaButton("Visit postpartumpost.com →", SITE_URL);
  return baseEmail(content);
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
  const content =
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You've skipped the last three months in a row, so I've automatically paused your subscription — no more charges until you're ready to come back.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Life with a little one is unpredictable, and there's no pressure here. When things settle down and you'd like to start receiving matches again, just log in to billing and resume whenever you're ready.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;line-height:1.4;mso-line-height-alt:22.4px">
                                      Or simply reply to this email and I'll help you sort it out personally.
                                    </td></tr>`) +
    ctaButton("Manage billing →", `${SITE_URL}/billing`);
  return baseEmail(content);
}

// ---------------------------------------------------------------------------
// Monthly opt-in email
// ---------------------------------------------------------------------------

function optinHtml(
  firstName: string,
  coffeeUrl: string,
  playdateUrl: string,
  skipUrl: string
): string {
  const content = bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${firstName}!
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      It's matching time. Let us know how you'd like to meet this month — we'll take care of the rest.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      You have until the <span style="font-weight:700">5th of the month</span> to respond.
                                    </td></tr>`) +
    ctaButton("☕ Meet for coffee", coffeeUrl) +
    ctaButton("🧸 Meet for a playdate", playdateUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:13px;text-align:center;color:#666666;line-height:1.4;mso-line-height-alt:18.2px">
                                      Need a break this month? <a href="${skipUrl}" style="color:#666666;">Skip this month</a> — your subscription will be extended automatically.
                                    </td></tr>`);

  return baseEmail(content);
}

export async function sendOptinEmail(
  email: string,
  firstName: string,
  coffeeUrl: string,
  playdateUrl: string,
  skipUrl: string
) {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Who would you like to meet this month? 💌",
    html: optinHtml(firstName, coffeeUrl, playdateUrl, skipUrl),
  });
  if (error) {
    console.error("[resend] sendOptinEmail error:", error);
    throw error;
  }
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

// ---------------------------------------------------------------------------
// Match reveal email
// ---------------------------------------------------------------------------

function matchRevealHtml(
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  matchEmail: string,
  matchType: string | null,
  matchPageUrl: string,
): string {
  const meetingContext = matchType === "in_person"
    ? "meeting up in person"
    : matchType === "online"
    ? "connecting online"
    : "connecting";

  const content =
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Hi ${recipientFirstName},
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your match for this month is <span style="font-weight:700">${matchFirstName} ${matchLastName}</span>. We think you two will get along well — enjoy ${meetingContext}!
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      Your match page has both of your contact details, plus some local activities and resources to inspire you. The link below is shared between you and ${matchFirstName} — no login needed.
                                    </td></tr>
                                    <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 0 16px;line-height:1.4;mso-line-height-alt:22.4px">
                                      <span style="font-weight:700">${matchFirstName}&apos;s email:</span> <a href="mailto:${matchEmail}" style="color:#000000;text-decoration:underline;">${matchEmail}</a>
                                    </td></tr>`) +
    ctaButton("See your match page", matchPageUrl) +
    bodySection(`
                                    <tr><td dir="ltr" style="font-size:14px;color:#666666;text-align:left;padding:0 0 8px;line-height:1.4;mso-line-height-alt:19.6px">
                                      If this match isn&apos;t working out, you can request a rematch from your profile page before the 14th of the month.
                                    </td></tr>`);

  return baseEmail(content);
}

export async function sendMatchRevealEmail(
  recipientEmail: string,
  recipientFirstName: string,
  matchFirstName: string,
  matchLastName: string,
  matchEmail: string,
  matchType: string | null,
  matchPageUrl: string,
): Promise<void> {
  const resend = getResend();
  const { error } = await resend.emails.send({
    from: FROM,
    to: recipientEmail,
    subject: `Your Postpartum Post match for ${new Date().toLocaleString("en-US", { month: "long" })} is here 💌`,
    html: matchRevealHtml(
      recipientFirstName,
      matchFirstName,
      matchLastName,
      matchEmail,
      matchType,
      matchPageUrl,
    ),
  });
  if (error) {
    console.error("[resend] sendMatchRevealEmail error:", error);
    throw error;
  }
}

