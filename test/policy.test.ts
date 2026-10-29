import { describe, expect, it } from "vitest";
import { charges } from "../src/fees/engine";
import type { Mandate } from "../src/mandate/schema";
import type { Quote } from "../src/market/quotes";
import { check, type PolicyContext } from "../src/policy/check";

const quote = (symbol: string, last: bigint, volume = 10_000, quality = "DELAYED"): Quote => ({
  symbol,
  name: symbol,
  last,
  prevClose: last,
  bid: last,
  ask: last,
  bidVolume: volume,
  askVolume: volume,
  volume,
  quality,
  live: false,
  tradable: true,
});

const mandate: Mandate = {
  goal: "Retirement",
  horizon: "5+ years",
  risk: "balanced",
  monthlyContributionCedis: 500,
  maxPositionPercent: 30,
  maxOrderCedis: 1000,
  preferredSymbols: ["MTNGH", "GCB"],
  excludedSymbols: ["TOTAL"],
  stopLossPercent: null,
  takeProfitPercent: 25,
  neverSellAtLoss: true,
};

const quotes = new Map([
  ["MTNGH", quote("MTNGH", 674n)],
  ["GCB", quote("GCB", 700n)],
  ["EGH", quote("EGH", 3_900n, 100)],
  ["TOTAL", quote("TOTAL", 3_000n)],
]);

const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  mandate,
  mandateConfirmed: true,
  holdings: [
    { symbol: "MTNGH", shares: 200n, cost: 36_900n, source: "given" },
    { symbol: "GCB", shares: 450n, cost: 300_000n, source: "given" },
    { symbol: "EGH", shares: 50n, cost: 199_390n, source: "estimate" },
  ],
  quotes,
  boughtThisMonth: 0n,
  ...over,
});

const rules = (v: ReturnType<typeof check>) => v.violations.map((f) => f.rule);

describe("policy", () => {
  it("passes a buy inside every limit", () => {
    const v = check({ side: "BUY", symbol: "MTNGH", shares: 72n, price: 674n }, ctx());
    expect(v.ok).toBe(true);
    expect(v.passed).toEqual(expect.arrayContaining(["max per order", "monthly budget", "max in one stock", "not excluded"]));
    expect(v.preview?.net).toBe(charges("BUY", 72n, 674n).net);
  });

  it("needs a confirmed mandate", () => {
    expect(rules(check({ side: "BUY", symbol: "MTNGH", shares: 1n, price: 674n }, ctx({ mandateConfirmed: false })))).toContain("mandate");
  });

  it("blocks excluded stocks", () => {
    expect(rules(check({ side: "BUY", symbol: "TOTAL", shares: 1n, price: 3_000n }, ctx()))).toContain("not excluded");
  });

  it("blocks orders above the per-order limit", () => {
    expect(rules(check({ side: "BUY", symbol: "MTNGH", shares: 200n, price: 674n }, ctx()))).toContain("max per order");
  });

  it("blocks spending past the monthly budget", () => {
    const v = check({ side: "BUY", symbol: "MTNGH", shares: 72n, price: 674n }, ctx({ boughtThisMonth: 10_000n }));
    expect(rules(v)).toEqual(["monthly budget"]);
  });

  it("blocks a buy that makes one stock too large a share of the portfolio", () => {
    const small = ctx({
      holdings: [
        { symbol: "MTNGH", shares: 10n, cost: 7_000n, source: "given" },
        { symbol: "GCB", shares: 10n, cost: 7_000n, source: "given" },
      ],
    });
    expect(rules(check({ side: "BUY", symbol: "MTNGH", shares: 70n, price: 674n }, small))).toContain("max in one stock");
  });

  it("only warns about concentration for a first holding", () => {
    const v = check({ side: "BUY", symbol: "MTNGH", shares: 70n, price: 674n }, ctx({ holdings: [] }));
    expect(v.ok).toBe(true);
    expect(v.warnings.map((w) => w.rule)).toContain("max in one stock");
  });

  it("refuses to sell more than is held", () => {
    expect(rules(check({ side: "SELL", symbol: "MTNGH", shares: 201n, price: 674n }, ctx()))).toContain("shares held");
  });

  it("refuses a sale at a loss when the mandate says never", () => {
    expect(rules(check({ side: "SELL", symbol: "EGH", shares: 50n, price: 3_900n }, ctx()))).toContain("never sell at a loss");
  });

  it("allows a profitable sale", () => {
    expect(check({ side: "SELL", symbol: "MTNGH", shares: 100n, price: 674n }, ctx()).ok).toBe(true);
  });

  it("blocks a buy with no sellers and a sale with no buyers", () => {
    const empty = new Map(quotes).set("MTNGH", { ...quote("MTNGH", 674n), bid: null, ask: null });
    expect(rules(check({ side: "BUY", symbol: "MTNGH", shares: 1n, price: 0n }, ctx({ quotes: empty })))).toContain("someone to trade with");
    expect(rules(check({ side: "SELL", symbol: "MTNGH", shares: 1n, price: 0n }, ctx({ quotes: empty })))).toContain("someone to trade with");
  });

  it("warns about thin trading and stale prices without blocking", () => {
    const stale = new Map(quotes).set("GCB", quote("GCB", 700n, 5, "STALE"));
    const v = check({ side: "BUY", symbol: "GCB", shares: 10n, price: 700n }, ctx({ quotes: stale }));
    expect(v.warnings.map((w) => w.rule)).toEqual(expect.arrayContaining(["price freshness", "liquidity"]));
  });
});
