import type OpenAI from "openai";
import { z } from "zod";
import type { Db, User } from "../db";
import { charges, ghs, lowestSellPrice, maxSharesFor, percent, toPesewas } from "../fees/engine";
import { suggest, suggestionButtons } from "../intents/service";
import { fingerprint } from "../intents/sign";
import { Mandate, mandateCard } from "../mandate/schema";
import { compareStocks } from "../market/compare";
import { refreshLive, withLiveBook, type Quote } from "../market/quotes";
import { searchNews } from "../news/search";
import { holdingsDraftCard, portfolioCard, valueAll } from "../portfolio/format";
import { costHolding, type HoldingInput } from "../portfolio/holdings";

/** Something to send after the agent's text, e.g. a card with buttons. */
export interface Outgoing {
  text: string;
  buttons?: { id: string; title: string }[];
}

export interface ToolContext {
  db: Db;
  user: User;
  quotes: Map<string, Quote>;
  meta: OpenAI;
  model: string;
  outbox: Outgoing[];
  /** Links tools returned this turn: the only ones the agent may show (see runAgent). */
  sources: Set<string>;
}

/** Models sometimes send "null" or "" for an empty optional field. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "null" || v === "" ? null : v), schema.nullish());

const HoldingInputSchema = z.object({
  symbol: z.string().describe("GSE ticker, e.g. MTNGH"),
  shares: z.number().int().positive(),
  pricePaidCedis: optional(z.number().positive()).describe("Price per share they paid, if they said it"),
  totalPaidCedis: optional(z.number().positive()).describe("Total they paid for all these shares, if they said it"),
});

const Args = {
  get_quotes: z.object({ symbols: z.array(z.string()).min(1).max(20) }),
  fee_preview: z.object({
    side: z.enum(["BUY", "SELL"]),
    symbol: z.string(),
    shares: optional(z.coerce.number().int().positive()).describe("Number of shares. Leave out when giving cashCedis"),
    cashCedis: optional(z.coerce.number().positive()).describe("BUY only: spend up to this much, charges included; Sika finds the most shares it buys"),
    priceCedis: optional(z.coerce.number().positive()).describe("Price per share; leave out for the last traded price"),
  }),
  get_portfolio: z.object({}),
  compare_stocks: z.object({
    symbols: z.array(z.string()).min(2).max(4),
    amountCedis: optional(z.coerce.number().positive()).describe("Optional: what this amount (charges included) buys in each stock"),
  }),
  search_news: z.object({ query: z.string().min(3).max(200) }),
  follow_stock: z.object({ symbol: z.string() }),
  unfollow_stock: z.object({ symbol: z.string() }),
  save_mandate_draft: z.object({ mandate: Mandate }),
  record_holdings: z.object({ holdings: z.array(HoldingInputSchema).min(1).max(30) }),
  remove_holding: z.object({ symbol: z.string() }),
  suggest_trade: z.object({
    side: z.enum(["BUY", "SELL"]),
    symbol: z.string(),
    shares: optional(z.coerce.number().int().positive()).describe("Whole shares. Leave out for a BUY sized by cashCedis"),
    cashCedis: optional(z.coerce.number().positive()).describe("BUY only: spend up to this much including charges"),
    rationale: z.string().min(10).max(600).describe("2-4 plain sentences: why this fits their goal and mandate, the main risk, and any news you used (with source)"),
  }),
};
type ToolName = keyof typeof Args;

const DESCRIPTIONS: Record<ToolName, string> = {
  get_quotes: "GSE prices from IC Securities: best bid (what a seller gets), best ask (what a buyer pays), last trade, previous close, shares traded today. Always use this; never guess a price.",
  fee_preview:
    "Exact IC Securities charges for a buy or sell, to the pesewa, with the fee tier. For a BUY, also the break-even sell price. Give shares, or cashCedis to find how many shares that buys.",
  get_portfolio: "The user's saved holdings valued at the last price after sell charges, with break-even prices.",
  compare_stocks:
    "Compare 2-4 GSE stocks side by side from the live order books: bid, ask, last trade, change today, spread, shares traded, how each fits the investor's plan (never-buy list, preferred, room under the per-stock limit), their holding if any, and optionally what an amount buys in each. For company fundamentals or recent events, also call search_news and cite its sources. Lay out the trade-offs; don't pick a winner for them.",
  search_news:
    "Search the web for recent news about a GSE company or Ghana's market. Returns a summary and sources (title and url). When you share news, end with up to 3 of these sources as '• Title: url'. Never write a link that isn't in sources.",
  follow_stock: "Follow a GSE stock: Sika messages the investor when there is important news about it. Stocks they hold are watched automatically.",
  unfollow_stock: "Stop following a stock's news.",
  save_mandate_draft:
    "Save the investor's mandate once you know their goal, time frame, risk, monthly amount, max % per stock and max per order. Sika then shows it as a card with Confirm/Change buttons. Afterwards, stop and wait for their tap.",
  record_holdings:
    "Save what the user says they own. Use the ticker, whole shares, and either the price per share or the total they paid (null if they don't know). Sika shows the list with Looks right/Fix buttons. Afterwards, stop and wait.",
  remove_holding: "Remove a holding the user says they sold or never had.",
  suggest_trade:
    "Suggest a trade the investor could place with their own broker. Sika prices it from the live order book and checks it against their plan (budget, per-order and per-stock limits, never-buy list, never sell at a loss). If it fits, Sika sends a suggestion card with every charge and I bought it/Why?/Not now buttons; stop with one short line. If it doesn't fit, you get the reasons: explain them plainly and, if sensible, suggest a version that fits. Sika never places orders.",
};

export const TOOL_DEFS: OpenAI.Chat.Completions.ChatCompletionTool[] = (Object.keys(Args) as ToolName[]).map((name) => {
  const { $schema: _, ...parameters } = z.toJSONSchema(Args[name]) as Record<string, unknown>;
  return { type: "function", function: { name, description: DESCRIPTIONS[name], parameters } };
});

const price = (q: Quote) => ({
  symbol: q.symbol,
  name: q.name,
  bestBid: q.bid ? `${ghs(q.bid)}${q.bidVolume !== null ? ` for ${q.bidVolume} shares` : ""}` : "no buyers",
  bestAsk: q.ask ? `${ghs(q.ask)}${q.askVolume !== null ? ` for ${q.askVolume} shares` : ""}` : "no sellers",
  lastTrade: ghs(q.last),
  previousClose: ghs(q.prevClose),
  sharesTradedToday: q.volume,
  source: q.recordedAt ? `IC order book recorded ${q.recordedAt.slice(0, 16)} GMT (replay: the market is closed)` : q.live ? "IC live order book" : `IC snapshot (${q.quality.toLowerCase()})`,
});

/** Live order book for a stock the model asked about (keeps the snapshot if it can't be read). */
async function live(ctx: ToolContext, q: Quote): Promise<Quote> {
  if (q.live) return q;
  const fresh = await withLiveBook(q);
  ctx.quotes.set(q.symbol, fresh);
  return fresh;
}

