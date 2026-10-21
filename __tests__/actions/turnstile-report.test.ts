import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockHeaders } = vi.hoisted(() => ({ mockHeaders: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mockHeaders }));

import { reportTurnstileOutcome } from "@/app/actions/turnstile-report";

const fetchMock = vi.fn();

function requestHeaders(values: Record<string, string>) {
  mockHeaders.mockResolvedValue({ get: (name: string) => values[name.toLowerCase()] ?? null });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_UMAMI_WEBSITE_ID", "site-123");
  requestHeaders({ host: "postpartumpost.com", "user-agent": "TestBrowser/1.0", "accept-language": "nl-NL,nl;q=0.9" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reportTurnstileOutcome", () => {
  it("sends a named event with the form to Umami from the live site", async () => {
    await reportTurnstileOutcome("blocked", "signup", "/");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gateway.umami.is/api/send");
    expect(init.headers["User-Agent"]).toBe("TestBrowser/1.0");
    const body = JSON.parse(init.body);
    expect(body.type).toBe("event");
    expect(body.payload).toMatchObject({
      website: "site-123",
      hostname: "postpartumpost.com",
      url: "/",
      language: "nl-NL",
      name: "Turnstile: blocked",
      data: { form: "signup" },
    });
  });

  it("forwards the visitor's IP when Netlify provides it", async () => {
    requestHeaders({ host: "postpartumpost.com", "x-nf-client-connection-ip": "203.0.113.7" });
    await reportTurnstileOutcome("passed", "perk_idea", "/perks");
    expect(fetchMock.mock.calls[0][1].headers["X-Forwarded-For"]).toBe("203.0.113.7");
  });

  it("ignores unknown outcomes and forms", async () => {
    await reportTurnstileOutcome("hacked", "signup", "/");
    await reportTurnstileOutcome("passed", "somewhere-else", "/");
    await reportTurnstileOutcome("constructor", "signup", "/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing outside a production build", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await reportTurnstileOutcome("passed", "signup", "/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing on deploy previews or other hosts", async () => {
    requestHeaders({ host: "deploy-preview-27--postpartum-post.netlify.app" });
    await reportTurnstileOutcome("passed", "signup", "/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing without a Umami website ID", async () => {
    vi.stubEnv("NEXT_PUBLIC_UMAMI_WEBSITE_ID", "");
    await reportTurnstileOutcome("passed", "signup", "/");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws if Umami is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    await expect(reportTurnstileOutcome("passed", "signup", "/")).resolves.toBeUndefined();
  });
});
