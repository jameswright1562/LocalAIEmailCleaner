import { describe, expect, it } from "vitest";
import { computeRisk, extractUnsubscribeUrl } from "./gmail.js";

describe("extractUnsubscribeUrl", () => {
  it("prefers the first angle-bracketed URL", () => {
    expect(extractUnsubscribeUrl("<https://x.com/u>, <mailto:u@x.com>")).toBe("https://x.com/u");
  });

  it("falls back to a bare http value", () => {
    expect(extractUnsubscribeUrl("https://x.com/u, https://x.com/other")).toBe("https://x.com/u");
  });

  it("returns undefined when no URL is present", () => {
    expect(extractUnsubscribeUrl("")).toBeUndefined();
  });
});

describe("computeRisk", () => {
  it("flags sensitive/transactional mail as high", () => {
    expect(computeRisk("Security alert: verify your account", false)).toBe("high");
    expect(computeRisk("Your invoice is ready", false)).toBe("high");
  });

  it("flags marketing mail or anything with an unsubscribe link as medium", () => {
    expect(computeRisk("Huge sale 50% off this weekend", false)).toBe("medium");
    expect(computeRisk("Hello there", true)).toBe("medium");
  });

  it("defaults to low for ordinary mail", () => {
    expect(computeRisk("Lunch tomorrow?", false)).toBe("low");
  });
});
