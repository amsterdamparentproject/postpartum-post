import { describe, it, expect, afterEach, vi } from "vitest";
import { devToolsEnabledFor } from "@/lib/dev-tools";

const EMAIL = "amsterdamparentproject@gmail.com";

describe("devToolsEnabledFor", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is on for the test account outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://byukhyutyesczrlixzos.supabase.co");
    expect(devToolsEnabledFor(EMAIL)).toBe(true);
    expect(devToolsEnabledFor(EMAIL.toUpperCase())).toBe(true);
  });

  it("is off in a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://byukhyutyesczrlixzos.supabase.co");
    expect(devToolsEnabledFor(EMAIL)).toBe(false);
  });

  it("is off against the production Supabase project, even in dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://lchjodrcpfauvkxnhnxe.supabase.co");
    expect(devToolsEnabledFor(EMAIL)).toBe(false);
  });

  it("is off for anyone else, or no one", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://byukhyutyesczrlixzos.supabase.co");
    expect(devToolsEnabledFor("someone@example.com")).toBe(false);
    expect(devToolsEnabledFor(null)).toBe(false);
    expect(devToolsEnabledFor(undefined)).toBe(false);
  });

  it("can be pointed at another email with DEV_TOOLS_EMAIL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://byukhyutyesczrlixzos.supabase.co");
    vi.stubEnv("DEV_TOOLS_EMAIL", "me@example.com");
    expect(devToolsEnabledFor("me@example.com")).toBe(true);
    expect(devToolsEnabledFor(EMAIL)).toBe(false);
  });
});
