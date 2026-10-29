import { toPesewas } from "../fees/engine";

/**
 * One GSE stock, from IC Securities' public market data (marketdata.ic.africa).
 * Prices are in pesewas. On the GSE the gap between buyers and sellers can be wide, so a trade
 * happens at the bid (selling) or the ask (buying), not at the last trade price.
 */
export interface Quote {
  symbol: string;
  name: string;
  /** Last trade price. */
  last: bigint;
  /** Yesterday's close, derived from today's % change. */
  prevClose: bigint;
  /** Best price a buyer is offering: what you'd get selling. Null when nobody is bidding. */
  bid: bigint | null;
  /** Best price a seller is asking: what you'd pay buying. Null when nobody is selling. */
  ask: bigint | null;
  /** Shares wanted at the bid / offered at the ask; null when unknown (snapshot only). */
  bidVolume: number | null;
  askVolume: number | null;
  /** Shares traded today. */
  volume: number;
  /** IC's own label for the snapshot: LIVE, DELAYED, STALE or OFFLINE. */
  quality: string;
  /** True once the bid/ask came from the live order book rather than the snapshot. */
  live: boolean;
  /** Set when the data is a replay of a recorded session (MARKET_MODE=replay), e.g. "2026-10-30 14:30:00". */
  recordedAt?: string;
  tradable: boolean;
}

const IC = "https://marketdata.ic.africa/api/v1/market-data";

interface IcInstrument {
  symbol: string;
  symbolName: string;
  lastTradePrice: number;
  percentChange: number;
  buyPrice: number;
  sellPrice: number;
  totalVolume: number;
  dataQuality: string;
  isTradable: boolean;
  isHalted: boolean;
}

export interface IcDepth {
  entries: { bidPrice: number; bidVolume: number; askPrice: number; askVolume: number }[];
}

function price(value: number, field: string, symbol: string): bigint {
  const pesewas = toPesewas(value.toFixed(2));
  if (pesewas === null) throw new Error(`Bad ${field} for ${symbol}: ${value}`);
  return pesewas;
}

/** IC reports "no price" as 0. */
const optional = (value: number, field: string, symbol: string) => (value > 0 ? price(value, field, symbol) : null);

export function parseIcFeed(body: unknown): Quote[] {
  if (!Array.isArray(body)) throw new Error("IC feed: expected an array");
  return (body as IcInstrument[])
    .filter((i) => typeof i?.symbol === "string" && typeof i.lastTradePrice === "number")
    .map((i) => {
      const last = price(i.lastTradePrice, "lastTradePrice", i.symbol);
      const change = Number.isFinite(i.percentChange) ? i.percentChange : 0;
      return {
        symbol: i.symbol,
        name: i.symbolName,
        last,
        prevClose: price(i.lastTradePrice / (1 + change / 100), "prevClose", i.symbol),
        bid: optional(i.buyPrice, "buyPrice", i.symbol),
        ask: optional(i.sellPrice, "sellPrice", i.symbol),
        bidVolume: null,
        askVolume: null,
        volume: i.totalVolume,
        quality: i.dataQuality,
        live: false,
        tradable: i.isTradable && !i.isHalted,
      };
    });
}

/** A recorded IC session: the snapshot plus order books for the most-traded stocks. */
export interface Tape {
  at: string;
  snapshot: unknown;
  depth: Record<string, IcDepth>;
}

let replay: Tape | null = null;

/** Switches this request to a recorded session (or back to live with null). */
export function useReplay(tape: Tape | null): void {
  replay = tape;
}

/** The raw IC snapshot, for recording. */
export async function fetchSnapshot(): Promise<unknown> {
  const res = await fetch(`${IC}/instruments?country=ghana`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`IC feed: HTTP ${res.status}`);
  return res.json();
}

export async function fetchDepth(symbol: string): Promise<IcDepth | null> {
  const res = await fetch(`${IC}/instruments/${encodeURIComponent(symbol)}/depth?levels=3`, { headers: { accept: "application/json" } });
  return res.ok ? ((await res.json()) as IcDepth) : null;
}

/** Every GSE stock in one request. The snapshot can lag; use withLiveBook before money moves. */
export async function fetchQuotes(): Promise<Quote[]> {
  if (replay) return parseIcFeed(replay.snapshot).map((q) => ({ ...q, recordedAt: replay!.at }));
  return parseIcFeed(await fetchSnapshot());
}

export function applyDepth(q: Quote, depth: IcDepth): Quote {
  const top = depth.entries?.[0];
  if (!top) return { ...q, bid: null, ask: null, bidVolume: 0, askVolume: 0, live: true };
  const bid = optional(top.bidPrice, "bidPrice", q.symbol);
  const ask = optional(top.askPrice, "askPrice", q.symbol);
  return { ...q, bid, ask, bidVolume: bid ? top.bidVolume : 0, askVolume: ask ? top.askVolume : 0, live: true };
}

/** Refreshes one stock's bid and ask from IC's live order book. Keeps the snapshot if the book can't be read. */
export async function withLiveBook(q: Quote): Promise<Quote> {
  if (replay) {
    const recorded = replay.depth[q.symbol];
    return recorded ? applyDepth(q, recorded) : q;
  }
  try {
    const depth = await fetchDepth(q.symbol);
    return depth ? applyDepth(q, depth) : q;
  } catch {
    return q;
  }
}

/** Refreshes the live order book for the given stocks in the map (a few requests; the snapshot can lag). */
export async function refreshLive(quotes: Map<string, Quote>, symbols: string[]): Promise<void> {
  const unique = [...new Set(symbols)].filter((s) => quotes.has(s) && !quotes.get(s)!.live).slice(0, 15);
  const fresh = await Promise.all(unique.map((s) => withLiveBook(quotes.get(s)!)));
  for (const q of fresh) quotes.set(q.symbol, q);
}

/** The price you could actually sell at now: the bid, or the last trade when nobody is bidding. */
export const markPrice = (q: Quote) => q.bid ?? q.last;
