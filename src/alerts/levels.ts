import { ghs, lowestSellPrice } from "../fees/engine";
import type { Mandate } from "../mandate/schema";
import { markPrice, type Quote } from "../market/quotes";
import type { Holding } from "../portfolio/holdings";
import { value } from "../portfolio/holdings";

export interface Levels {
  symbol: string;
  /** Lowest price at which selling everything makes the take-profit % after charges. */
  takeProfitPrice: bigint | null;
  /** Below this price the holding is down the stop-loss % after charges. */
  stopLossPrice: bigint | null;
}

/** Required net proceeds for a % change on cost, rounded up to the pesewa. */
function requiredNet(cost: bigint, percent: number): bigint {
  const hundredths = BigInt(Math.round(percent * 100));
  return (cost * (10_000n + hundredths) + 9_999n) / 10_000n;
}

export function levels(h: Holding, m: Mandate): Levels {
  return {
    symbol: h.symbol,
    takeProfitPrice: m.takeProfitPercent ? lowestSellPrice(h.shares, requiredNet(h.cost, m.takeProfitPercent)) : null,
    stopLossPrice:
      m.stopLossPercent && !m.neverSellAtLoss ? lowestSellPrice(h.shares, requiredNet(h.cost, -m.stopLossPercent)) : null,
  };
}

/** price is the best bid (or the last trade when nobody is bidding). */
export type Trigger = { kind: "take_profit" | "stop_loss"; symbol: string; level: bigint; price: bigint; basis: "bid" | "last"; profitBps: bigint };

/** Which alert, if any, the last price triggers for this holding. */
export function triggered(h: Holding, quote: Quote, m: Mandate): Trigger | null {
  const l = levels(h, m);
  const v = value(h, quote);
  const price = markPrice(quote);
  if (l.takeProfitPrice !== null && price >= l.takeProfitPrice) {
    return { kind: "take_profit", symbol: h.symbol, level: l.takeProfitPrice, price, basis: v.basis, profitBps: v.profitBps };
  }
  if (l.stopLossPrice !== null && price < l.stopLossPrice) {
    return { kind: "stop_loss", symbol: h.symbol, level: l.stopLossPrice, price, basis: v.basis, profitBps: v.profitBps };
  }
  return null;
}

export function alertsCard(holdings: Holding[], m: Mandate | null, quotes: Map<string, Quote>): string {
  if (!m) return "Set up your plan first, then I'll watch your holdings for you.";
  if (!m.takeProfitPercent && !(m.stopLossPercent && !m.neverSellAtLoss)) {
    return "Your plan has no take-profit or stop-loss level, so there are no alerts. Tap *Change take profit* to add one.";
  }
  if (holdings.length === 0) return "You have no holdings to watch yet.";
  const lines = ["*Your alerts* (after all charges)", ""];
  for (const h of holdings) {
    const l = levels(h, m);
    const q = quotes.get(h.symbol);
    lines.push(`*${h.symbol}*${q ? (q.bid ? ` · buyers now at ${ghs(q.bid)}` : ` · no buyers now (last trade ${ghs(q.last)})`) : ""}`);
    if (l.takeProfitPrice) lines.push(`  Take profit (+${m.takeProfitPercent}%): at ${ghs(l.takeProfitPrice)} or more`);
    if (l.stopLossPrice) lines.push(`  Stop loss (-${m.stopLossPercent}%): below ${ghs(l.stopLossPrice)}`);
  }
  lines.push("", "I check the best buyer's price every 30 minutes while the GSE is open and tell you when a level is reached, with what selling would bring in after charges.");
  if (m.neverSellAtLoss) lines.push("Stop loss is off because your plan says never sell at a loss.");
  return lines.join("\n");
}
