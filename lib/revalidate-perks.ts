import { revalidatePath } from "next/cache";

/**
 * Refreshes the public pages that list perks (/perks and /partners) after
 * a write that changes what they show (status, content, partner photo). Swallows the error Next throws
 * outside a request (e.g. vitest calling a server action directly) — the
 * pages' own `revalidate = 300` is the fallback either way.
 */
export function revalidatePerksPage(): void {
  try {
    revalidatePath("/perks");
    revalidatePath("/partners");
  } catch {
    // Not in a Next request context — nothing to revalidate.
  }
}
