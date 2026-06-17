import { AutomationTool, Settings } from "../types.js";
import { listMcpTools } from "./mcpClient.js";

export async function discoverAutomationTools(settings: Settings): Promise<AutomationTool[]> {
  const playwrightEnabled = settings.playwrightEnabled ?? true;
  const autoRegisterAutomationTools = settings.autoRegisterAutomationTools ?? true;
  const tools: AutomationTool[] = [];

  if ((settings.webclawEnabled ?? true) && settings.mcpStdioCommand.trim()) {
    try {
      const mcpTools = await listMcpTools(settings);
      tools.push(
        ...mcpTools.map((tool) => ({
          id: `mcp.${tool.name}`,
          label: tool.name,
          provider: "mcp-stdio" as const,
          enabled: autoRegisterAutomationTools,
          connected: true,
          description: tool.description ?? "Discovered from the configured stdio MCP server.",
          mcpName: tool.name,
          inputSchema: tool.inputSchema
        }))
      );
    } catch (error) {
      tools.push({
        id: "mcp.connection",
        label: "MCP stdio server",
        provider: "mcp-stdio",
        enabled: settings.webclawEnabled && autoRegisterAutomationTools,
        connected: false,
        description: `Could not connect to MCP stdio server: ${(error as Error).message}`
      });
    }
  }

  tools.push({
    id: "playwright.unsubscribe",
    label: "Playwright unsubscribe",
    provider: "playwright",
    enabled: playwrightEnabled && autoRegisterAutomationTools,
    connected: playwrightEnabled,
    description: "Local fallback browser automation for unsubscribe links when the MCP server is unavailable."
  });

  return tools;
}
