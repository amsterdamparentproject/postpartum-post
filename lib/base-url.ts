import { headers } from "next/headers";

// Derives the origin from the incoming request so links we generate (Stripe
// success/cancel URLs, Supabase magic links) work on whatever port the dev
// server actually happens to be running on, instead of drifting from
// whatever NEXT_PUBLIC_BASE_URL is currently set to in .env.local. Falls
// back to the configured env var in production (behind a reverse proxy, the
// host header reflects the internal host rather than the public origin).
export async function getBaseUrl(): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    return process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
  }
  const headersList = await headers();
  const host = headersList.get("host");
  return host ? `http://${host}` : (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000");
}
