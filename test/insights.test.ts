import { describe, expect, it } from "vitest";
import { fillFor, liquidity, sessionActivity } from "../src/market/activity";
import { compareStocks, valuation } from "../src/market/compare";
import { marketOverview } from "../src/market/overview";
import { portfolioInsights } from "../src/portfolio/insights";
import type { Valuation } from "../src/portfolio/holdings";
import { parseProfile, type CompanyProfile } from "../src/market/profile";
import type { Quote } from "../src/market/quotes";

const q = (over: Partial<Quote> = {}): Quote => ({
  symbol: "MTNGH", name: "MTN Ghana", last: 675n, prevClose: 667n, bid: 645n, ask: 650n, bidVolume: 4847, askVolume: 48823, live: true, volume: 821_838, quality: "LIVE", tradable: true,
  trades: 1185, valueTraded: 555_061_612n,
  levels: [
    { bid: 645n, bidVolume: 4847, ask: 650n, askVolume: 100 },
    { bid: 640n, bidVolume: 47000, ask: 655n, askVolume: 1000 },
    { bid: 635n, bidVolume: 15000, ask: 657n, askVolume: 500 },
  ],
  ...over,
});

const profile = (over: Partial<CompanyProfile> = {}): CompanyProfile => ({
  sector: "Telecommunications", industry: "Mobile networks and mobile money", business: "Ghana's largest mobile network.",
  sharesOutstanding: 12_290_474_360, dividends: { lastPerShareCedis: 0.03, lastPaid: "2026-11", last12MonthsPerShareCedis: 0.3, note: "quarterly interim" },
  peRatio: 9.4, latestResults: { period: "9 months to Sep 2026", summary: "Profit after tax up 43% to GHS 7.75bn." },
  recentNews: [{ title: "MTN invests $1.1bn", url: "https://example.com/a", date: "2026-10-31" }],
  sources: [{ title: "src", url: "https://example.com/src" }], fetchedAt: "2026-11-01T10:00:00.000Z",
  ...over,
});

describe("session activity from recorded snapshots", () => {
  it("takes each day's last snapshot and counts sessions with trades", () => {
    const tapes = [
      { at: "2026-10-29 10:30:00", snapshot: [{ symbol: "CAL", totalVolume: 5, valueTraded: 1 }] },
      { at: "2026-10-29 15:00:00", snapshot: [{ symbol: "CAL", totalVolume: 0, valueTraded: 0 }] },
      { at: "2026-10-30 15:00:00", snapshot: [{ symbol: "CAL", totalVolume: 200, valueTraded: 100 }] },
      { at: "2026-10-31 15:00:00", snapshot: [{ symbol: "MTNGH", totalVolume: 9, valueTraded: 9 }] },
    ];
    expect(sessionActivity(tapes, "CAL")).toEqual({ sessions: 2, tradedSessions: 1, avgValueTraded: 5_000n });
    expect(sessionActivity(tapes, "GCB")).toBeNull();
  });
});

describe("filling an amount from the order book", () => {
  it("fills at the best price when the first level covers it", () => {
    expect(fillFor(q(), 50_000n)).toMatchObject({ atBestPrice: true, shortBy: 0n });
  });

  it("reaches up the book for larger amounts, and says when the book can't cover it", () => {
    expect(fillFor(q(), 500_000n)).toMatchObject({ atBestPrice: false, worstPrice: 655n, shortBy: 0n });
    const tooMuch = fillFor(q(), 100_000_000n)!;
    expect(tooMuch.shortBy).toBeGreaterThan(0n);
  });

  it("describes liquidity in plain words", () => {
    const l = liquidity(q(), { sessions: 5, tradedSessions: 5, avgValueTraded: 400_000_000n }, 500_000n);
    expect(l.today).toBe("1185 trades, 821,838 shares, GHS 5,550,616.12 traded");
    expect(l.recentSessions).toBe("traded in 5 of the last 5 sessions Sika recorded, about GHS 4,000,000.00 a session");
    expect(l.forYourAmount).toBe("GHS 5,000.00 would reach up to GHS 6.55 a share, above the best price");
  });
});

describe("valuation from the live price", () => {
  it("computes market cap and dividend yield itself", () => {
    const v = valuation(q(), profile());
    expect(v.marketCap).toMatch(/^about GHS 82,960,701,930\.00/);
    expect(v.dividendYield).toMatch(/^4\.44%/);
    expect(v.peRatio).toBe("9.4 (as reported)");
  });

  it("leaves out what the web couldn't confirm", () => {
    expect(valuation(q(), profile({ sharesOutstanding: null, dividends: null, peRatio: null }))).toEqual({});
  });
});

