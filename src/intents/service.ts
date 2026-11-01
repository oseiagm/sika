import type { Db, Intent, User } from "../db";
import { charges, ghs, lowestSellPrice, percent, type Charges } from "../fees/engine";
import type { Side } from "../fees/schedule";
import { withLiveBook, type Quote } from "../market/quotes";
import { check, type Verdict } from "../policy/check";

/**
 * Sika never places orders. It suggests a trade that fits the investor's plan, priced from the live
 * order book with every charge shown; the investor places it with their own broker and then taps
 * "I bought it" (or "I sold it") so Sika can keep their holdings and monthly budget up to date.
 *
 * Suggestions are stored in the `intents` table. Status: PROPOSED = suggested and open,
 * FILLED = the investor recorded doing it, REJECTED = "Not now", EXPIRED = replaced by a newer one.
 */

export interface Deps {
  db: Db;
  user: User;
  quotes: Map<string, Quote>;
}

export function chargesBlock(c: Charges): string[] {
  return [
    `Gross: ${ghs(c.gross)}`,
    ...c.lines.map((l) => `  ${l.name}: ${ghs(l.pesewas)}`),
    `Charges: ${ghs(c.total)} (${percent(c.allInBps)} tier)`,
    `*${c.side === "BUY" ? "Total to pay" : "You receive"}: ${ghs(c.net)}*`,
  ];
}

const book = (q: Quote) =>
  `Buyers ${q.bid ? ghs(q.bid) : "none"} · Sellers ${q.ask ? ghs(q.ask) : "none"} · Last trade ${ghs(q.last)}${q.recordedAt ? ` (recorded ${q.recordedAt.slice(0, 16)} GMT)` : q.live ? " (live)" : ""}`;

export function suggestionCard(i: Pick<Intent, "side" | "symbol" | "shares" | "price">, verdict: Verdict, quote: Quote): string {
  const c = verdict.preview!;
  const buy = i.side === "BUY";
  const lines = [
    `*Suggestion: ${buy ? "buy" : "sell"} ${i.shares} ${i.symbol}* at about ${ghs(i.price)}`,
    `_${quote.name}_`,
    book(quote),
    "",
    `Expected with IC Securities' charges:`,
    ...chargesBlock(c),
  ];
  if (buy) lines.push(`Break-even sell price: ${ghs(lowestSellPrice(i.shares, c.net))}`);
  lines.push("", `✅ Fits your plan (${verdict.passed.length} checks)`);
  for (const w of verdict.warnings) lines.push(`⚠️ ${w.message}`);
  lines.push(
    "",
    `Sika doesn't place orders. If you want this, place it with your broker; prices move, so check the live price first. Then tap *${buy ? "I bought it" : "I sold it"}* and I'll update your holdings.`,
  );
  return lines.join("\n");
}

/** The buttons under a suggestion. */
export const suggestionButtons = (i: Pick<Intent, "id" | "side">) => [
  { id: `sug:done:${i.id}`, title: i.side === "BUY" ? "I bought it" : "I sold it" },
  { id: `sug:why:${i.id}`, title: "Why?" },
  { id: `sug:skip:${i.id}`, title: "Not now" },
];

export type SuggestResult =
  | { ok: true; intent: Intent; card: string }
  | { ok: false; violations: Verdict["violations"]; warnings: Verdict["warnings"] };

