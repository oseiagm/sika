import { Db, type User } from "../db";
import { ghs, percent } from "../fees/engine";
import type { Env } from "../index";
import { propose } from "../intents/service";
import { fetchQuotes, withLiveBook, type Quote } from "../market/quotes";
import type { Sender } from "../handle";
import { notifyOutsideWindow } from "../news/monitor";
import type { Holding } from "../portfolio/holdings";
import { triggered, type Trigger } from "./levels";

const today = () => new Date().toISOString().slice(0, 10);

const where = (t: Trigger) => (t.basis === "bid" ? `Buyers are paying ${ghs(t.price)}` : `Nobody is bidding; the last trade was ${ghs(t.price)}`);

function rationale(t: Trigger, shares: bigint, held: bigint): string {
  const pl = `${t.profitBps >= 0n ? "+" : "-"}${percent(t.profitBps < 0n ? -t.profitBps : t.profitBps)}`;
  return t.kind === "take_profit"
    ? `${where(t)} for ${t.symbol}, at or above your take-profit level of ${ghs(t.level)}: the holding is ${pl} after all charges. Selling ${shares} of your ${held} shares locks in part of the gain and keeps the rest invested. Prices can keep rising or fall back; this is your rule, not a forecast.`
    : `${where(t)} for ${t.symbol}, below your stop-loss level of ${ghs(t.level)}: the holding is ${pl} after all charges. Your mandate says to cut losses at this point, so this sells the whole holding. Prices can recover; this is your rule, not a forecast.`;
}

/** What Sika sends for a reached level: an intro, then a ready sale proposal (or why it can't propose one). */
export async function alertMessages(
  db: Db,
  user: User,
  quotes: Map<string, Quote>,
  intentKey: string,
  h: Holding,
  trigger: Trigger,
): Promise<{ text: string; buttons?: { id: string; title: string }[] }[]> {
  const shares = trigger.kind === "take_profit" && h.shares > 1n ? h.shares / 2n : h.shares;
  const label = trigger.kind === "take_profit" ? "🎯 Take-profit level reached" : "🛑 Stop-loss level reached";
  const result = await propose({ db, user, quotes, intentKey }, { side: "SELL", symbol: h.symbol, shares, rationale: rationale(trigger, shares, h.shares) });
  await db.audit(user.waId, "alert", { trigger, proposed: result.ok });
  const intro = `*${label}: ${h.symbol}*\n${where(trigger)} (your level: ${ghs(trigger.level)}).`;
  if (result.ok) {
    return [
      { text: intro },
      {
        text: result.card,
        buttons: [
          { id: `intent:approve:${result.intent.id}`, title: "Approve" },
          { id: `intent:why:${result.intent.id}`, title: "Why?" },
          { id: `intent:reject:${result.intent.id}`, title: "Reject" },
        ],
      },
    ];
  }
  const why = result.violations.map((v) => `• ${v.message}`).join("\n");
  return [{ text: `${intro}\n\nI can't propose a sale right now:\n${why}` }];
}

/** The template's one-line summary of a reached level. */
export const alertHeadline = (t: Trigger) =>
  t.kind === "take_profit" ? `your take-profit level of ${ghs(t.level)} was reached` : `its price fell below your stop-loss level of ${ghs(t.level)}`;

/** Every 30 minutes while the GSE is open: checks each watched holding against the mandate's levels. */
export async function checkPriceAlerts(env: Env, send: Sender): Promise<void> {
  const db = new Db(env.DB);
  const quotes = new Map<string, Quote>((await fetchQuotes()).map((q) => [q.symbol, q]));
  for (const waId of await db.watchedUsers()) {
    const user = await db.user(waId);
    if (!user.mandate || !user.mandateConfirmed) continue;
    for (const h of await db.holdings(waId)) {
      const snapshot = quotes.get(h.symbol);
      if (!snapshot || !triggered(h, snapshot, user.mandate)) continue;
      // The snapshot can lag: confirm against the live order book before telling anyone.
      const quote = await withLiveBook(snapshot);
      quotes.set(h.symbol, quote);
      const trigger = triggered(h, quote, user.mandate);
      if (!trigger) continue;
      const inWindow = await db.inServiceWindow(waId);
      if (!inWindow && !env.WA_UPDATE_TEMPLATE) {
        await db.audit(waId, "alert_skipped", { reason: "outside WhatsApp's 24-hour window", trigger });
        continue;
      }
      // Once per level: the level only changes when the holding does (a buy, a sale, a mandate change).
      if (!(await db.claimAlert(waId, `${trigger.kind}:${h.symbol}:${trigger.level}`))) continue;

      if (!inWindow) {
        // The proposal would expire before they see it: the template's tap re-checks the price and proposes then.
        await notifyOutsideWindow(env, db, send, { waId, kind: "price", symbol: h.symbol, headline: alertHeadline(trigger), payload: { kind: trigger.kind, level: trigger.level } });
        continue;
      }
      const messages = await alertMessages(db, user, quotes, env.INTENT_KEY, h, trigger);
      await db.addMessage(waId, "assistant", messages.map((m) => m.text).join("\n\n"));
      for (const m of messages) await (m.buttons ? send.buttons(waId, m.text, m.buttons) : send.text(waId, m.text));
    }
  }
}

/** Daily: early in the month, nudges anyone with a monthly amount who hasn't invested yet. */
export async function monthlyReminder(env: Env, send: Sender): Promise<void> {
  if (new Date().getUTCDate() > 7) return;
  const db = new Db(env.DB);
  const month = today().slice(0, 7);
  for (const waId of await db.watchedUsers()) {
    const user = await db.user(waId);
    const amount = user.mandate?.monthlyContributionCedis ?? 0;
    if (amount <= 0 || (await db.boughtThisMonth(waId)) > 0n) continue;
    if (!(await db.inServiceWindow(waId))) continue;
    if (!(await db.claimAlert(waId, `monthly:${month}`))) continue;
    const text = `📅 *New month, ${user.name ?? "there"}!* Ready to invest your GHS ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2 })} for this month? I'll propose a trade that fits your mandate.`;
    await db.addMessage(waId, "assistant", text);
    await send.buttons(waId, text, [
      { id: "invest:now", title: "Invest now" },
      { id: "invest:skip", title: "Not this month" },
    ]);
  }
}