describe("company profiles from the web", () => {
  it("parses the JSON, tolerating text around it and string numbers, and drops bad links", () => {
    const p = parseProfile(`Here: {"sector":"Banking","industry":"Commercial bank","business":"A Ghanaian bank.","sharesOutstanding":"265,000,000","dividends":{"lastPerShareCedis":0.5,"lastPaid":"2026-06","last12MonthsPerShareCedis":null,"note":null},"peRatio":null,"latestResults":null,"recentNews":[{"title":"ok","url":"https://a.com/x","date":"2026-10-01"},{"title":"bad","url":"javascript:x","date":null}]} done`)!;
    expect(p.sharesOutstanding).toBe(265_000_000);
    expect(p.recentNews).toEqual([{ title: "ok", url: "https://a.com/x", date: "2026-10-01" }]);
    expect(parseProfile("no json")).toBeNull();
  });

  it("adds the facts to the comparison, saying where they're from", () => {
    const [mtn] = compareStocks(["MTNGH"], new Map([["MTNGH", q()]]), [], null, null, new Map([["MTNGH", { profile: profile(), activity: null }]])) as Record<string, any>[];
    expect(mtn!.about).toEqual({ sector: "Telecommunications", industry: "Mobile networks and mobile money", business: "Ghana's largest mobile network." });
    expect(mtn!.dividends.last).toBe("GHS 0.03 a share (2026-11)");
    expect(mtn!.latestResults).toBe("9 months to Sep 2026: Profit after tax up 43% to GHS 7.75bn.");
    expect(mtn!.companyFactsFrom).toBe("the web, as of 2026-11-01: https://example.com/src");
    expect(mtn!.liquidity.today).toContain("1185 trades");
  });
});

describe("market overview", () => {
  const stock = (symbol: string, last: bigint, prevClose: bigint, volume: number, value?: bigint): Quote =>
    q({ symbol, name: symbol, last, prevClose, volume, valueTraded: value, trades: volume ? 3 : 0, levels: undefined });

  it("ranks movers among stocks that traded, by value traded, with breadth", () => {
    const o = marketOverview([
      stock("UP", 110n, 100n, 10, 1_100n),
      stock("DOWN", 90n, 100n, 10, 900n),
      stock("FLAT", 100n, 100n, 5, 500n),
      stock("JUMP", 200n, 100n, 0), // no trade today: not a mover
    ]);
    expect(o.tradedToday).toBe(3);
    expect(o.breadth).toBe("1 up, 1 down, 1 unchanged among stocks that traded; 1 didn't trade");
    expect(o.gainers).toEqual(["UP (UP): GHS 1.10, +10.00%"]);
    expect(o.losers).toEqual(["DOWN (DOWN): GHS 0.90, -10.00%"]);
    expect(o.mostTraded[0]).toBe("UP: GHS 11.00 (10 shares, 3 trades)");
    expect(o.totalValueTraded).toBe("GHS 25.00");
  });
});

describe("portfolio insights", () => {
  const val = (symbol: string, shares: bigint, netIfSold: bigint): Valuation => ({ symbol, name: symbol, shares, cost: netIfSold, source: "given", price: 100n, basis: "bid", netIfSold, profit: 0n, profitBps: 0n, breakEven: 100n });

  it("gives sector mix, the largest holding, dividends and holdings that rarely trade", () => {
    const i = portfolioInsights(
      [val("MTNGH", 1000n, 600_000n), val("CAL", 500n, 300_000n), val("XYZ", 10n, 100_000n)],
      new Map([
        ["MTNGH", profile()],
        ["CAL", profile({ sector: "Financials", dividends: { lastPerShareCedis: 0, lastPaid: null, last12MonthsPerShareCedis: null, note: null } })],
        ["XYZ", null],
      ]),
      new Map([["CAL", { sessions: 5, tradedSessions: 1, avgValueTraded: 0n }]]),
    ) as Record<string, any>;
    expect(i.largestHolding).toBe("MTNGH: 60.00% of the portfolio");
    expect(i.sectorMix).toEqual(["Telecommunications: 60.00%", "Financials: 30.00%", "Not known: 10.00%"]);
    expect(i.dividendsLast12Months.total).toBe("GHS 300.00");
    expect(i.dividendsLast12Months.byStock).toEqual(["MTNGH: about GHS 300.00", "CAL: no recent dividend"]);
    expect(i.dividendsNotKnown).toEqual(["XYZ"]);
    expect(i.mayBeHardToSell).toEqual(["CAL traded in only 1 of the last 5 sessions"]);
  });
});