function quoteFor(ctx: ToolContext, symbol: string): Quote {
  const q = ctx.quotes.get(symbol.toUpperCase());
  if (!q) throw new Error(`Unknown ticker ${symbol}. Use one from the list in your instructions.`);
  return q;
}

function cedisToPesewas(value: number): bigint {
  const p = toPesewas(value.toFixed(2));
  if (p === null) throw new Error(`Bad amount ${value}`);
  return p;
}

const handlers: { [K in ToolName]: (args: z.infer<(typeof Args)[K]>, ctx: ToolContext) => Promise<unknown> } = {
  async get_quotes({ symbols }, ctx) {
    return Promise.all(
      symbols.map(async (s, i) => {
        const q = ctx.quotes.get(s.toUpperCase());
        if (!q) return { symbol: s, error: "not a GSE ticker" };
        return price(i < 5 ? await live(ctx, q) : q);
      }),
    );
  },

  async fee_preview({ side, symbol, shares, cashCedis, priceCedis }, ctx) {
    const q = await live(ctx, quoteFor(ctx, symbol));
    const market = side === "BUY" ? q.ask : q.bid;
    if (priceCedis == null && market === null) return { ...price(q), result: side === "BUY" ? "Nobody is selling right now" : "Nobody is bidding right now" };
    const unit = priceCedis != null ? cedisToPesewas(priceCedis) : market!;
    // A cash amount wins: the engine finds the exact maximum rather than the model guessing a share count.
    let qty = side === "BUY" && cashCedis != null ? null : shares != null ? BigInt(shares) : null;
    if (qty === null) {
      if (side !== "BUY" || cashCedis == null) throw new Error("Give shares, or cashCedis for a BUY");
      qty = maxSharesFor(cedisToPesewas(cashCedis), unit);
      if (qty === 0n) return { symbol: q.symbol, price: ghs(unit), result: `${ghs(cedisToPesewas(cashCedis))} doesn't buy one share after charges` };
    }
    const c = charges(side, qty, unit);
    return {
      symbol: q.symbol,
      side,
      shares: qty.toString(),
      price: ghs(unit),
      gross: ghs(c.gross),
      charges: c.lines.map((l) => `${l.name} ${ghs(l.pesewas)}`),
      totalCharges: ghs(c.total),
      tier: `${percent(c.allInBps)} all-in`,
      [side === "BUY" ? "totalToPay" : "netProceeds"]: ghs(c.net),
      ...(side === "BUY" ? { breakEvenSellPrice: ghs(lowestSellPrice(qty, c.net)) } : {}),
    };
  },

  async get_portfolio(_args, ctx) {
    const holdings = await ctx.db.holdings(ctx.user.waId);
    await refreshLive(ctx.quotes, holdings.map((h) => h.symbol));
    const valuations = valueAll(holdings, ctx.quotes);
    return {
      summary: portfolioCard(valuations),
      holdings: valuations.map((v) => ({
        symbol: v.symbol,
        shares: v.shares.toString(),
        cost: ghs(v.cost),
        costSource: v.source,
        valuedAt: `${ghs(v.price)} (${v.basis === "bid" ? "best bid" : "last trade; no buyers now"})`,
        netIfSoldNow: ghs(v.netIfSold),
        profitAfterFees: ghs(v.profit),
        profitPercent: percent(v.profitBps),
        breakEvenPrice: ghs(v.breakEven),
      })),
    };
  },

  async compare_stocks({ symbols, amountCedis }, ctx) {
    const holdings = await ctx.db.holdings(ctx.user.waId);
    const wanted = [...new Set([...symbols.map((s) => s.toUpperCase()), ...holdings.map((h) => h.symbol)])].filter((s) => ctx.quotes.has(s));
    await refreshLive(ctx.quotes, wanted);
    const mandate = ctx.user.mandateConfirmed ? ctx.user.mandate : null;
    return compareStocks(symbols, ctx.quotes, holdings, mandate, amountCedis != null ? cedisToPesewas(amountCedis) : null);
  },

  async search_news({ query }, ctx) {
    const r = await searchNews(ctx.meta, ctx.model, query);
    for (const src of r.sources) ctx.sources.add(src.url);
    return r;
  },

  async follow_stock({ symbol }, ctx) {
    const q = quoteFor(ctx, symbol);
    await ctx.db.follow(ctx.user.waId, q.symbol);
    return { following: q.symbol, note: "Tell them you'll message them when there's important news on it, and they can say 'unfollow' any time." };
  },

  async unfollow_stock({ symbol }, ctx) {
    const sym = symbol.toUpperCase();
    const removed = await ctx.db.unfollow(ctx.user.waId, sym);
    const held = (await ctx.db.holdings(ctx.user.waId)).some((h) => h.symbol === sym);
    if (!removed && !held) return { error: `They weren't following ${sym}` };
    return {
      unfollowed: sym,
      ...(held ? { note: "They still hold it, so important news on it can still come. Tapping 'Stop news alerts' on a news message turns all of them off." } : {}),
    };
  },

  async save_mandate_draft({ mandate }, ctx) {
    const unknown = [...mandate.preferredSymbols, ...mandate.excludedSymbols].filter((s) => !ctx.quotes.has(s));
    if (unknown.length) return { saved: false, error: `Not GSE tickers: ${unknown.join(", ")}. Use tickers from the list.` };
    await ctx.db.saveMandateDraft(ctx.user.waId, mandate);
    ctx.outbox.push({
      text: mandateCard(mandate, ctx.user.profile?.done?.risk),
      buttons: [
        { id: `mandate:confirm:${await fingerprint(mandate)}`, title: "Confirm" },
        { id: "mandate:change", title: "Change something" },
      ],
    });
    return { shown: "Mandate card with Confirm/Change buttons will be sent after your message. Keep your message to one short line." };
  },

  async record_holdings({ holdings }, ctx) {
    const draft: HoldingInput[] = holdings.map((h) => ({ ...h, symbol: h.symbol.toUpperCase() }));
    const results = draft.map((h) => costHolding(h, ctx.quotes));
    const errors = results.flatMap((r) => (r.ok ? [] : [r.error]));
    if (errors.length) return { saved: false, errors, hint: "Ask the user to clarify, then call again with the full list." };
    await ctx.db.saveHoldingsDraft(ctx.user.waId, draft);
    ctx.outbox.push({
      text: holdingsDraftCard(draft, ctx.quotes),
      buttons: [
        { id: `holdings:confirm:${await fingerprint(draft)}`, title: "Looks right" },
        { id: "holdings:fix", title: "Fix something" },
      ],
    });
    return { shown: "List with Looks right/Fix buttons will be sent after your message. It is NOT saved until they tap Looks right. Keep your message to one short line, e.g. 'Please check this:'." };
  },

  async suggest_trade({ side, symbol, shares, cashCedis, rationale }, ctx) {
    const q = await live(ctx, quoteFor(ctx, symbol));
    let qty: bigint;
    if (side === "BUY" && cashCedis != null) {
      if (q.ask === null) return { suggested: false, error: `Nobody is selling ${q.symbol} right now.` };
      qty = maxSharesFor(cedisToPesewas(cashCedis), q.ask);
    }
    else if (shares != null) qty = BigInt(shares);
    else throw new Error("Give shares, or cashCedis for a BUY");
    if (qty === 0n) return { suggested: false, error: "That amount doesn't buy one share after charges." };

    const result = await suggest({ db: ctx.db, user: ctx.user, quotes: ctx.quotes }, { side, symbol: q.symbol, shares: qty, rationale });
    if (!result.ok) return { suggested: false, doesntFitPlan: result.violations, warnings: result.warnings };
    ctx.outbox.push({
      text: result.card,
      buttons: suggestionButtons(result.intent),
    });
    return { suggested: true, shares: qty.toString(), expectedTotal: ghs(result.intent.net), shown: "Suggestion card sent after your message. Keep your message to one short line; don't repeat the numbers." };
  },

  async remove_holding({ symbol }, ctx) {
    const removed = await ctx.db.removeHolding(ctx.user.waId, symbol.toUpperCase());
    return removed ? { removed: symbol.toUpperCase() } : { error: `No ${symbol} holding saved` };
  },
};

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<unknown> {
  if (!(name in Args)) return { error: `Unknown tool ${name}` };
  const tool = name as ToolName;
  let json: unknown;
  try {
    json = JSON.parse(rawArgs || "{}");
  } catch {
    return { error: "Arguments were not valid JSON" };
  }
  const parsed = Args[tool].safeParse(json);
  if (!parsed.success) return { error: "Invalid arguments", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (handlers[tool] as any)(parsed.data, ctx);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
