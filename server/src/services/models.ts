import OpenAI from "openai";
import { ModelProbe, Settings } from "../types.js";
import { withRetry } from "./retry.js";

export async function probeModels(settings: Settings): Promise<ModelProbe> {
  const baseUrl = settings.openAiBaseUrl.replace(/\/$/, "");
  if (!baseUrl) {
    return { ok: false, baseUrl, models: [], error: "Base URL is required." };
  }

  try {
    const client = new OpenAI({
      apiKey: settings.openAiApiKey || "not-set",
      baseURL: baseUrl
    });
    const models = await withRetry(() => client.models.list());
    return {
      ok: true,
      baseUrl,
      models: models.data.map((model) => ({
        id: model.id,
        created: model.created,
        ownedBy: model.owned_by
      }))
    };
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      models: [],
      error: (error as Error).message
    };
  }
}
