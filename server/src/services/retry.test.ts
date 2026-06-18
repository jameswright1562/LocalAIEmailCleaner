import { describe, expect, it, vi } from "vitest";
import { isRetryableError, withRetry } from "./retry.js";

describe("isRetryableError", () => {
  it("treats transient HTTP status codes as retryable", () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ response: { status: 500 } })).toBe(true);
  });

  it("treats client errors and unknown errors as non-retryable", () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError(new Error("boom"))).toBe(false);
  });

  it("treats transient network codes as retryable", () => {
    expect(isRetryableError({ code: "ECONNRESET" })).toBe(true);
    expect(isRetryableError({ code: "ENOTFOUND" })).toBe(true);
    expect(isRetryableError({ code: "EACCES" })).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns immediately on success without retrying", async () => {
    const operation = vi.fn(async () => "ok");
    await expect(withRetry(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries retryable failures then succeeds", async () => {
    let attempts = 0;
    const operation = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) throw { status: 503 };
      return "recovered";
    });
    await expect(withRetry(operation, { baseDelayMs: 1, maxDelayMs: 2 })).resolves.toBe("recovered");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable failures", async () => {
    const operation = vi.fn(async () => {
      throw { status: 400, message: "bad request" };
    });
    await expect(withRetry(operation, { baseDelayMs: 1 })).rejects.toMatchObject({ status: 400 });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
