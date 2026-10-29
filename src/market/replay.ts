import { Db } from "../db";
import type { Env } from "../index";
import { fetchDepth, fetchSnapshot, parseIcFeed, useReplay } from "./quotes";

/** Call at the start of each request: live IC data normally, the last recorded session when MARKET_MODE=replay. */
export async function prepareMarket(env: Env): Promise<void> {
  useReplay(env.MARKET_MODE === "replay" ? await new Db(env.DB).latestTape() : null);
}

/** During GSE hours: records IC's snapshot and the order books of the 15 most-traded stocks. */
export async function recordTape(env: Env): Promise<void> {
  const snapshot = await fetchSnapshot();
  const top = parseIcFeed(snapshot)
    .sort((a, b) => Number(b.last) * b.volume - Number(a.last) * a.volume)
    .slice(0, 15);
  const depth: Record<string, unknown> = {};
  for (const q of top) {
    const d = await fetchDepth(q.symbol);
    if (d) depth[q.symbol] = d;
  }
  await new Db(env.DB).saveTape(snapshot, depth);
}
