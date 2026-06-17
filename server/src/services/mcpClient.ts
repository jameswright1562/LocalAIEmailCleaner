import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Settings } from "../types.js";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type ActiveMcpClient = {
  key: string;
  client: Client;
};

let activeClient: ActiveMcpClient | undefined;

function parseArgs(args: string): string[] {
  if (!args.trim()) return [];
  const matches = args.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return matches.map((arg) => arg.replace(/^"|"$/g, ""));
}

function getMcpKey(settings: Settings): string {
  return JSON.stringify({
    command: settings.mcpStdioCommand.trim(),
    args: parseArgs(settings.mcpStdioArgs),
    cwd: settings.mcpStdioCwd.trim()
  });
}

function getServerParams(settings: Settings) {
  if (!settings.mcpStdioCommand.trim()) return undefined;
  return {
    command: settings.mcpStdioCommand.trim(),
    args: parseArgs(settings.mcpStdioArgs),
    cwd: settings.mcpStdioCwd.trim() || undefined,
    stderr: "pipe" as const
  };
}

export async function closeMcpClient(): Promise<void> {
  if (!activeClient) return;
  const closing = activeClient;
  activeClient = undefined;
  await closing.client.close().catch(() => undefined);
}

async function getConnectedClient(settings: Settings): Promise<Client> {
  const serverParams = getServerParams(settings);
  if (!serverParams) throw new Error("MCP stdio command is not configured.");

  const key = getMcpKey(settings);
  if (activeClient?.key === key) return activeClient.client;

  await closeMcpClient();

  const client = new Client({ name: "localai-email-cleaner", version: "0.1.0" });
  const transport = new StdioClientTransport(serverParams);
  await client.connect(transport, { timeout: 10000 });

  activeClient = { key, client };
  return client;
}

export async function listMcpTools(settings: Settings): Promise<McpTool[]> {
  const client = await getConnectedClient(settings);
  const result = await client.listTools({}, { timeout: 10000 });
  return result.tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema }));
}

export async function callMcpTool(settings: Settings, name: string, args: Record<string, unknown>) {
  const client = await getConnectedClient(settings);
  return client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
}
