import { chromium } from "playwright";
import { AutomationTool, Settings } from "../types.js";
import { callMcpTool } from "./mcpClient.js";

export async function unsubscribeFromUrl(
  settings: Settings,
  url: string,
  tools: AutomationTool[] = []
): Promise<{ ok: boolean; method: "webclaw-mcp" | "playwright" | "skipped"; note: string }> {
  if (!url) return { ok: false, method: "skipped", note: "No unsubscribe URL was available." };

  const mcpTool = tools.find((tool) => tool.provider === "mcp-stdio" && tool.enabled && tool.connected && tool.mcpName);
  const playwright = tools.find((tool) => tool.id === "playwright.unsubscribe");

  if (mcpTool?.mcpName) {
    try {
      const result = await callMcpTool(settings, mcpTool.mcpName, {
        url,
        instruction:
          "Open the unsubscribe link, decline offers, confirm full unsubscribe, and return the final status text."
      });
      return { ok: true, method: "webclaw-mcp", note: JSON.stringify(result) };
    } catch {
      // Fall through to Playwright.
    }
  }

  if (!playwright?.enabled || !playwright.connected) {
    return { ok: false, method: "skipped", note: "No enabled browser automation tool is connected." };
  }

  if (settings.dryRun) {
    return { ok: true, method: "playwright", note: `Dry run: would unsubscribe at ${url}` };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const button = page
      .getByRole("button", { name: /unsubscribe|confirm|submit|remove me/i })
      .or(page.getByRole("link", { name: /unsubscribe|confirm|remove me/i }))
      .first();
    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
      await button.click();
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    }
    return { ok: true, method: "playwright", note: `Visited ${page.url()} and attempted confirmation.` };
  } finally {
    await browser.close();
  }
}
