import { ghs } from "../fees/engine";
import type { Quote } from "./quotes";

/**
 * How liquid a stock really is, from data Sika already has: today's trades, the live order book, and
 * the IC snapshots recorded every 30 minutes during GSE hours (the last ~60, about five sessions).
 * All exact; nothing here comes from the web.
 */

interface Instrument {
  symbol?: string;
  totalVolume?: number;
  totalTrades?: number;
  valueTraded?: number;
}

export interface SessionActivity {
  /** Sessions Sika recorded, and in how many of them the stock traded at all. */
  sessions: number;
  tradedSessions: number;
  /** Average value traded per recorded session, in pesewas. */
  avgValueTraded: bigint;
}

/** Each recorded session's closing snapshot (the last one of each day) → how often and how much the stock traded. */
export function sessionActivity(tapes: { at: string; snapshot: unknown }[], symbol: string): SessionActivity | null {
  const lastOfDay = new Map<string, unknown>();
  for (const t of [...tapes].sort((a, b) => a.at.localeCompare(b.at))) lastOfDay.set(t.at.slice(0, 10), t.snapshot);
  let sessions = 0;
  let traded = 0;
  let value = 0;
  for (const snapshot of lastOfDay.values()) {
    if (!Array.isArray(snapshot)) continue;
    const i = (snapshot as Instrument[]).find((x) => x?.symbol === symbol);
    if (!i) continue;
    sessions++;
    if ((i.totalVolume ?? 0) > 0) traded++;
    value += i.valueTraded ?? 0;
  }
  if (sessions === 0) return null;
  return { sessions, tradedSessions: traded, avgValueTraded: BigInt(Math.round((value / sessions) * 100)) };
}

/**
 * Whether an amount could be bought at the best price, or how far up the book it would reach.
 * Uses the live order book's top levels; null when the book hasn't been read.
 */
export function fillFor(q: Quote, cash: bigint): { atBestPrice: boolean; sharesAtBest: number; worstPrice: bigint | null; shortBy: bigint } | null {
  if (!q.levels?.length) return null;
  let left = cash;
  let worst: bigint | null = null;
  for (const l of q.levels) {
    if (l.ask === null || l.askVolume <= 0) continue;
    const levelCost = l.ask * BigInt(l.askVolume);
    worst = l.ask;
    if (levelCost >= left) return { atBestPrice: l === q.levels[0], sharesAtBest: q.levels[0]?.askVolume ?? 0, worstPrice: worst, shortBy: 0n };
    left -= levelCost;
  }
  return { atBestPrice: false, sharesAtBest: q.levels[0]?.askVolume ?? 0, worstPrice: worst, shortBy: left };
}

/** Plain-language liquidity for the comparison. */
export function liquidity(q: Quote, activity: SessionActivity | null, amount: bigint | null): Record<string, string> {
  const out: Record<string, string> = {};
  out.today = `${q.trades ?? "?"} trades, ${q.volume.toLocaleString("en-GH")} shares${q.valueTraded !== undefined ? `, ${ghs(q.valueTraded)} traded` : ""}`;
  if (activity) out.recentSessions = `traded in ${activity.tradedSessions} of the last ${activity.sessions} sessions Sika recorded, about ${ghs(activity.avgValueTraded)} a session`;
  if (q.levels?.length) {
    const bids = q.levels.reduce((s, l) => s + (l.bid ? l.bid * BigInt(l.bidVolume) : 0n), 0n);
    const asks = q.levels.reduce((s, l) => s + (l.ask ? l.ask * BigInt(l.askVolume) : 0n), 0n);
    out.orderBook = `top ${q.levels.length} levels: ${ghs(bids)} of buy orders, ${ghs(asks)} of sell orders`;
  }
  if (amount !== null) {
    const f = fillFor(q, amount);
    if (f) {
      out.forYourAmount = f.shortBy > 0n
        ? `not enough on offer: the top levels are ${ghs(f.shortBy)} short of ${ghs(amount)}`
        : f.atBestPrice
          ? `${ghs(amount)} fills at the best price`
          : `${ghs(amount)} would reach up to ${ghs(f.worstPrice!)} a share, above the best price`;
    }
  }
  return out;
}
