import { describe, expect, it } from "vitest";
import { authErrorUrl, safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/dashboard?tab=x")).toBe("/dashboard?tab=x");
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/a/b#c")).toBe("/a/b#c");
  });

  it("rejects anything that can leave the origin", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("dashboard")).toBe("/");
  });

  it("rejects empty and non-string input", () => {
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(42)).toBe("/");
    expect(safeNextPath(["/dashboard"])).toBe("/");
  });

  it("uses the supplied fallback when rejecting", () => {
    expect(safeNextPath("//evil.com", "/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/ok", "/dashboard")).toBe("/ok");
  });
});

describe("authErrorUrl", () => {
  it("appends auth_error with the right separator", () => {
    expect(authErrorUrl("/", "Nope")).toBe("/?auth_error=Nope");
    expect(authErrorUrl("/dashboard?tab=x", "Nope")).toBe("/dashboard?tab=x&auth_error=Nope");
  });

  it("encodes the message", () => {
    expect(authErrorUrl("/", "Sign-in was cancelled")).toBe("/?auth_error=Sign-in%20was%20cancelled");
  });
});
