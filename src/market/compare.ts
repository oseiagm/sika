import { charges, ghs, maxSharesFor, percent } from "../fees/engine";
import type { Mandate } from "../mandate/schema";
import type { Holding } from "../portfolio/holdings";
import { value } from "../portfolio/holdings";
import { markPrice, type Quote } from "./quotes";

/** Spreads wider than this (as a share of the ask) are flagged: buying and selling straight back loses that much. */
export const WIDE_SPREAD_BPS = 500n;

const signed = (bps: bigint) => (bps < 0n ? `-${percent(-bps)}` : `+${percent(bps)}`);

/**
 * The most a new buy (gross, before charges) can add to a stock before it passes the plan's per-stock
 * limit, valued like the rules engine does (best bid, or last trade). Null when the limit doesn't apply yet
 * (fewer than two holdings after the buy) or there is no plan.
 */
export function roomUnderLimit(symbol: string, holdings: Holding[], quotes: Map<string, Quote>, m: Mandate | null): bigint | null {
  if (!m) return null;
  const others = holdings.filter((h) => h.symbol !== symbol);
  if (others.length === 0) return null;
  const mv = (h: Holding) => {
    const q = quotes.get(h.symbol);
    return h.shares * (q ? markPrice(q) : 0n);
  };
  const held = holdings.find((h) => h.symbol === symbol);
  const position = held ? mv(held) : 0n;
  const total = others.reduce((s, h) => s + mv(h), 0n) + position;
  const p = BigInt(m.maxPositionPercent);
  if (p >= 100n) return null;
  // (position + x) / (total + x) <= p/100  →  x <= (p·total − 100·position) / (100 − p)
  const room = (p * total - 100n * position) / (100n - p);
  return room > 0n ? room : 0n;
}

export function compareStocks(
  symbols: string[],
  quotes: Map<string, Quote>,
  holdings: Holding[],
  mandate: Mandate | null,
  amount: bigint | null,
): unknown[] {
  return symbols.map((raw) => {
    const symbol = raw.toUpperCase();
    const q = quotes.get(symbol);
    if (!q) return { symbol: raw, error: "not a GSE ticker" };

    const changeBps = q.prevClose > 0n ? ((q.last - q.prevClose) * 10_000n) / q.prevClose : 0n;
    const spreadBps = q.bid !== null && q.ask !== null && q.ask > 0n ? ((q.ask - q.bid) * 10_000n) / q.ask : null;
    const held = holdings.find((h) => h.symbol === symbol);
    const room = roomUnderLimit(symbol, holdings, quotes, mandate);

    let forAmount: Record<string, string> | undefined;
    if (amount !== null) {
      if (q.ask === null) forAmount = { result: "nobody is selling right now" };
      else {
        const shares = maxSharesFor(amount, q.ask);
        if (shares === 0n) forAmount = { result: `${ghs(amount)} doesn't buy one share after charges` };
        else {
          const c = charges("BUY", shares, q.ask);
          forAmount = { shares: shares.toString(), atAsk: ghs(q.ask), totalCharges: ghs(c.total), totalToPay: ghs(c.net), tier: `${percent(c.allInBps)} all-in` };
        }
      }
    }

    let holding: Record<string, string> | undefined;
    if (held) {
      const v = value(held, q);
      holding = { shares: held.shares.toString(), cost: ghs(v.cost), netIfSoldNow: ghs(v.netIfSold), profitAfterFees: `${ghs(v.profit < 0n ? -v.profit : v.profit)} ${v.profit < 0n ? "loss" : "gain"} (${signed(v.profitBps)})` };
    }

    return {
      symbol,
      name: q.name,
      bestBid: q.bid !== null ? ghs(q.bid) : "no buyers",
      bestAsk: q.ask !== null ? ghs(q.ask) : "no sellers",
      lastTrade: ghs(q.last),
      changeToday: signed(changeBps),
      spread: spreadBps === null ? "no two-sided market right now" : `${percent(spreadBps)} of the ask${spreadBps > WIDE_SPREAD_BPS ? " (wide: buying and selling back straight away loses about this much)" : ""}`,
      sharesTradedToday: q.volume,
      tradable: q.tradable,
      planFit: mandate
        ? {
            onNeverBuyList: mandate.excludedSymbols.includes(symbol),
            preferred: mandate.preferredSymbols.includes(symbol),
            roomUnderPerStockLimit: room === null ? `no per-stock limit until you own two or more stocks` : `${ghs(room)} more before it passes your ${mandate.maxPositionPercent}% limit`,
            maxPerOrder: ghs(BigInt(Math.round(mandate.maxOrderCedis * 100))),
          }
        : "no plan yet",
      ...(holding ? { yourHolding: holding } : {}),
      ...(forAmount ? { forAmount } : {}),
      source: q.recordedAt ? `IC order book recorded ${q.recordedAt.slice(0, 16)} GMT (replay)` : q.live ? "IC live order book" : `IC snapshot (${q.quality.toLowerCase()})`,
    };
  });
}
