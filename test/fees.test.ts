import { describe, expect, it } from "vitest";
import { charges, ghs, lowestSellPrice, maxSharesFor, percent, toPesewas } from "../src/fees/engine";

const lines = (c: ReturnType<typeof charges>) => Object.fromEntries(c.lines.map((l) => [l.name, l.pesewas]));

describe("charges", () => {
  it("BUY 125 @ 6.50 uses the 2.25% tier, each line rounded on its own", () => {
    const c = charges("BUY", 125n, 650n);
    expect(c.gross).toBe(81_250n);
    expect(lines(c)).toEqual({
      "CSD levy": 122n,
      "SEC levy": 122n,
      "GSE levy": 284n,
      "Market development levy": 41n,
      Brokerage: 1_259n,
    });
    expect(c.total).toBe(1_828n);
    expect(c.net).toBe(83_078n);
    expect(percent(c.allInBps)).toBe("2.25%");
  });

  it("picks the tier from the whole trade's gross: 500.00 vs 500.01", () => {
    expect(charges("BUY", 1n, 50_000n).allInBps).toBe(250n);
    expect(charges("BUY", 1n, 50_001n).allInBps).toBe(225n);
  });

  it("SELL at the 5,000.00 edge costs more than just above it", () => {
    const at = charges("SELL", 1n, 500_000n);
    const above = charges("SELL", 1n, 500_100n);
    expect(at.total).toBe(11_250n);
    expect(at.net).toBe(488_750n);
    expect(lines(above).Brokerage).toBe(6_501n);
    expect(above.total).toBe(10_001n);
    expect(above.net).toBe(490_099n);
  });

  it("buy cost dips just above a tier edge", () => {
    expect(charges("BUY", 1n, 500_000n).net).toBe(511_250n);
    expect(charges("BUY", 1n, 500_100n).net).toBe(510_101n);
  });

  it("rejects bad input", () => {
    expect(() => charges("BUY", 0n, 100n)).toThrow();
    expect(() => charges("BUY", 1n, 0n)).toThrow();
  });
});

describe("lowestSellPrice", () => {
  it("break-even for 125 shares that cost 830.78 all-in is 6.80", () => {
    expect(lowestSellPrice(125n, 83_078n)).toBe(680n);
    expect(charges("SELL", 125n, 680n).net).toBe(83_085n);
    expect(charges("SELL", 125n, 679n).net).toBe(82_966n);
  });

  it("a 20% net profit target needs 8.16", () => {
    expect(lowestSellPrice(125n, 99_694n)).toBe(816n);
  });
});

describe("maxSharesFor", () => {
  it("never spends more than the cash", () => {
    const cash = 50_000n;
    const shares = maxSharesFor(cash, 325n);
    expect(charges("BUY", shares, 325n).net).toBeLessThanOrEqual(cash);
    expect(charges("BUY", shares + 1n, 325n).net).toBeGreaterThan(cash);
  });

  it("returns 0 when one share is too dear", () => {
    expect(maxSharesFor(100n, 3_950n)).toBe(0n);
  });
});

describe("formatting", () => {
  it("formats and parses cedis", () => {
    expect(ghs(123_456n)).toBe("GHS 1,234.56");
    expect(ghs(-5n)).toBe("-GHS 0.05");
    expect(toPesewas("6.5")).toBe(650n);
    expect(toPesewas("1,234")).toBe(123_400n);
    expect(toPesewas("1.234")).toBeNull();
  });
});
