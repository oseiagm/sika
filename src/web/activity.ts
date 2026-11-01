import type { Db, Intent } from "../db";
import { ghs } from "../fees/engine";
import { refreshLive, type Quote } from "../market/quotes";
import { valueAll } from "../portfolio/format";
import { QUESTIONS, type Level } from "../profile/questions";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (p: unknown) => ghs(BigInt(String(p ?? 0)));
const when = (at: string) =>
  new Date(`${at.replace(" ", "T")}Z`).toLocaleString("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const RULE_NAMES: Record<string, string> = {
  mandate: "A confirmed plan exists",
  "known stock": "It's a listed GSE stock",
  "whole shares": "Whole shares only",
  "someone to trade with": "Someone on the other side",
  tradable: "The stock is trading",
  "not excluded": "Not on the never-buy list",
  "max per order": "Within max per order",
  "monthly budget": "Within this month's budget",
  "max in one stock": "Within max in one stock",
  "shares held": "Enough shares held",
  "never sell at a loss": "Not a sale at a loss",
};

/* Small line icons, drawn with currentColor. */
const ICON = {
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h12"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  shieldX: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z"/><path d="m9.5 9.5 5 5m0-5-5 5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-1.5V4a1.5 1.5 0 0 1 3 0v6.5m0-4a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3.8 15a1.5 1.5 0 0 1 2.4-1.8L8 15"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (name: keyof typeof ICON) =>
  `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Attempt {
  at: string;
  order: { side: string; symbol: string; shares: string; rationale?: string };
  price: string;
  verdict: { ok: boolean; passed: string[]; violations: { rule: string; message: string }[]; warnings: { message: string }[] };
  proposed?: { id: string; book?: { bid: string | null; ask: string | null; last: string; live: boolean } };
}

type Outcome = { key: "filled" | "blocked" | "waiting" | "declined"; label: string };

/** Suggestion statuses: PROPOSED = open, FILLED = the investor recorded doing it, REJECTED = "Not now", EXPIRED = replaced. */
function outcome(blocked: boolean, intent: Intent | undefined): Outcome {
  if (blocked) return { key: "blocked", label: "Didn't fit the plan" };
  switch (intent?.status) {
    case "FILLED":
      return { key: "filled", label: intent.side === "BUY" ? "Bought" : "Sold" };
    case "PROPOSED":
      return { key: "waiting", label: "Suggested" };
    case "REJECTED":
      return { key: "declined", label: "Not now" };
    default:
      return { key: "declined", label: "Replaced" };
  }
}

const LEVEL_NAME = ["Low", "Medium", "High"];
const meter = (label: string, level: Level, chosen: boolean) =>
  `<div class="meter${chosen ? " chosen" : ""}"><span>${label}</span><div class="bars" aria-label="${label}: ${LEVEL_NAME[level]}">${[0, 1, 2]
    .map((i) => `<i class="${i <= level ? "on" : ""}"></i>`)
    .join("")}</div><b>${LEVEL_NAME[level]}</b></div>`;

export async function activityPage(db: Db, waId: string, quotes: Map<string, Quote>): Promise<string> {
  const user = await db.user(waId);
  const trail = await db.auditTrail(waId);
  const intents = new Map((await db.intentsFor(waId)).map((i) => [i.id, i]));
  const fills = new Map((await db.fillsFor(waId)).map((f) => [f.intentId, f]));
  const holdings = await db.holdings(waId);
  await refreshLive(quotes, holdings.map((h) => h.symbol));
  const valued = valueAll(holdings, quotes);

  // Each plan check is one attempt; a "suggested" right after it links it to the suggestion it became.
  const attempts: Attempt[] = [];
  let modelCalls = 0;
  let inTokens = 0;
  let outTokens = 0;
  const recorded = new Map<string, string>();
  for (const e of trail) {
    const d = e.detail as any;
    if (e.kind === "policy" && d?.order) attempts.push({ at: e.at, order: d.order, price: d.price, verdict: d.verdict });
    // "proposed"/"approved" are the older names, from before Sika stopped simulating trades.
    if ((e.kind === "suggested" || e.kind === "proposed") && attempts.length) attempts[attempts.length - 1]!.proposed = { id: d.id, book: d.book };
    if (e.kind === "recorded" || e.kind === "approved") recorded.set(d.id, e.at);
    if (e.kind === "model") {
      modelCalls++;
      inTokens += d?.usage?.prompt_tokens ?? 0;
      outTokens += d?.usage?.completion_tokens ?? 0;
    }
  }
  const cost = (inTokens / 1e6) * 1.25 + (outTokens / 1e6) * 4.25;

  const profile = user.profile?.done;
  const m = user.mandate;
  const first = user.name?.split(" ")[0];
  const title = first ? `${first}'s activity` : "Investor activity";

  const counts = { filled: 0, blocked: 0 };
  const cases = attempts
    .slice()
    .reverse()
    .map((a) => {
      const intent = a.proposed ? intents.get(a.proposed.id) : undefined;
      const fill = intent ? fills.get(intent.id) : undefined;
      const blocked = !a.verdict.ok;
      const out = outcome(blocked, intent);
      if (out.key === "filled") counts.filled++;
      if (out.key === "blocked") counts.blocked++;
      const buy = a.order.side === "BUY";
      const book = a.proposed?.book;
      const amount = fill ? money(fill.net) : intent ? money(intent.net) : null;

      const steps: string[] = [];
      const reason = intent?.rationale ?? a.order.rationale;
      if (reason) steps.push(`<li>${icon("spark")}<div><h4>Sika's AI suggested it</h4><blockquote>${esc(reason)}</blockquote></div></li>`);

      steps.push(
        `<li>${icon("book")}<div><h4>Priced from IC's ${book?.live ? "live " : ""}order book</h4>${
          book
            ? `<dl class="book"><div class="${buy ? "" : "use"}"><dt>Buyers</dt><dd>${book.bid ? money(book.bid) : "None"}</dd></div><div class="${buy ? "use" : ""}"><dt>Sellers</dt><dd>${book.ask ? money(book.ask) : "None"}</dd></div><div><dt>Last trade</dt><dd>${money(book.last)}</dd></div></dl><p class="fine">A ${buy ? "buy pays the sellers'" : "sale gets the buyers'"} price.</p>`
            : `<p>${a.price && a.price !== "0" ? `${buy ? "Sellers'" : "Buyers'"} price ${money(a.price)}.` : "Nobody was on the other side."}</p>`
        }</div></li>`,
      );

      const total = a.verdict.passed.length + a.verdict.violations.length;
      steps.push(
        `<li class="${blocked ? "bad" : ""}">${icon(blocked ? "shieldX" : "shield")}<div><h4>${
          blocked ? `Blocked: ${a.verdict.violations.length} of ${total} plan checks failed` : `${a.verdict.passed.length} of ${total} plan checks passed`
        }</h4>${a.verdict.violations.map((v) => `<p class="fail">${esc(v.message)}</p>`).join("")}${(blocked ? [] : a.verdict.warnings)
          .map((w) => `<p class="warn">${esc(w.message)}</p>`)
          .join("")}<details><summary>See every check</summary><ul class="checks">${[
          ...a.verdict.violations.map((v) => `<li class="no">${esc(RULE_NAMES[v.rule] ?? v.rule)}</li>`),
          ...a.verdict.passed.map((r) => `<li class="yes">${esc(RULE_NAMES[r] ?? r)}</li>`),
        ].join("")}</ul></details></div></li>`,
      );

      if (!blocked && intent) {
        steps.push(
          `<li>${icon("lock")}<div><h4>Shown to the investor</h4><p>${buy ? "Buy" : "Sell"} ${esc(intent.shares)} ${esc(intent.symbol)}, about ${money(intent.net)} ${buy ? "in total" : "after charges"}, with every charge. Sika doesn't place orders; the investor decides and uses their own broker.</p></div></li>`,
        );
        const recordedAt = recorded.get(intent.id);
        const decision =
          intent.status === "REJECTED"
            ? "The investor tapped Not now."
            : recordedAt
              ? `The investor tapped ${buy ? "I bought it" : "I sold it"} at ${esc(when(recordedAt))}.`
              : intent.status === "PROPOSED"
                ? "Open. The investor hasn't said whether they placed it."
                : "Replaced by a newer suggestion for this stock.";
        steps.push(`<li class="${recordedAt ? "" : "muted"}">${icon(recordedAt ? "hand" : "clock")}<div><h4>The investor's decision</h4><p>${decision}</p></div></li>`);
        if (fill) {
          steps.push(
            `<li class="good">${icon("check")}<div><h4>Added to holdings</h4><dl class="book fill"><div><dt>Shares</dt><dd>${esc(fill.shares)}</dd></div><div><dt>Price</dt><dd>${money(fill.price)}</dd></div><div><dt>Charges</dt><dd>${money(fill.charges)}</dd></div><div><dt>${buy ? "Paid" : "Received"}</dt><dd>${money(fill.net)}</dd></div></dl></div></li>`,
          );
        }
      }

      return `<article class="case" data-outcome="${out.key}">
        <header>
          <div><h3>${buy ? "Buy" : "Sell"} ${esc(a.order.shares)} ${esc(a.order.symbol)}</h3><time>${esc(when(a.at))}</time></div>
          <div class="right"><span class="chip ${out.key}">${out.label}</span>${amount ? `<span class="amount">${amount}</span>` : ""}</div>
        </header>
        <ol class="chain">${steps.join("")}</ol>
      </article>`;
    })
    .join("");

  const portfolio = valued.length
    ? `<div class="table"><table><thead><tr><th>Stock</th><th class="num">Shares</th><th class="num">Cost</th><th class="num">Worth now</th><th class="num">Profit after charges</th></tr></thead><tbody>${valued
        .map(
          (v) =>
            `<tr><td><b>${esc(v.symbol)}</b><small>${esc(v.name)}</small></td><td class="num">${esc(v.shares)}</td><td class="num">${money(v.cost)}</td><td class="num">${money(v.netIfSold)}<small>${v.basis === "bid" ? "at buyers' price" : "last trade (no buyers)"}</small></td><td class="num ${v.profit < 0n ? "down" : "up"}">${v.profit < 0n ? "−" : "+"}${money(v.profit < 0n ? -v.profit : v.profit)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<p class="empty">No holdings yet.</p>`;

  const profileHtml = profile
    ? `<section class="block">
        <h2>How the investor profile was decided</h2>
        <div class="profile">
          <div class="meters">${meter("Capacity for risk", profile.capacity, profile.capacity <= profile.willingness)}${meter("Willingness", profile.willingness, profile.willingness < profile.capacity)}</div>
          <p class="verdict">Profile: <b>${esc(profile.risk[0]!.toUpperCase() + profile.risk.slice(1))}</b>. Sika takes the lower of the two, worked out by fixed rules rather than the AI${profile.answers.horizon === "soon" ? ", and money needed within a year is always cautious" : ""}.</p>
          <ul class="answers">${QUESTIONS.map((q) => {
            const o = q.options.find((x) => x.id === profile.answers[q.id]);
            return o ? `<li><span>${q.measures === "capacity" ? "Capacity" : "Willingness"}</span>${esc(o.summary)}</li>` : "";
          }).join("")}</ul>
        </div>
      </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>Sika activity</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f4f5f2; --card: #ffffff; --ink: #0f1f17; --soft: #56655c; --hair: #e1e5df; --gold: #c3922e; --gold-ink: #fff;
    --up: #127a4a; --up-bg: #e3f4ea; --down: #b42318; --down-bg: #fdecea; --wait: #8a5a00; --wait-bg: #fbf1dc; --mute-bg: #eef0ec;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0c110e; --card: #141c17; --ink: #e8eee9; --soft: #93a39a; --hair: #253029; --gold: #d8a948; --gold-ink: #1a1405;
      --up: #5fd3a2; --up-bg: #12301f; --down: #ff8a80; --down-bg: #3a1714; --wait: #f0c169; --wait-bg: #33270d; --mute-bg: #1c2520;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0c110e; --card: #141c17; --ink: #e8eee9; --soft: #93a39a; --hair: #253029; --gold: #d8a948; --gold-ink: #1a1405;
    --up: #5fd3a2; --up-bg: #12301f; --down: #ff8a80; --down-bg: #3a1714; --wait: #f0c169; --wait-bg: #33270d; --mute-bg: #1c2520;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif; font-feature-settings: "tnum" 1; -webkit-font-smoothing: antialiased; }
  main { max-width: 820px; margin: 0 auto; padding: 40px 20px 72px; }
  :focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; border-radius: 6px; }

  .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; margin-bottom: 40px; }
  .mark { width: 28px; height: 28px; border-radius: 8px; background: var(--gold); color: var(--gold-ink); display: grid; place-items: center; font-weight: 700; font-size: 15px; }
  h1 { font-size: clamp(32px, 5vw, 44px); line-height: 1.08; letter-spacing: -.02em; font-weight: 600; margin: 0 0 12px; }
  .lede { color: var(--soft); font-size: 17px; max-width: 38rem; margin: 0 0 32px; }

  .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); background: var(--card); border: 1px solid var(--hair); border-radius: 18px; }
  .summary div { padding: 16px 18px; border-left: 1px solid var(--hair); min-width: 0; }
  .summary div:first-child { border-left: 0; }
  .summary dt { font-size: 13px; color: var(--soft); margin-bottom: 2px; }
  .summary dd { margin: 0; font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }
  @media (max-width: 680px) { .summary { grid-template-columns: 1fr 1fr; } .summary div:nth-child(3) { border-left: 0; } .summary div:nth-child(n+3) { border-top: 1px solid var(--hair); } }

  .block { margin-top: 56px; }
  .block-head { display: flex; justify-content: space-between; align-items: end; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  h2 { font-size: 21px; letter-spacing: -.01em; font-weight: 600; margin: 0; }
  .block > h2 { margin-bottom: 16px; }
  .filter { display: inline-flex; background: var(--mute-bg); border-radius: 999px; padding: 3px; }
  .filter button { border: 0; background: none; font: inherit; font-size: 14px; color: var(--soft); padding: 6px 14px; border-radius: 999px; cursor: pointer; }
  .filter button[aria-pressed="true"] { background: var(--card); color: var(--ink); font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }

  .case { background: var(--card); border: 1px solid var(--hair); border-radius: 18px; padding: 20px 22px 8px; margin-bottom: 14px; }
  .case[hidden] { display: none; }
  .case header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid var(--hair); }
  .case h3 { margin: 0; font-size: 18px; font-weight: 600; }
  .case time { font-size: 13px; color: var(--soft); }
  .right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; text-align: right; }
  .amount { font-weight: 600; }
  .chip { font-size: 13px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .chip.filled { color: var(--up); background: var(--up-bg); }
  .chip.blocked { color: var(--down); background: var(--down-bg); }
  .chip.waiting { color: var(--wait); background: var(--wait-bg); }
  .chip.declined { color: var(--soft); background: var(--mute-bg); }

  ol.chain { list-style: none; margin: 0; padding: 6px 0 0; }
  ol.chain > li { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; position: relative; padding: 12px 0; }
  ol.chain > li::before { content: ""; position: absolute; left: 16px; top: 44px; bottom: -12px; width: 2px; background: var(--hair); }
  ol.chain > li:last-child::before { display: none; }
  .ic { width: 34px; height: 34px; padding: 7px; border-radius: 50%; background: var(--mute-bg); color: var(--ink); position: relative; z-index: 1; }
  ol.chain > li.bad .ic { background: var(--down-bg); color: var(--down); }
  ol.chain > li.good .ic { background: var(--up-bg); color: var(--up); }
  ol.chain > li.muted .ic { color: var(--soft); }
  h4 { margin: 6px 0 4px; font-size: 15px; font-weight: 600; }
  ol.chain p { margin: 0; color: var(--soft); font-size: 15px; }
  blockquote { margin: 4px 0 0; padding: 10px 14px; background: var(--mute-bg); border-radius: 12px; color: var(--ink); font-size: 15px; }
  .fine { font-size: 13px !important; margin-top: 6px !important; }
  p.fail { color: var(--down); font-weight: 500; margin-top: 4px; }
  p.warn { color: var(--wait); margin-top: 4px; }
  dl.book { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 6px 0 0; }
  dl.book.fill { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  dl.book div { background: var(--mute-bg); border-radius: 12px; padding: 8px 12px; border: 1.5px solid transparent; }
  dl.book div.use { border-color: var(--gold); }
  dl.book dt { font-size: 12px; color: var(--soft); }
  dl.book dd { margin: 0; font-weight: 600; font-size: 15px; }
  @media (max-width: 520px) { dl.book.fill { grid-template-columns: 1fr 1fr; } }
  details { margin-top: 8px; font-size: 14px; }
  summary { cursor: pointer; color: var(--soft); width: max-content; }
  ul.checks { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px 16px; }
  ul.checks li { padding-left: 22px; position: relative; }
  ul.checks li::before { position: absolute; left: 0; font-weight: 700; }
  ul.checks .yes::before { content: "✓"; color: var(--up); }
  ul.checks .no { color: var(--down); }
  ul.checks .no::before { content: "✕"; }

  .table { background: var(--card); border: 1px solid var(--hair); border-radius: 18px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--hair); vertical-align: top; }
  tbody tr:last-child td { border-bottom: 0; }
  th { font-weight: 500; color: var(--soft); font-size: 13px; }
  .num { text-align: right; }
  td small { display: block; color: var(--soft); font-size: 12px; font-weight: 400; }
  td.up { color: var(--up); font-weight: 600; } td.down { color: var(--down); font-weight: 600; }

  .profile { background: var(--card); border: 1px solid var(--hair); border-radius: 18px; padding: 20px 22px; }
  .meters { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .meter { background: var(--mute-bg); border-radius: 14px; padding: 12px 14px; display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; border: 1.5px solid transparent; }
  .meter.chosen { border-color: var(--gold); }
  .meter span { font-size: 13px; color: var(--soft); grid-column: 1 / -1; }
  .bars { display: flex; gap: 4px; align-items: center; }
  .bars i { width: 28px; height: 8px; border-radius: 4px; background: var(--hair); }
  .bars i.on { background: var(--ink); }
  .meter.chosen .bars i.on { background: var(--gold); }
  .meter b { font-size: 15px; }
  .verdict { margin: 14px 0 10px; color: var(--soft); }
  .verdict b { color: var(--ink); }
  ul.answers { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  ul.answers li { display: grid; grid-template-columns: 100px 1fr; gap: 10px; font-size: 15px; }
  ul.answers span { font-size: 13px; color: var(--soft); padding-top: 1px; }
  @media (max-width: 520px) { .meters { grid-template-columns: 1fr; } }

  .empty { color: var(--soft); background: var(--card); border: 1px dashed var(--hair); border-radius: 18px; padding: 24px; text-align: center; margin: 0; }
</style>
</head>
<body>
<main>
  <div class="brand"><span class="mark" aria-hidden="true">S</span>Sika</div>
  <h1>${esc(title)}</h1>
  <p class="lede">Every step behind each suggestion: what Sika's AI suggested, how it was priced and checked against the plan, and what the investor did.</p>
  <dl class="summary">
    <div><dt>Profile</dt><dd>${profile ? esc(profile.risk[0]!.toUpperCase() + profile.risk.slice(1)) : "Not set"}</dd></div>
    <div><dt>Plan</dt><dd>${m ? `${esc(m.goal)}${m.monthlyContributionCedis ? `, GHS ${esc(m.monthlyContributionCedis.toLocaleString("en-GH"))}/mo` : ""}` : "Not set"}</dd></div>
    <div><dt>Limits</dt><dd>${m ? `${m.maxPositionPercent}% per stock, GHS ${esc(m.maxOrderCedis.toLocaleString("en-GH"))} per order` : "Not set"}</dd></div>
    <div><dt>AI cost so far</dt><dd>$${cost.toFixed(3)} <span style="font-weight:400;color:var(--soft)">· ${modelCalls} calls</span></dd></div>
  </dl>

  <section class="block">
    <div class="block-head">
      <h2>Suggestions</h2>
      ${
        attempts.length
          ? `<div class="filter" role="group" aria-label="Filter suggestions"><button type="button" data-f="all" aria-pressed="true">All ${attempts.length}</button><button type="button" data-f="filled" aria-pressed="false">Bought or sold ${counts.filled}</button><button type="button" data-f="blocked" aria-pressed="false">Didn't fit ${counts.blocked}</button></div>`
          : ""
      }
    </div>
    ${cases || `<p class="empty">No suggestions yet. Ask Sika to invest this month's money, or try to break a limit.</p>`}
  </section>

  <section class="block">
    <h2>Portfolio now</h2>
    ${portfolio}
  </section>

  ${profileHtml}

</main>
<script>
  document.querySelectorAll(".filter button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".filter button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    const f = b.dataset.f;
    document.querySelectorAll(".case").forEach((c) => { c.hidden = f !== "all" && c.dataset.outcome !== f; });
  }));
</script>
</body>
</html>`;
}
