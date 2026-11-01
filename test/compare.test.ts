import { describe, expect, it } from "vitest";
import { charges, maxSharesFor } from "../src/fees/engine";
import { followCommand } from "../src/flow/follow";
import type { Mandate } from "../src/mandate/schema";
import { compareStocks, roomUnderLimit } from "../src/market/compare";
import type { Quote } from "../src/market/quotes";

const quote = (symbol: string, name: string, bid: bigint | null, ask: bigint | null, last: bigint, prevClose = last): Quote => ({
  symbol, name, last, prevClose, bid, ask, bidVolume: null, askVolume: null, live: true, volume: 1200, quality: "LIVE", tradable: true,
});
const quotes = new Map([
  ["MTNGH", quote("MTNGH", "MTN Ghana", 320n, 325n, 325n, 300n)],
  ["GCB", quote("GCB", "GCB Bank", 3900n, 4586n, 4200n)],
  ["CAL", quote("CAL", "CalBank", null, 50n, 50n)],
]);
const mandate: Mandate = {
  goal: "House",
  horizon: "5+ years",
  risk: "balanced",
  monthlyContributionCedis: 500,
  maxPositionPercent: 30,
  maxOrderCedis: 1000,
  preferredSymbols: ["MTNGH"],
  excludedSymbols: ["CAL"],
  stopLossPercent: 15,
  takeProfitPercent: 20,
  neverSellAtLoss: false,
};

describe("roomUnderLimit", () => {
  it("doesn't apply before there are two holdings", () => {
    expect(roomUnderLimit("GCB", [], quotes, mandate)).toBeNull();
    expect(roomUnderLimit("GCB", [{ symbol: "GCB", shares: 10n, cost: 1n, source: "given" }], quotes, mandate)).toBeNull();
  });

  it("is the buy that brings the stock to exactly the limit", () => {
    // MTNGH worth 1000 × 320 = 320,000 pesewas; nothing in GCB yet. 30% → x = 0.3·320000 / 0.7.
    const holdings = [{ symbol: "MTNGH", shares: 1000n, cost: 1n, source: "given" as const }];
    const room = roomUnderLimit("GCB", holdings, quotes, mandate)!;
    expect(room).toBe(137_142n);
    expect(((room * 10_000n) / (320_000n + room)) <= 3_000n).toBe(true);
  });

  it("is zero when the stock is already over the limit", () => {
    const holdings = [
      { symbol: "MTNGH", shares: 1000n, cost: 1n, source: "given" as const },
      { symbol: "GCB", shares: 100n, cost: 1n, source: "given" as const },
    ];
    expect(roomUnderLimit("GCB", holdings, quotes, mandate)).toBe(0n);
  });
});

describe("compareStocks", () => {
  const [mtn, gcb, cal, bad] = compareStocks(["mtngh", "GCB", "CAL", "XYZ"], quotes, [], mandate, 50_000n) as Record<string, any>[];

  it("gives today's change and the spread, flagging wide ones", () => {
    expect(mtn!.changeToday).toBe("+8.33%");
    expect(mtn!.spread).toBe("1.53% of the ask");
    expect(gcb!.spread).toMatch(/^14\.95% of the ask \(wide/);
    expect(cal!.spread).toBe("no two-sided market right now");
  });

  it("shows how each fits the plan", () => {
    expect(mtn!.planFit).toMatchObject({ preferred: true, onNeverBuyList: false });
    expect(cal!.planFit).toMatchObject({ onNeverBuyList: true });
  });

  it("works out what the amount buys at the ask, charges included", () => {
    const shares = maxSharesFor(50_000n, 325n);
    expect(mtn!.forAmount.shares).toBe(shares.toString());
    expect(mtn!.forAmount.totalToPay).toBe(`GHS ${(Number(charges("BUY", shares, 325n).net) / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  });

  it("flags unknown tickers", () => {
    expect(bad).toEqual({ symbol: "XYZ", error: "not a GSE ticker" });
  });
});

describe("followCommand", () => {
  it("reads follow and unfollow with a ticker or a name", () => {
    expect(followCommand("follow GCB", quotes)).toEqual({ on: true, symbol: "GCB" });
    expect(followCommand("/follow mtn", quotes)).toEqual({ on: true, symbol: "MTNGH" });
    expect(followCommand("Unfollow calbank.", quotes)).toEqual({ on: false, symbol: "CAL" });
    expect(followCommand("/follow", quotes)).toEqual({ on: true, symbol: null });
    expect(followCommand("follow XYZQ", quotes)).toEqual({ on: true, symbol: null });
  });

  it("ignores longer sentences (the agent handles those)", () => {
    expect(followCommand("I want to follow GCB and MTN", quotes)).toBeNull();
    expect(followCommand("follow up on my order", quotes)).toBeNull();
  });
});
