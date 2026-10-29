import { describe, expect, it } from "vitest";
import { PaperBroker } from "../src/broker/paper";
import { applyDepth, markPrice, parseIcFeed, type Quote } from "../src/market/quotes";
import { sign, verify } from "../src/intents/sign";

const quote = (over: Partial<Quote> = {}): Quote => ({ symbol: "MTNGH", name: "MTN", last: 674n, prevClose: 674n, bid: 670n, ask: 674n, bidVolume: 5_000, askVolume: 5_000, live: true, volume: 10_000, quality: "DELAYED", tradable: true, ...over });

describe("PaperBroker", () => {
  const broker = new PaperBroker();

  it("buys at the best ask with exact charges", async () => {
    const e = await broker.execute({ side: "BUY", symbol: "MTNGH", shares: 72n, limit: 687n }, quote());
    expect(e).toMatchObject({ filled: true, shares: 72n, price: 674n, partial: false });
    if (e.filled) expect(e.charges.net).toBe(49_742n);
  });

  it("sells at the best bid", async () => {
    const e = await broker.execute({ side: "SELL", symbol: "MTNGH", shares: 10n, limit: 660n }, quote());
    expect(e).toMatchObject({ filled: true, price: 670n });
  });

  it("never fills more than is offered at that price", async () => {
    const e = await broker.execute({ side: "BUY", symbol: "MTNGH", shares: 500n, limit: 700n }, quote({ askVolume: 120 }));
    expect(e).toMatchObject({ filled: true, shares: 120n, partial: true });
  });

  it("can't trade with nobody on the other side", async () => {
    expect((await broker.execute({ side: "SELL", symbol: "MTNGH", shares: 1n, limit: 1n }, quote({ bid: null }))).filled).toBe(false);
    expect((await broker.execute({ side: "BUY", symbol: "MTNGH", shares: 1n, limit: 9_999n }, quote({ ask: null }))).filled).toBe(false);
  });

  it("respects the limit price on both sides", async () => {
    expect((await broker.execute({ side: "BUY", symbol: "MTNGH", shares: 1n, limit: 600n }, quote())).filled).toBe(false);
    expect((await broker.execute({ side: "SELL", symbol: "MTNGH", shares: 1n, limit: 700n }, quote())).filled).toBe(false);
  });

  it("doesn't trade a halted stock", async () => {
    expect((await broker.execute({ side: "BUY", symbol: "MTNGH", shares: 1n, limit: 700n }, quote({ tradable: false }))).filled).toBe(false);
  });
});

describe("intent signatures", () => {
  const fields = { id: "a", waId: "233", side: "BUY", symbol: "MTNGH", shares: 72n, price: 674n, net: 49_742n, expiresAt: "2026-10-29T12:00:00.000Z" };

  it("verifies what was signed and nothing else", async () => {
    const sig = await sign(fields, "secret");
    expect(await verify(fields, sig, "secret")).toBe(true);
    expect(await verify({ ...fields, shares: 720n }, sig, "secret")).toBe(false);
    expect(await verify(fields, sig, "other")).toBe(false);
    expect(await verify(fields, "nope", "secret")).toBe(false);
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
