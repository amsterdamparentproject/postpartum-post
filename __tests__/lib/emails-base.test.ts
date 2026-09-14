import { describe, it, expect, afterEach, vi } from "vitest";
import { subjectPrefix } from "@/lib/emails/base";

describe("subjectPrefix", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns "TEST: " in development', () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(subjectPrefix()).toBe("TEST: ");
  });

  it('returns "TEST: " in test', () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(subjectPrefix()).toBe("TEST: ");
  });

  it('returns "" in production', () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(subjectPrefix()).toBe("");
  });
});
