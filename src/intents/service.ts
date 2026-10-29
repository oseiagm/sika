import type { Broker } from "../broker/paper";
import type { Db, Intent, User } from "../db";
import { ghs, lowestSellPrice, percent, type Charges } from "../fees/engine";
import type { Side } from "../fees/schedule";
import { withLiveBook, type Quote } from "../market/quotes";
import { check, type Verdict } from "../policy/check";
import { sign, verify } from "./sign";

/** An approval is only good for this long; prices move. */
const TTL_MINUTES = 30;
/** If the price moved more than this since the proposal, the investor must approve again. */
const MAX_DRIFT_BPS = 200n;

export interface Deps {
  db: Db;
  user: User;
  quotes: Map<string, Quote>;
  intentKey: string;
}

function chargesBlock(c: Charges): string[] {
  return [
    `Gross: ${ghs(c.gross)}`,
    ...c.lines.map((l) => `  ${l.name}: ${ghs(l.pesewas)}`),
    `Charges: ${ghs(c.total)} (${percent(c.allInBps)} tier)`,
    `*${c.side === "BUY" ? "Total to pay" : "You receive"}: ${ghs(c.net)}*`,
  ];
}

const book = (q: Quote) =>
  `Buyers ${q.bid ? ghs(q.bid) : "none"} · Sellers ${q.ask ? ghs(q.ask) : "none"} · Last trade ${ghs(q.last)}${q.recordedAt ? ` (recorded ${q.recordedAt.slice(0, 16)} GMT)` : q.live ? " (live)" : ""}`;

export function proposalCard(i: Pick<Intent, "side" | "symbol" | "shares" | "price">, verdict: Verdict, quote: Quote): string {
  const c = verdict.preview!;
  const lines = [
    `*Proposed: ${i.side === "BUY" ? "Buy" : "Sell"} ${i.shares} ${i.symbol}* @ ${ghs(i.price)}`,
    `_${quote.name}_`,
    book(quote),
    "",
    ...chargesBlock(c),
  ];
  if (i.side === "BUY") lines.push(`Break-even sell price: ${ghs(lowestSellPrice(i.shares, c.net))}`);
  lines.push("", `✅ Passed ${verdict.passed.length} plan checks`);
  for (const w of verdict.warnings) lines.push(`⚠️ ${w.message}`);
  lines.push("", `Simulated trade. Valid ${TTL_MINUTES} min. Nothing happens unless you tap Approve.`);
  return lines.join("\n");
}

export type ProposeResult =
  | { ok: true; intent: Intent; card: string }
  | { ok: false; violations: Verdict["violations"]; warnings: Verdict["warnings"] };

export async function propose(
  d: Deps,
  order: { side: Side; symbol: string; shares: bigint; rationale: string },
): Promise<ProposeResult> {
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

  await d.db.expireOpenIntents(d.user.waId, order.symbol);
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();
  const fields = { id: crypto.randomUUID(), waId: d.user.waId, side: order.side, symbol: order.symbol, shares: order.shares, price, net: verdict.preview.net, expiresAt };
  const intent: Intent = { ...fields, rationale: order.rationale, verdict, signature: await sign(fields, d.intentKey), status: "PROPOSED" };
  await d.db.createIntent(intent);
  await d.db.audit(d.user.waId, "proposed", {
    id: intent.id, side: intent.side, symbol: intent.symbol, shares: intent.shares, price, net: intent.net,
    book: { bid: quote.bid, ask: quote.ask, last: quote.last, live: quote.live },
  });
  return { ok: true, intent, card: proposalCard(intent, verdict, quote) };
}

export function whyCard(i: Intent): string {
  return [
    `*Why ${i.side === "BUY" ? "buy" : "sell"} ${i.symbol}?*`,
    i.rationale,
    "",
    "*Plan checks passed*",
    ...i.verdict.passed.map((r) => `✅ ${r}`),
    ...i.verdict.warnings.map((w) => `⚠️ ${w.message}`),
  ].join("\n");
}

function contractNote(i: Intent, shares: bigint, c: Charges, partial: boolean, note?: string): string {
  return [
    `*✅ ${i.side === "BUY" ? "Bought" : "Sold"} ${shares} ${i.symbol}* (simulated)`,
    `Price: ${ghs(c.price)}`,
    ...chargesBlock(c),
    ...(partial ? [`Only ${shares} of ${i.shares} shares filled: that's all that traded today.`] : []),
    ...(note ? [note] : []),
    "",
    `Ref: ${i.id.slice(0, 8)}`,
  ].join("\n");
}

