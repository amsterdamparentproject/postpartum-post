/**
 * Shared email constants, helpers, and layout components.
 * All transactional emails are built from these primitives.
 */

import { getResend } from "@/lib/resend";

export const FROM = "Postpartum Post <post@amsterdamparentproject.nl>";
export const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
// Email image assets must always point to production — localhost URLs are unreachable by email clients.
export const ASSETS_URL = "https://postpartumpost.com";

export const INSTAGRAM_ICON = `${ASSETS_URL}/email-images/instagram.png`;
export const EMAIL_ICON = `${ASSETS_URL}/email-images/email.png`;
export const TEXT_LOGO = `${ASSETS_URL}/email-images/logo.png`;
export const TEXT_LOGO_DARK = `${ASSETS_URL}/email-images/logo-dark.png`;
// Full-width banner with the cream (#fffbf1) background baked in. Used in the header so
// email clients' auto dark mode can't darken the background and hide the dark "post" text.
export const TEXT_BANNER = `${ASSETS_URL}/email-images/logo-banner.png`;

/** Returns "TEST: " when running locally, empty string in production. */
export function subjectPrefix(): string {
  return process.env.NODE_ENV !== "production" ? "TEST: " : "";
}

export { getResend };

// ---------------------------------------------------------------------------
// Base template helpers
// ---------------------------------------------------------------------------

/** <head> block shared by all emails. Pass a preload link string for email-specific images. */
export function emailHead(extraPreloads = ""): string {
  return `<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${extraPreloads}
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
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
export function emailFooter(): string {
  return `
                  <!-- Amsterdam Parent Project + contact -->
                  <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 48px 16px;line-height:1.4;mso-line-height-alt:22.4px">
                    Happy connecting,
                  </td></tr>
                  <tr><td dir="ltr" style="font-size:16px;text-align:left;padding:0 48px 24px;line-height:1.4;mso-line-height-alt:22.4px">
                    Alex from Amsterdam Parent Project
                  </td></tr>
                  <tr><td style="padding:0 36px 16px">
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
 * Logo header — shared by all non-welcome transactional emails.
 *
 * Uses a single full-width banner image with the cream (#fffbf1) background baked in,
 * shown identically in light and dark mode. Because email clients (Gmail, Outlook) do not
 * recolor image pixels, the cream field and the dark "post" text stay readable even when a
 * client forces dark mode — which previously darkened the CSS background and hid "post".
 *
 * `centered` only affects the Outlook (mso) text fallback; the banner image is always full width.
 */
export function emailHeader({ centered = true }: { centered?: boolean } = {}): string {
  const msoAlign = centered ? "center" : "left";
  return `
                  <!-- Brand header -->
                  <tr><td style="padding:0 0 16px">
                    <table border="0" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed">
                      <tbody><tr>
                        <td class="email-header-bg" style="background-color:#fffbf1;padding:0;text-align:${msoAlign};font-size:0;line-height:0">
                          <!--[if mso]><table cellpadding="0" cellspacing="0" border="0" align="${msoAlign}" style="margin:0 auto"><tbody><tr><td style="padding:20px 36px">
                            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;color:#d26149;letter-spacing:-0.3px;text-align:${msoAlign}">postpartum <span style="color:#12120f">post</span></p>
                          </td></tr></tbody></table><![endif]-->
                          <!--[if !mso]><!-->
                          <img src="${TEXT_BANNER}" width="600" height="67"
                            alt="postpartum post"
                            style="display:block;width:100%;height:auto;max-width:600px;border:0;margin:0 auto">
                          <!--<![endif]-->
                        </td>
                      </tr></tbody>
                    </table>
                  </td></tr>`;
}

/**
 * Purple pill CTA button — consistent styling across all emails.
 * Returns a full <tr> ready to drop into the email body.
 */
export function ctaButton(label: string, url: string): string {
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
export function bodySection(rows: string): string {
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
export function baseEmail(content: string, extraPreloads = ""): string {
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
