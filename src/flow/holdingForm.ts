import type { Quote } from "../market/quotes";
import type { HoldingInput } from "../portfolio/holdings";
import { parseAmount } from "./plan";
import type { Ui } from "./ui";

/**
 * Adding one holding step by step with lists and buttons. WhatsApp Flows (native forms) need a
 * verified business, so this works everywhere and accepts typed answers at every step.
 */
export interface HoldingFormState {
  step: "stock" | "shares" | "cost" | "amount";
  symbol?: string;
  shares?: number;
  costType?: "price" | "total";
}

/** Today's most valuable trading first: the stocks people most likely hold. */
function popular(quotes: Map<string, Quote>, n: number): Quote[] {
  return [...quotes.values()].sort((a, b) => Number(b.last) * b.volume - Number(a.last) * a.volume).slice(0, n);
}

/** "mtn", "MTNGH", "Ecobank" → matching stocks (one when it's clear). */
export function findStocks(text: string, quotes: Map<string, Quote>): Quote[] {
  const t = text.trim().toLowerCase().replace(/[^a-z0-9 ]/g, "");
  if (!t) return [];
  const exact = quotes.get(t.toUpperCase().replace(/ /g, ""));
  if (exact) return [exact];
  const words = t.split(/\s+/).filter((w) => w.length >= 2 && !["shares", "share", "of", "the", "and", "bank", "ghana", "limited", "ltd"].includes(w));
  if (!words.length) return [];
  return [...quotes.values()].filter((q) => {
    const name = q.name.toLowerCase();
    const sym = q.symbol.toLowerCase();
    return words.some((w) => sym.startsWith(w) || name.split(/\s+/).some((n) => n.startsWith(w)));
  });
}

export function stockUi(quotes: Map<string, Quote>, choices?: Quote[]): Ui {
  const list = (choices ?? popular(quotes, 9)).slice(0, 9);
  return {
    text: choices
      ? "Which one do you mean?"
      : "*Add a holding* (1/3)\nWhich stock? Pick one, or type its name or ticker, e.g. *Ecobank* or *GOIL*.",
    list: {
      button: "Choose stock",
      rows: [
        ...list.map((q) => ({ id: `hf:stock:${q.symbol}`, title: q.symbol, description: q.name.slice(0, 72) })),
        { id: "hf:stock:other", title: "Another stock", description: "Type its name or ticker" },
      ],
    },
  };
}

export function sharesUi(symbol: string): Ui {
  return { text: `*Add a holding* (2/3)\nHow many *${symbol}* shares do you own? Type the number, e.g. *250*.` };
}

export function costUi(symbol: string): Ui {
  return {
    text: `*Add a holding* (3/3)\nWhat did you pay for your ${symbol} shares?`,
    buttons: [
      { id: "hf:cost:price", title: "Price per share" },
      { id: "hf:cost:total", title: "Total I paid" },
      { id: "hf:cost:unknown", title: "I don't know" },
    ],
  };
}

export function amountUi(f: HoldingFormState): Ui {
  return {
    text:
      f.costType === "price"
        ? `What price per share did you pay for ${f.symbol}? e.g. *1.80*`
        : `How much did you pay in total for your ${f.shares} ${f.symbol} shares, charges included? e.g. *3,000*`,
  };
}

export function formUi(f: HoldingFormState, quotes: Map<string, Quote>): Ui {
  switch (f.step) {
    case "stock":
      return stockUi(quotes);
    case "shares":
      return sharesUi(f.symbol!);
    case "cost":
      return costUi(f.symbol!);
    case "amount":
      return amountUi(f);
  }
}

export type FormStep = { kind: "next"; form: HoldingFormState } | { kind: "choose"; choices: Quote[] } | { kind: "done"; input: HoldingInput } | { kind: "retry"; hint: string };

/** Applies a tap ("hf:stock:MTNGH", "hf:cost:unknown") or typed text to the current step. */
export function advance(f: HoldingFormState, input: { buttonId?: string; text?: string }, quotes: Map<string, Quote>): FormStep {
  const [, field, value] = /^hf:(\w+):(\w+)$/.exec(input.buttonId ?? "") ?? [];
  const text = input.text?.trim() ?? "";

  if (f.step === "stock" || field === "stock") {
    if (value === "other") return { kind: "retry", hint: "Type the stock's name or ticker, e.g. *Ecobank Ghana* or *GOIL*." };
    const matches = value ? (quotes.has(value) ? [quotes.get(value)!] : []) : findStocks(text, quotes);
    if (matches.length === 1) return { kind: "next", form: { step: "shares", symbol: matches[0]!.symbol } };
    if (matches.length > 1) return { kind: "choose", choices: matches };
    return { kind: "retry", hint: "I couldn't find that stock on the GSE. Try the ticker, e.g. *MTNGH*, or pick from the list." };
  }
  if (f.step === "shares") {
    const n = Number(text.replace(/[, ]/g, "").replace(/shares?$/i, ""));
    if (!Number.isInteger(n) || n <= 0) return { kind: "retry", hint: "Just the number of shares, e.g. *250*." };
    return { kind: "next", form: { ...f, step: "cost", shares: n } };
  }
  if (f.step === "cost") {
    const choice = value ?? (/know|sure|remember|no idea/i.test(text) ? "unknown" : /total|all|altogether/i.test(text) ? "total" : /price|per|each/i.test(text) ? "price" : null);
    if (choice === "unknown") return { kind: "done", input: { symbol: f.symbol!, shares: f.shares!, pricePaidCedis: null, totalPaidCedis: null } };
    if (choice === "price" || choice === "total") return { kind: "next", form: { ...f, step: "amount", costType: choice } };
    // A bare amount near today's share price reads as a price per share; anything else as the total.
    const amount = parseAmount(text);
    const last = Number(quotes.get(f.symbol!)?.last ?? 0n) / 100;
    if (amount !== null) {
      const perShare = last > 0 && amount >= last / 10 && amount <= last * 10 && (f.shares ?? 1) > 1;
      return {
        kind: "done",
        input: { symbol: f.symbol!, shares: f.shares!, pricePaidCedis: perShare ? amount : null, totalPaidCedis: perShare ? null : amount },
      };
    }
    return { kind: "retry", hint: "Tap one of the buttons, or type the amount." };
  }
  const amount = parseAmount(text);
  if (amount === null) return { kind: "retry", hint: f.costType === "price" ? "Just the price, e.g. *1.80*." : "Just the amount, e.g. *3,000*." };
  return {
    kind: "done",
    input: { symbol: f.symbol!, shares: f.shares!, pricePaidCedis: f.costType === "price" ? amount : null, totalPaidCedis: f.costType === "total" ? amount : null },
  };
}
