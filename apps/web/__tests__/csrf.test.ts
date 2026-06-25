import type { NextRequest } from "next/server";
import { checkCsrf } from "@/lib/csrf";

// Build a minimal NextRequest-like object — checkCsrf only reads headers.get().
function reqWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("checkCsrf", () => {
  it("passes same-origin requests via Origin header", () => {
    expect(checkCsrf(reqWith({ host: "pages.example.com", origin: "https://pages.example.com" }))).toBe(true);
  });

  it("passes same-origin requests via Referer when Origin is absent", () => {
    expect(checkCsrf(reqWith({ host: "pages.example.com", referer: "https://pages.example.com/dashboard" }))).toBe(true);
  });

  it("rejects cross-origin Origin", () => {
    expect(checkCsrf(reqWith({ host: "pages.example.com", origin: "https://evil.com" }))).toBe(false);
  });

  it("rejects cross-origin Referer", () => {
    expect(checkCsrf(reqWith({ host: "pages.example.com", referer: "https://evil.com/attack" }))).toBe(false);
  });

  it("rejects when neither Origin nor Referer is present", () => {
    expect(checkCsrf(reqWith({ host: "pages.example.com" }))).toBe(false);
  });

  it("rejects when Host header is missing", () => {
    expect(checkCsrf(reqWith({ origin: "https://pages.example.com" }))).toBe(false);
  });

  it("rejects a malformed Origin value", () => {
    expect(checkCsrf(reqWith({ host: "pages.example.com", origin: "not a url" }))).toBe(false);
  });

  it("treats different ports as different origins", () => {
    expect(checkCsrf(reqWith({ host: "pages.example.com", origin: "https://pages.example.com:8443" }))).toBe(false);
  });
});
