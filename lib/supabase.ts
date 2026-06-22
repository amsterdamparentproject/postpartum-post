import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "postpartumpost" } }
  );
}

export function createActivitiesClient() {
  // Always reads from the live DB so local/test environments see real content.
  // Set ACTIVITIES_SUPABASE_URL + ACTIVITIES_SUPABASE_SERVICE_ROLE_KEY to the
  // production Supabase project; falls back to the current env if not set.
  return createClient(
    process.env.ACTIVITIES_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.ACTIVITIES_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "activities" } }
  );
}

// Singleton — all browser-side callers must share one instance so that
// auth events (signIn, signOut) fired by any component are received by
// every onAuthStateChange subscriber in the same tab.
let _browserClient: ReturnType<typeof createClient> | null = null;

export function createBrowserClient() {
  if (!_browserClient) {
    _browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _browserClient;
}
