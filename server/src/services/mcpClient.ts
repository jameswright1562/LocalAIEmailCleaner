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

export function parseMcpArgs(args: string): string[] {
  const values: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaping = false;
  let hasToken = false;

  for (const char of args.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      hasToken = true;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else {
        current += char;
        hasToken = true;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        values.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }

  if (escaping) current += "\\";
  if (hasToken || current) values.push(current);
  return values;
}

function getMcpKey(settings: Settings): string {
  return JSON.stringify({
    command: settings.mcpStdioCommand.trim(),
    args: parseMcpArgs(settings.mcpStdioArgs),
    cwd: settings.mcpStdioCwd.trim()
  });
}

function getServerParams(settings: Settings) {
  if (!settings.mcpStdioCommand.trim()) return undefined;
  return {
    command: settings.mcpStdioCommand.trim(),
    args: parseMcpArgs(settings.mcpStdioArgs),
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
