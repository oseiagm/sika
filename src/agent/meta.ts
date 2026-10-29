import OpenAI from "openai";

/** Meta Model API speaks the OpenAI wire format. */
export function metaClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: "https://api.meta.ai/v1" });
}
