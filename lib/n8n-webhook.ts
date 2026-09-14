"use server";

/**
 * Outbound POST to an n8n webhook — first use of this direction in this
 * repo. Every existing n8n reference here is n8n calling INTO postpartum-post
 * on a schedule (run-matcher, lock-matches, send-*-email); this is the
 * reverse. Mirrors desk/lib/PostToWebhook.tsx's shape exactly — same
 * X-N8N-WEBHOOK-SECRET header convention, same TEST_/prod URL split by
 * NODE_ENV — since that's the established, working pattern for "a form
 * submission becomes a Slack message," just not one that previously
 * existed in this repo.
 *
 * Fails soft: a misconfigured or unreachable webhook logs and returns
 * { success: false } rather than throwing, so callers can treat it as
 * fire-and-forget alongside a Supabase insert that already succeeded —
 * the Slack ping is a convenience notification, not the source of truth.
 */

const isLocal = process.env.NODE_ENV === "development";

async function postToWebhook(
  webhookURL: string | undefined,
  data: Record<string, unknown>,
): Promise<{ success: boolean; status?: number; error?: string }> {
  const authSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookURL || !authSecret) {
    console.error("[n8n-webhook] missing N8N webhook URL or N8N_WEBHOOK_SECRET");
    return { success: false, error: "Configuration error" };
  }

  try {
    const response = await fetch(webhookURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-N8N-WEBHOOK-SECRET": authSecret,
      },
      body: JSON.stringify(data),
    });

    const statusCode = response.status;
    if (!response.ok) {
      const text = await response.text();
      console.error(`[n8n-webhook] failed: ${statusCode}`, text);
    }
    return { success: response.ok, status: statusCode };
  } catch (error) {
    console.error("[n8n-webhook] error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export interface PartnerLeadPayload {
  businessName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  note?: string;
}

/**
 * Notifies Alex's n8n -> Slack workflow of a new partner lead. Always
 * called AFTER the partner_leads row is already inserted — this is a
 * best-effort notification on top of that, never the write itself.
 */
export async function postPartnerLead(payload: PartnerLeadPayload) {
  const webhookURL = isLocal
    ? process.env.TEST_N8N_PARTNER_LEAD_WEBHOOK_URL
    : process.env.N8N_PARTNER_LEAD_WEBHOOK_URL;

  return postToWebhook(webhookURL, { ...payload, source: "postpartum-post/partners" });
}
