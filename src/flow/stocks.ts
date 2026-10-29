import type OpenAI from "openai";
import type { Quote } from "../market/quotes";

/** "I like MTN and the banks, never oil companies" → tickers to favour and to exclude, checked against the GSE list. */
export async function extractStocks(
  meta: OpenAI,
  model: string,
  text: string,
  quotes: Map<string, Quote>,
): Promise<{ like: string[]; avoid: string[] } | null> {
  const list = [...quotes.values()].map((q) => `${q.symbol}=${q.name}`).join("; ");
  const res = await meta.chat.completions.create({
    model,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content:
          "Map an investor's stock preferences to Ghana Stock Exchange tickers. Answer with JSON only: " +
          '{"like":["TICKER"],"avoid":["TICKER"]}. Sectors (e.g. "the banks") mean every listed company in that sector. ' +
          `Use only tickers from this list: ${list}`,
      },
      { role: "user", content: text },
    ],
  });
  const raw = res.choices[0]?.message.content ?? "";
  try {
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { like?: unknown; avoid?: unknown };
    const keep = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).map((s) => s.toUpperCase()).filter((s) => quotes.has(s)))].slice(0, 20) : []);
    const like = keep(parsed.like);
    const avoid = keep(parsed.avoid).filter((s) => !like.includes(s));
    return like.length || avoid.length ? { like, avoid } : null;
  } catch {
    return null;
  }
}
