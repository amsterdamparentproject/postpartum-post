import { describe, it, expect } from "vitest";
import { bucketPathFromUrl, commitPartnerImage } from "@/lib/partner-image-save";

/** The pure parts of lib/partner-image-save.ts — no DB or Storage calls. */

describe("bucketPathFromUrl", () => {
  it("extracts the path from one of our own public URLs", () => {
    expect(
      bucketPathFromUrl("https://abc.supabase.co/storage/v1/object/public/partner-images/p1/photo.webp"),
    ).toBe("p1/photo.webp");
  });

  it("is null for any other URL (e.g. pasted before uploads existed) or no URL", () => {
    expect(bucketPathFromUrl("https://example.com/logo.png")).toBeNull();
    expect(bucketPathFromUrl(null)).toBeNull();
  });
});

describe("commitPartnerImage path check", () => {
  // Rejected before any DB call, so a stub client is enough — if the check
  // ever regressed, touching the stub would throw instead of passing.
  const stub = {} as Parameters<typeof commitPartnerImage>[0];

  it("rejects a path in another partner's folder", async () => {
    const result = await commitPartnerImage(stub, "partner-a", "partner-b/photo.webp");
    expect(result).toEqual({ success: false, error: "Image not found" });
  });

  it("rejects path traversal out of the partner's folder", async () => {
    const result = await commitPartnerImage(stub, "partner-a", "partner-a/../partner-b/photo.webp");
    expect(result).toEqual({ success: false, error: "Image not found" });
  });
});
