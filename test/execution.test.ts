import { describe, expect, it } from "vitest";
import { charges } from "../src/fees/engine";
import { suggestionButtons, suggestionCard } from "../src/intents/service";
import { applyDepth, markPrice, parseIcFeed, type Quote } from "../src/market/quotes";

const quote = (over: Partial<Quote> = {}): Quote => ({ symbol: "MTNGH", name: "MTN", last: 674n, prevClose: 674n, bid: 670n, ask: 674n, bidVolume: 5_000, askVolume: 5_000, live: true, volume: 10_000, quality: "DELAYED", tradable: true, ...over });

describe("suggestion card", () => {
  const verdict = { ok: true, violations: [], warnings: [], passed: ["mandate", "known stock", "max per order"], preview: charges("BUY", 72n, 674n) };

  it("prices the buy with every charge and says Sika doesn't place orders", () => {
    const card = suggestionCard({ side: "BUY", symbol: "MTNGH", shares: 72n, price: 674n }, verdict, quote());
    expect(card).toContain("*Suggestion: buy 72 MTNGH* at about GHS 6.74");
    expect(card).toContain("Total to pay: GHS 497.42");
    expect(card).toContain("Fits your plan (3 checks)");
    expect(card).toContain("Sika doesn't place orders");
    expect(card).not.toMatch(/approve/i);
  });

  it("offers I bought it / I sold it, Why? and Not now, within WhatsApp's 20-character titles", () => {
    expect(suggestionButtons({ id: "x", side: "BUY" }).map((b) => b.title)).toEqual(["I bought it", "Why?", "Not now"]);
    expect(suggestionButtons({ id: "x", side: "SELL" }).map((b) => [b.id, b.title])[0]).toEqual(["sug:done:x", "I sold it"]);
  });
});

describe("IC market data", () => {
  it("reads bid, ask and yesterday's close from the snapshot, with 0 meaning none", () => {
    const [q] = parseIcFeed([
      { symbol: "GCB", symbolName: "GCB Bank", lastTradePrice: 45.86, percentChange: 9.976, buyPrice: 39, sellPrice: 45.86, totalVolume: 2784, dataQuality: "DELAYED", isTradable: true, isHalted: false },
    ]);
    expect(q).toMatchObject({ last: 4_586n, prevClose: 4_170n, bid: 3_900n, ask: 4_586n, live: false });
    const [none] = parseIcFeed([{ symbol: "EGH", symbolName: "EGH", lastTradePrice: 39, percentChange: 0, buyPrice: 0, sellPrice: 39, totalVolume: 1, dataQuality: "LIVE", isTradable: true, isHalted: false }]);
    expect(none!.bid).toBeNull();
  });

  it("overlays the live order book", () => {
    const [q] = parseIcFeed([{ symbol: "MTNGH", symbolName: "MTN", lastTradePrice: 6.6, percentChange: 0, buyPrice: 6.6, sellPrice: 6.68, totalVolume: 1, dataQuality: "DELAYED", isTradable: true, isHalted: false }]);
    const live = applyDepth(q!, { entries: [{ bidPrice: 6.45, bidVolume: 4847, askPrice: 6.5, askVolume: 48823 }] });
    expect(live).toMatchObject({ bid: 645n, ask: 650n, bidVolume: 4847, askVolume: 48823, live: true });
    expect(markPrice(live)).toBe(645n);
  });
});

describe("draft fingerprints", () => {
  it("match for the same content regardless of key order, and differ when anything changes", async () => {
    const { fingerprint } = await import("../src/intents/sign");
    const a = await fingerprint({ maxOrderCedis: 1000, goal: "A house" });
    expect(await fingerprint({ goal: "A house", maxOrderCedis: 1000 })).toBe(a);
    expect(await fingerprint({ goal: "A house", maxOrderCedis: 100000 })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
});
