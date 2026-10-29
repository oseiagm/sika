import { charges, lowestSellPrice, toPesewas } from "../fees/engine";
import { markPrice, type Quote } from "../market/quotes";

/** What the user told us, as the model extracted it. Exactly one of the cost fields, or neither. */
export interface HoldingInput {
  symbol: string;
  shares: number;
  pricePaidCedis?: number | null;
  totalPaidCedis?: number | null;
}

export interface Holding {
  symbol: string;
  shares: bigint;
  /** All-in cost in pesewas, buy charges included. */
  cost: bigint;
  source: "given" | "estimate";
}

export type Costed = { ok: true; holding: Holding; note?: string } | { ok: false; error: string };

/**
 * Turns a stated holding into an all-in cost.
 * - total paid: taken as the all-in amount
 * - price per share: price plus IC buy charges
 * - unknown: today's price plus buy charges, labelled an estimate
 */
export function costHolding(input: HoldingInput, quotes: Map<string, Quote>): Costed {
  const symbol = input.symbol.toUpperCase();
  const quote = quotes.get(symbol);
  if (!quote) return { ok: false, error: `${symbol} is not a GSE ticker I know` };
  if (!Number.isInteger(input.shares) || input.shares <= 0) return { ok: false, error: `${symbol}: shares must be a whole number above 0` };
  const shares = BigInt(input.shares);

  if (input.totalPaidCedis != null) {
    const cost = toPesewas(input.totalPaidCedis.toFixed(2));
    if (!cost || cost <= 0n) return { ok: false, error: `${symbol}: total paid must be above 0` };
    return { ok: true, holding: { symbol, shares, cost, source: "given" } };
  }
  if (input.pricePaidCedis != null) {
    const price = toPesewas(input.pricePaidCedis.toFixed(2));
    if (!price || price <= 0n) return { ok: false, error: `${symbol}: price paid must be above 0` };
    return { ok: true, holding: { symbol, shares, cost: charges("BUY", shares, price).net, source: "given" } };
  }
  return {
    ok: true,
    holding: { symbol, shares, cost: charges("BUY", shares, quote.last).net, source: "estimate" },
    note: "cost unknown: estimated from today's price plus buy charges",
  };
}

export interface Valuation {
  symbol: string;
  name: string;
  shares: bigint;
  cost: bigint;
  source: Holding["source"];
  /** The price used: the best bid, or the last trade when nobody is bidding. */
  price: bigint;
  basis: "bid" | "last";
  /** What selling everything at that price would return after charges. */
  netIfSold: bigint;
  profit: bigint;
  /** Profit as basis points of cost. */
  profitBps: bigint;
  breakEven: bigint;
}

export function value(h: Holding, quote: Quote): Valuation {
  const price = markPrice(quote);
  const netIfSold = charges("SELL", h.shares, price).net;
  const profit = netIfSold - h.cost;
  return {
    symbol: h.symbol,
    name: quote.name,
    shares: h.shares,
    cost: h.cost,
    source: h.source,
    price,
    basis: quote.bid !== null ? "bid" : "last",
    netIfSold,
    profit,
    profitBps: (profit * 10_000n) / h.cost,
    breakEven: lowestSellPrice(h.shares, h.cost),
  };
}