/** Prices a trade from the live order book and checks it against the plan; only a trade that fits is suggested. */
export async function suggest(d: Deps, order: { side: Side; symbol: string; shares: bigint; rationale: string }): Promise<SuggestResult> {
  const snapshot = d.quotes.get(order.symbol);
  const quote = snapshot ? await withLiveBook(snapshot) : undefined;
  if (quote) d.quotes.set(order.symbol, quote);
  const price = (order.side === "BUY" ? quote?.ask : quote?.bid) ?? 0n;
  const verdict = check(
    { side: order.side, symbol: order.symbol, shares: order.shares, price },
    {
      mandate: d.user.mandate,
      mandateConfirmed: d.user.mandateConfirmed,
      holdings: await d.db.holdings(d.user.waId),
      quotes: d.quotes,
      boughtThisMonth: await d.db.boughtThisMonth(d.user.waId),
    },
  );
  await d.db.audit(d.user.waId, "policy", { order, price, verdict });
  if (!verdict.ok || !quote || !verdict.preview) return { ok: false, violations: verdict.violations, warnings: verdict.warnings };

  // A new suggestion for a stock replaces any still open for it.
  await d.db.expireOpenIntents(d.user.waId, order.symbol);
  const intent: Intent = {
    id: crypto.randomUUID(),
    waId: d.user.waId,
    side: order.side,
    symbol: order.symbol,
    shares: order.shares,
    price,
    net: verdict.preview.net,
    rationale: order.rationale,
    verdict,
    signature: "",
    status: "PROPOSED",
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  };
  await d.db.createIntent(intent);
  await d.db.audit(d.user.waId, "suggested", {
    id: intent.id, side: intent.side, symbol: intent.symbol, shares: intent.shares, price, net: intent.net,
    book: { bid: quote.bid, ask: quote.ask, last: quote.last, live: quote.live },
  });
  return { ok: true, intent, card: suggestionCard(intent, verdict, quote) };
}

export function whyCard(i: Intent): string {
  return [
    `*Why ${i.side === "BUY" ? "buy" : "sell"} ${i.symbol}?*`,
    i.rationale,
    "",
    "*Plan checks passed*",
    ...i.verdict.passed.map((r) => `✅ ${r}`),
    ...i.verdict.warnings.map((w) => `⚠️ ${w.message}`),
    "",
    "This is information within your own plan, not personal investment advice.",
  ].join("\n");
}

export type Recorded = { ok: true; message: string; firstBuy: boolean } | { ok: false; message: string };

/**
 * "I bought it" / "I sold it": records what the investor says they did, at the suggested price, so
 * holdings and the monthly budget stay right. Each suggestion is recorded at most once.
 */
export async function recordDone(d: Deps, id: string): Promise<Recorded> {
  const i = await d.db.intent(d.user.waId, id);
  if (!i) return { ok: false, message: "I can't find that suggestion." };
  if (i.status === "FILLED") return { ok: false, message: "Already added to your holdings." };
  if (i.status === "EXPIRED") return { ok: false, message: `That suggestion was replaced by a newer one for ${i.symbol}. Use the latest one, or tell me what you bought and I'll add it.` };
  const holdings = await d.db.holdings(d.user.waId);
  const held = holdings.find((h) => h.symbol === i.symbol);
  if (i.side === "SELL" && (!held || held.shares < i.shares)) {
    await d.db.transition(i.id, i.status, "EXPIRED");
    return { ok: false, message: `Your holdings show ${held?.shares ?? 0n} ${i.symbol} shares, fewer than this sale. Tell me what you actually sold and I'll fix your holdings.` };
  }
  // PROPOSED or REJECTED ("Not now", then they did it anyway) → recorded, exactly once.
  if (!(await d.db.transition(i.id, i.status, "FILLED"))) return { ok: false, message: "Already added to your holdings." };
  const c = charges(i.side, i.shares, i.price);
  await d.db.recordFill({ intentId: i.id, waId: d.user.waId, side: i.side, symbol: i.symbol, shares: i.shares, price: i.price, charges: c }, held);
  await d.db.audit(d.user.waId, "recorded", { id, side: i.side, symbol: i.symbol, shares: i.shares, price: i.price, net: c.net });
  const firstBuy = i.side === "BUY" && (await d.db.fillsFor(d.user.waId)).length === 1;
  return {
    ok: true,
    firstBuy,
    message: [
      `*✅ ${i.side === "BUY" ? "Added to" : "Updated"} your holdings*`,
      `${i.side === "BUY" ? "Bought" : "Sold"} ${i.shares} ${i.symbol} at ${ghs(i.price)}: ${ghs(c.net)} ${i.side === "BUY" ? "with charges" : "after charges"}.`,
      "",
      "Different price or number of shares? Tap *Fix it* and tell me what your broker's contract note says.",
    ].join("\n"),
  };
}

export async function dismiss(d: Deps, id: string): Promise<string> {
  const i = await d.db.intent(d.user.waId, id);
  if (!i) return "I can't find that suggestion.";
  if (await d.db.transition(i.id, "PROPOSED", "REJECTED")) await d.db.audit(d.user.waId, "dismissed", { id });
  return "Okay, no problem. Ask me any time for another suggestion.";
}
