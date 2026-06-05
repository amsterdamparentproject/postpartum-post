import { describe, it, expect, afterEach } from "vitest";
import { subjectPrefix } from "@/lib/emails/base";

describe("subjectPrefix", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns "TEST: " in development', () => {
    process.env.NODE_ENV = "development";
    expect(subjectPrefix()).toBe("TEST: ");
  });

  it('returns "TEST: " in test', () => {
    process.env.NODE_ENV = "test";
    expect(subjectPrefix()).toBe("TEST: ");
  });

  it('returns "" in production', () => {
    process.env.NODE_ENV = "production";
    expect(subjectPrefix()).toBe("");
  });
});
