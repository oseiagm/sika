import { describe, expect, it } from "vitest";
import { charges } from "../src/fees/engine";
import { Mandate } from "../src/mandate/schema";
import type { Quote } from "../src/market/quotes";
import { costHolding, value } from "../src/portfolio/holdings";

const quote = (symbol: string, last: bigint): Quote => ({ symbol, name: symbol, last, prevClose: last, bid: last, ask: last, bidVolume: null, askVolume: null, live: true, volume: 1000, quality: "DELAYED", tradable: true });
const quotes = new Map([["MTNGH", quote("MTNGH", 325n)], ["GCB", quote("GCB", 700n)]]);

describe("costHolding", () => {
  it("adds buy charges to a price per share", () => {
    const r = costHolding({ symbol: "mtngh", shares: 125, pricePaidCedis: 6.5 }, quotes);
    expect(r).toEqual({ ok: true, holding: { symbol: "MTNGH", shares: 125n, cost: 83_078n, source: "given" } });
  });

  it("takes a total paid as the all-in cost", () => {
    const r = costHolding({ symbol: "GCB", shares: 400, totalPaidCedis: 3000 }, quotes);
    expect(r.ok && r.holding.cost).toBe(300_000n);
  });

  it("estimates an unknown cost from today's price and labels it", () => {
    const r = costHolding({ symbol: "GCB", shares: 100 }, quotes);
    expect(r.ok && r.holding).toEqual({ symbol: "GCB", shares: 100n, cost: charges("BUY", 100n, 700n).net, source: "estimate" });
  });

  it("rejects unknown tickers and bad share counts", () => {
    expect(costHolding({ symbol: "XYZ", shares: 1 }, quotes).ok).toBe(false);
    expect(costHolding({ symbol: "GCB", shares: 1.5 }, quotes).ok).toBe(false);
  });
});

describe("value", () => {
  it("a holding bought today at the same price shows a loss of both sides' charges", () => {
    const cost = charges("BUY", 100n, 700n).net;
    const v = value({ symbol: "GCB", shares: 100n, cost, source: "estimate" }, quotes.get("GCB")!);
    expect(v.profit).toBe(charges("SELL", 100n, 700n).net - cost);
    expect(v.profit).toBeLessThan(0n);
    expect(v.breakEven).toBeGreaterThan(700n);
  });
});

describe("Mandate", () => {
  it("accepts a typical mandate and refuses a bad ticker", () => {
    const m = {
      goal: "Grow money for a house",
      horizon: "5+ years",
      risk: "balanced",
      monthlyContributionCedis: 500,
      maxPositionPercent: 30,
      maxOrderCedis: 1000,
      preferredSymbols: ["MTNGH", "GCB"],
      excludedSymbols: [],
      stopLossPercent: null,
      takeProfitPercent: 20,
      neverSellAtLoss: true,
    };
    expect(Mandate.safeParse(m).success).toBe(true);
    expect(Mandate.safeParse({ ...m, preferredSymbols: ["mtn ghana"] }).success).toBe(false);
  });
});
