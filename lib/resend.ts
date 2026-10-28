import { Resend } from "resend";
import { retryOnRateLimit } from "@/lib/retry-rate-limit";

let resendInstance: Resend | null = null;

export function getResend(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    const client = new Resend(process.env.RESEND_API_KEY);

    // Resend allows 10 requests/sec per account. Every transactional email goes
    // through this client, so retry 429s here (with backoff) instead of in each
    // sender — a rate-limited send otherwise fails permanently (e.g. the Oct 23
    // meetup reminder, where 4 of 20 sends were dropped).
    const send = client.emails.send.bind(client.emails);
    client.emails.send = ((...args: Parameters<typeof send>) =>
      retryOnRateLimit(() => send(...args))) as typeof client.emails.send;

    resendInstance = client;
  }
  return resendInstance;
}
