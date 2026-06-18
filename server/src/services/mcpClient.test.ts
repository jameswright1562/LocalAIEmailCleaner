import { describe, expect, it } from "vitest";
import { parseMcpArgs } from "./mcpClient.js";

describe("parseMcpArgs", () => {
  it("splits whitespace-delimited arguments", () => {
    expect(parseMcpArgs("--host 127.0.0.1 --port 8787")).toEqual(["--host", "127.0.0.1", "--port", "8787"]);
  });

  it("preserves quoted values", () => {
    expect(parseMcpArgs('--name "Local AI Cleaner" --cwd \'/tmp/local ai\'')).toEqual([
      "--name",
      "Local AI Cleaner",
      "--cwd",
      "/tmp/local ai"
    ]);
  });

  it("keeps a trailing escaped slash", () => {
    expect(parseMcpArgs("tool\\\\")).toEqual(["tool\\"]);
  });

  it("preserves empty quoted values", () => {
    expect(parseMcpArgs('--optional "" --name value')).toEqual(["--optional", "", "--name", "value"]);
  });
});
