import { describe, expect, it } from "vitest";
import { advance, findStocks, stockUi, type HoldingFormState } from "../src/flow/holdingForm";
import type { Quote } from "../src/market/quotes";

const q = (symbol: string, name: string, last: bigint, volume = 100): Quote => ({
  symbol, name, last, prevClose: last, bid: last, ask: last, bidVolume: null, askVolume: null, volume, quality: "DELAYED", live: false, tradable: true,
});
const quotes = new Map([
  ["MTNGH", q("MTNGH", "MTN Ghana Limited", 650n, 50_000)],
  ["EGH", q("EGH", "Ecobank Ghana Ltd", 3_900n)],
  ["ETI", q("ETI", "Ecobank Transnational Incorporation", 140n, 90_000)],
  ["GOIL", q("GOIL", "GOIL PLC", 550n)],
]);

describe("holding form", () => {
  it("finds stocks by ticker or name, and asks when ambiguous", () => {
    expect(findStocks("mtn", quotes).map((s) => s.symbol)).toEqual(["MTNGH"]);
    expect(findStocks("GOIL", quotes).map((s) => s.symbol)).toEqual(["GOIL"]);
    expect(findStocks("ecobank", quotes).map((s) => s.symbol).sort()).toEqual(["EGH", "ETI"]);
    expect(advance({ step: "stock" }, { text: "Ecobank" }, quotes).kind).toBe("choose");
  });

  it("walks stock → shares → cost → amount", () => {
    let f: HoldingFormState = { step: "stock" };
    let s = advance(f, { buttonId: "hf:stock:MTNGH" }, quotes);
    expect(s).toEqual({ kind: "next", form: { step: "shares", symbol: "MTNGH" } });
    f = (s as { form: HoldingFormState }).form;
    expect(advance(f, { text: "two hundred" }, quotes).kind).toBe("retry");
    s = advance(f, { text: "1,200" }, quotes);
    f = (s as { form: HoldingFormState }).form;
    expect(f).toMatchObject({ step: "cost", shares: 1200 });
    s = advance(f, { buttonId: "hf:cost:price" }, quotes);
    f = (s as { form: HoldingFormState }).form;
    expect(advance(f, { text: "GHS 1.80" }, quotes)).toEqual({
      kind: "done",
      input: { symbol: "MTNGH", shares: 1200, pricePaidCedis: 1.8, totalPaidCedis: null },
    });
  });

  it("'I don't know' finishes with an estimate; a bare amount is read sensibly", () => {
    const f: HoldingFormState = { step: "cost", symbol: "MTNGH", shares: 100 };
    expect(advance(f, { buttonId: "hf:cost:unknown" }, quotes)).toMatchObject({ kind: "done", input: { pricePaidCedis: null, totalPaidCedis: null } });
    expect(advance(f, { text: "5.20" }, quotes)).toMatchObject({ kind: "done", input: { pricePaidCedis: 5.2 } });
    expect(advance(f, { text: "600" }, quotes)).toMatchObject({ kind: "done", input: { totalPaidCedis: 600 } });
  });

  it("lists the most-traded stocks first, within WhatsApp's limits", () => {
    const rows = stockUi(quotes).list!.rows;
    expect(rows[0]!.id).toBe("hf:stock:MTNGH");
    expect(rows.length).toBeLessThanOrEqual(10);
  });
});
