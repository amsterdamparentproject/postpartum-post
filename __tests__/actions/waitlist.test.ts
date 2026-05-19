import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestSupabase } from "@tests/helpers";
import { joinWaitlist } from "@/app/actions/waitlist";
import { sendWaitlistConfirmationEmail } from "@/lib/emails";

vi.mock("@/lib/emails", () => ({
  sendWaitlistConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

const mockSendWaitlistConfirmationEmail = vi.mocked(sendWaitlistConfirmationEmail);

const TEST_EMAIL = `waitlist-test-${crypto.randomUUID()}@example.com`;

describe("joinWaitlist", () => {
  afterEach(async () => {
    const supabase = createTestSupabase();
    await supabase.from("waitlist").delete().eq("email", TEST_EMAIL);
    mockSendWaitlistConfirmationEmail.mockClear();
  });

  it("inserts the email and sends a confirmation", async () => {
    const result = await joinWaitlist(TEST_EMAIL);

    expect(result.success).toBe(true);

    const supabase = createTestSupabase();
    const { data } = await supabase
      .from("waitlist")
      .select("email")
      .eq("email", TEST_EMAIL)
      .single();
    expect(data?.email).toBe(TEST_EMAIL);

    expect(mockSendWaitlistConfirmationEmail).toHaveBeenCalledOnce();
    expect(mockSendWaitlistConfirmationEmail).toHaveBeenCalledWith(TEST_EMAIL);
  });

  it("returns success without sending a second email for a duplicate signup", async () => {
    // First signup
    await joinWaitlist(TEST_EMAIL);
    mockSendWaitlistConfirmationEmail.mockClear();

    // Duplicate
    const result = await joinWaitlist(TEST_EMAIL);

    expect(result.success).toBe(true);
    expect(mockSendWaitlistConfirmationEmail).not.toHaveBeenCalled();
  });
});
