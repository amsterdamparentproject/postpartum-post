import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyMagicLinkToken } from "@/lib/auth-confirm";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockVerifyOtp = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createBrowserClient: () => ({
    auth: { verifyOtp: mockVerifyOtp },
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verifyMagicLinkToken", () => {
  beforeEach(() => {
    mockVerifyOtp.mockReset();
  });

  it("calls verifyOtp with the correct token_hash and type", async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: null });

    const result = await verifyMagicLinkToken("test-hash-abc123", "magiclink");

    expect(mockVerifyOtp).toHaveBeenCalledOnce();
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: "test-hash-abc123",
      type: "magiclink",
    });
    expect(result).toBeNull();
  });

  it("returns null on success", async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    const result = await verifyMagicLinkToken("valid-hash", "magiclink");

    expect(result).toBeNull();
  });

  it("returns an error message when the token is expired", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: {},
      error: { message: "Token has expired or is invalid" },
    });

    const result = await verifyMagicLinkToken("expired-hash", "magiclink");

    expect(result).toBe("Token has expired or is invalid");
  });

  it("returns an error message when the token has already been used", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: {},
      error: { message: "Token has expired or is invalid" },
    });

    const result = await verifyMagicLinkToken("already-used-hash", "magiclink");

    expect(result).toBe("Token has expired or is invalid");
  });

  it("works with 'email' type as well as 'magiclink'", async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: null });

    await verifyMagicLinkToken("test-hash", "email");

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: "test-hash",
      type: "email",
    });
  });

  it("returns the error message on a network or Supabase error", async () => {
    mockVerifyOtp.mockResolvedValue({
      data: {},
      error: { message: "Network request failed" },
    });

    const result = await verifyMagicLinkToken("some-hash", "magiclink");

    expect(result).toBe("Network request failed");
  });
});