export type DecideResult = { message: string };

export async function approve(d: Deps, broker: Broker, id: string): Promise<DecideResult> {
  const i = await d.db.intent(d.user.waId, id);
  if (!i) return { message: "I can't find that proposal." };
  if (i.status !== "PROPOSED") return { message: `That proposal is already ${i.status.toLowerCase()}.` };
  if (!(await verify(i, i.signature, d.intentKey))) {
    await d.db.transition(i.id, "PROPOSED", "FAILED");
    await d.db.audit(d.user.waId, "signature_failed", { id });
    return { message: "That proposal failed its integrity check, so I've cancelled it." };
  }
  if (Date.parse(i.expiresAt) < Date.now()) {
    await d.db.transition(i.id, "PROPOSED", "EXPIRED");
    return { message: "That proposal has expired. Ask me again for a fresh one at today's price." };
  }

  const snapshot = d.quotes.get(i.symbol);
  if (!snapshot) return { message: `I can't get a price for ${i.symbol} right now. Try again shortly.` };
  const quote = await withLiveBook(snapshot);
  d.quotes.set(i.symbol, quote);
  const now = i.side === "BUY" ? quote.ask : quote.bid;
  if (now === null) {
    await d.db.transition(i.id, "PROPOSED", "EXPIRED");
    return { message: i.side === "BUY" ? `Nobody is selling ${i.symbol} right now, so I've cancelled this. Ask me again later.` : `Nobody is bidding for ${i.symbol} right now, so I've cancelled this. Ask me again later.` };
  }
  const drift = ((now - i.price) * 10_000n) / i.price;
  if (drift > MAX_DRIFT_BPS || drift < -MAX_DRIFT_BPS) {
    await d.db.transition(i.id, "PROPOSED", "EXPIRED");
    return { message: `The ${i.side === "BUY" ? "best offer" : "best bid"} for ${i.symbol} moved from ${ghs(i.price)} to ${ghs(now)} since I proposed this, so I've cancelled it. Ask me again for a fresh proposal.` };
  }

  // Re-check against the mandate now: holdings or this month's spending may have changed since the proposal.
  const holdings = await d.db.holdings(d.user.waId);
  const recheck = check(
    { side: i.side, symbol: i.symbol, shares: i.shares, price: now },
    { mandate: d.user.mandate, mandateConfirmed: d.user.mandateConfirmed, holdings, quotes: d.quotes, boughtThisMonth: await d.db.boughtThisMonth(d.user.waId) },
  );
  if (!recheck.ok) {
    await d.db.transition(i.id, "PROPOSED", "EXPIRED");
    await d.db.audit(d.user.waId, "policy", { id, recheck });
    return { message: `This no longer fits your plan:\n${recheck.violations.map((v) => `• ${v.message}`).join("\n")}` };
  }

  if (!(await d.db.transition(i.id, "PROPOSED", "APPROVED"))) return { message: "That proposal was already handled." };
  await d.db.audit(d.user.waId, "approved", { id });

  // Limit: buys at most the drift allowance above the proposed price, sells at most that far below.
  const allowance = (i.price * MAX_DRIFT_BPS) / 10_000n;
  const execution = await broker.execute(
    { side: i.side, symbol: i.symbol, shares: i.shares, limit: i.side === "BUY" ? i.price + allowance : i.price - allowance },
    quote,
  );
  if (!execution.filled) {
    await d.db.transition(i.id, "APPROVED", "FAILED");
    await d.db.audit(d.user.waId, "not_filled", { id, reason: execution.reason });
    return { message: `Not filled: ${execution.reason}` };
  }
  await d.db.recordFill(
    { intentId: i.id, waId: d.user.waId, side: i.side, symbol: i.symbol, shares: execution.shares, price: execution.price, charges: execution.charges },
    holdings.find((h) => h.symbol === i.symbol),
  );
  await d.db.audit(d.user.waId, "filled", { id, shares: execution.shares, price: execution.price, net: execution.charges.net });
  return { message: contractNote(i, execution.shares, execution.charges, execution.partial, execution.note) };
}

export async function reject(d: Deps, id: string): Promise<DecideResult> {
  const i = await d.db.intent(d.user.waId, id);
  if (!i) return { message: "I can't find that proposal." };
  const ok = await d.db.transition(i.id, "PROPOSED", "REJECTED");
  if (ok) await d.db.audit(d.user.waId, "rejected", { id });
  return { message: ok ? "Rejected. Nothing was traded." : "That proposal was already handled." };
}
