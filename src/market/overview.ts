import { ghs, percent } from "../fees/engine";
import type { Quote } from "./quotes";

/** Today's change against yesterday's close, in basis points. */
export const changeBps = (q: Quote) => (q.prevClose > 0n ? ((q.last - q.prevClose) * 10_000n) / q.prevClose : 0n);
const signed = (bps: bigint) => (bps < 0n ? `-${percent(-bps)}` : `+${percent(bps)}`);

/**
 * The whole GSE today, from IC's snapshot: what moved, what traded, and how broad the move was.
 * Exact figures only. Thin stocks can jump on one small trade, so movers only count stocks that traded.
 */
export function marketOverview(quotes: Iterable<Quote>, top = 3) {
  const all = [...quotes];
  const traded = all.filter((q) => q.volume > 0);
  const byChange = [...traded].sort((a, b) => Number(changeBps(b) - changeBps(a)));
  const line = (q: Quote) => `${q.symbol} (${q.name}): ${ghs(q.last)}, ${signed(changeBps(q))}`;
  const value = (q: Quote) => q.valueTraded ?? q.last * BigInt(q.volume);
  const totalValue = traded.reduce((s, q) => s + value(q), 0n);
  const up = traded.filter((q) => changeBps(q) > 0n).length;
  const down = traded.filter((q) => changeBps(q) < 0n).length;
  return {
    stocksListed: all.length,
    tradedToday: traded.length,
    breadth: `${up} up, ${down} down, ${traded.length - up - down} unchanged among stocks that traded; ${all.length - traded.length} didn't trade`,
    totalValueTraded: ghs(totalValue),
    gainers: byChange.filter((q) => changeBps(q) > 0n).slice(0, top).map(line),
    losers: byChange.filter((q) => changeBps(q) < 0n).reverse().slice(0, top).map(line),
    mostTraded: [...traded].sort((a, b) => Number(value(b) - value(a))).slice(0, top).map((q) => `${q.symbol}: ${ghs(value(q))} (${q.volume.toLocaleString("en-GH")} shares${q.trades !== undefined ? `, ${q.trades} trades` : ""})`),
    source: all.some((q) => q.recordedAt) ? `IC snapshot recorded ${all.find((q) => q.recordedAt)!.recordedAt!.slice(0, 16)} GMT (replay)` : `IC snapshot (${all[0]?.quality.toLowerCase() ?? "unknown"})`,
  };
}
