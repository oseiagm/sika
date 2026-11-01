import { metaClient } from "../agent/meta";
import { Db } from "../db";
import type { Env } from "../index";
import { warmProfiles } from "./profile";
import { fetchQuotes } from "./quotes";

/** How many of the day's most traded stocks to keep fresh, besides everything held or followed. */
const TOP_TRADED = 10;

/**
 * Weekday mornings and midday: refreshes company facts (sector, dividends, results, news) for every
 * stock someone holds or follows and the most traded ones, so comparisons answer from the cache
 * instead of making the investor wait for web searches.
 */
export async function warmCompanyFacts(env: Env): Promise<{ refreshed: number; failed: number }> {
  const db = new Db(env.DB);
  const quotes = await fetchQuotes();
  const names = new Map(quotes.map((q) => [q.symbol, q.name]));
  const value = (q: (typeof quotes)[number]) => q.valueTraded ?? q.last * BigInt(q.volume);
  const top = [...quotes].sort((a, b) => Number(value(b) - value(a))).slice(0, TOP_TRADED).map((q) => q.symbol);
  const symbols = [...new Set([...(await db.watchedSymbols()), ...top])].filter((s) => names.has(s));
  const result = await warmProfiles(metaClient(env.MODEL_API_KEY), env.META_MODEL, db.profiles(), symbols.map((symbol) => ({ symbol, name: names.get(symbol)! })));
  console.log("company facts warmed", { stocks: symbols.length, ...result });
  return result;
}
