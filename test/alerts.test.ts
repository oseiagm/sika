import { describe, expect, it } from "vitest";
import { levels, triggered } from "../src/alerts/levels";
import { charges } from "../src/fees/engine";
import type { Mandate } from "../src/mandate/schema";
import type { Quote } from "../src/market/quotes";
import { menuAction } from "../src/menu";

const mandate: Mandate = {
  goal: "Retirement",
  horizon: "5+ years",
  risk: "balanced",
  monthlyContributionCedis: 500,
  maxPositionPercent: 30,
  maxOrderCedis: 1000,
  preferredSymbols: [],
  excludedSymbols: [],
  stopLossPercent: 15,
  takeProfitPercent: 20,
  neverSellAtLoss: false,
};
const holding = { symbol: "MTNGH", shares: 125n, cost: 83_078n, source: "given" as const };
const at = (last: bigint): Quote => ({ symbol: "MTNGH", name: "MTN", last, prevClose: last, bid: last, ask: last, bidVolume: null, askVolume: null, live: true, volume: 1000, quality: "DELAYED", tradable: true });

describe("alert levels", () => {
  it("take profit is the lowest price making the % after both sides' charges", () => {
    expect(levels(holding, mandate).takeProfitPrice).toBe(816n);
  });

  it("stop loss is where proceeds fall below cost minus the %", () => {
    const stop = levels(holding, mandate).stopLossPrice!;
    expect(charges("SELL", 125n, stop).net).toBeGreaterThanOrEqual((83_078n * 85n + 99n) / 100n);
    expect(charges("SELL", 125n, stop - 1n).net).toBeLessThan((83_078n * 85n) / 100n);
  });

  it("fires take profit at the level, stop loss below it, nothing in between", () => {
    expect(triggered(holding, at(816n), mandate)?.kind).toBe("take_profit");
    expect(triggered(holding, at(815n), mandate)).toBeNull();
    expect(triggered(holding, at(500n), mandate)?.kind).toBe("stop_loss");
  });

  it("never-sell-at-loss switches the stop loss off", () => {
    expect(levels(holding, { ...mandate, neverSellAtLoss: true }).stopLossPrice).toBeNull();
    expect(triggered(holding, at(100n), { ...mandate, neverSellAtLoss: true })).toBeNull();
  });
});

describe("menu", () => {
  it("reads taps, slash commands and numbers right after the menu", () => {
    expect(menuAction({ buttonId: "menu:portfolio" }, false, true)).toBe("portfolio");
    expect(menuAction({ text: "/invest" }, false, true)).toBe("invest");
    expect(menuAction({ text: "Menu" }, false, true)).toBe("menu");
    expect(menuAction({ text: "home." }, false, false)).toBe("menu");
    expect(menuAction({ text: "1" }, true, true)).toBe("invest");
    expect(menuAction({ text: "1" }, true, false)).toBe("continue");
    expect(menuAction({ text: "2" }, false, true)).toBeNull();
    expect(menuAction({ text: "8" }, true, true)).toBe("settings");
    expect(menuAction({ text: "/profile" }, false, true)).toBe("profile");
    expect(menuAction({ text: "/language" }, false, false)).toBe("language");
    expect(menuAction({ text: "/plan" }, false, true)).toBe("mandate");
    expect(menuAction({ text: "/unknown" }, false, true)).toBeNull();
    expect(menuAction({ text: "buy 2 shares" }, true, true)).toBeNull();
  });
});
