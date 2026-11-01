import { metaClient } from "../agent/meta";
import { Db } from "../db";
import type { Sender } from "../handle";
import type { Env } from "../index";
import { fetchQuotes } from "../market/quotes";
import { searchNewsItems, type NewsItem } from "./search";

/** At most this many news messages per investor per day; more waits for "More news". */
export const NEWS_PER_DAY = 2;
/** Stocks searched per run, most-watched first (each is one web-search call). */
export const SYMBOLS_PER_RUN = 25;
/** Articles older than this aren't pushed, even if new to Sika. */
const MAX_AGE_DAYS = 2;

/** Words in a headline that say what happened (not the company's name or filler). */
function headlineWords(title: string, ignore: Set<string>): Set<string> {
  return new Set((title.toLowerCase().match(/[\p{L}\d]+/gu) ?? []).filter((w) => w.length > 2 && !ignore.has(w)));
}

/** True when two headlines share most of their words: the same story from another outlet. */
export function sameStory(a: string, b: string, companyWords: Set<string> = new Set()): boolean {
  const ignore = new Set([...companyWords, "the", "and", "for", "with", "from", "its", "has", "have", "plc", "ltd", "limited", "ghana", "group"]);
  const x = headlineWords(a, ignore);
  const y = headlineWords(b, ignore);
  if (x.size === 0 || y.size === 0) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.6;
}

export interface Button {
  id: string;
  title: string;
}

/**
 * Which newly seen articles to push. The first search for a stock only records what's already out
 * there (so following a stock doesn't bring a flood of old news); after that, only material news that
 * isn't stale.
 */
export function pushable(
  fresh: NewsItem[],
  symbolSeenBefore: boolean,
  knownTitles: string[] = [],
  companyWords: Set<string> = new Set(),
  now = new Date(),
): NewsItem[] {
  if (!symbolSeenBefore) return [];
  const out: NewsItem[] = [];
  for (const i of fresh) {
    if (!i.material) continue;
    // Undated articles can't be told apart from old ones; dated ones must be recent.
    const at = i.date ? Date.parse(i.date) : NaN;
    if (Number.isNaN(at) || now.getTime() - at > MAX_AGE_DAYS * 86_400_000) continue;
    if ([...knownTitles, ...out.map((o) => o.title)].some((t) => sameStory(t, i.title, companyWords))) continue;
    out.push(i);
  }
  return out;
}

export function newsMessage(symbol: string, item: NewsItem, following: boolean): { text: string; buttons: Button[] } {
  return {
    text: `📰 *${symbol}*: ${item.title}${item.date ? ` _(${item.date})_` : ""}\n${item.summary}\n\nSource: ${item.url}`,
    buttons: [
      { id: `news:more:${symbol}`, title: "More news" },
      following ? { id: `follow:off:${symbol}`, title: `Unfollow ${symbol}`.slice(0, 20) } : { id: "flow:menu", title: "Menu" },
      { id: "news:mute", title: "Stop news alerts" },
    ],
  };
}

export async function shortHash(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Outside WhatsApp's 24-hour window only an approved template gets through. Saves the update and sends
 * the template; its "Show me" tap (update:show:<id>) opens the window and shows the update.
 * False when no template is configured: the caller skips the update, as before.
 */
export async function notifyOutsideWindow(
  env: Env,
  db: Db,
  send: Sender,
  u: { waId: string; kind: "news" | "price"; symbol: string; headline: string; payload: unknown },
): Promise<boolean> {
  if (!env.WA_UPDATE_TEMPLATE) {
    await db.audit(u.waId, "update_skipped", { reason: "outside WhatsApp's 24-hour window and no template set", kind: u.kind, symbol: u.symbol });
    return false;
  }
  const id = crypto.randomUUID();
  await db.savePending({ id, waId: u.waId, kind: u.kind, symbol: u.symbol, payload: u.payload });
  await send.template(u.waId, env.WA_UPDATE_TEMPLATE, [u.symbol, u.headline], `update:show:${id}`);
  await db.audit(u.waId, "update_template", { id, kind: u.kind, symbol: u.symbol, headline: u.headline });
  return true;
}

/** Twice a weekday: searches news for every held or followed stock and tells the investors who watch it. */
export async function checkNews(env: Env, send: Sender): Promise<void> {
  const db = new Db(env.DB);
  const watch = await db.newsWatch();
  if (watch.size === 0) return;
  const names = new Map((await fetchQuotes()).map((q) => [q.symbol, q.name]));
  const meta = metaClient(env.MODEL_API_KEY);
  const symbols = [...watch.keys()].sort((a, b) => watch.get(b)!.length - watch.get(a)!.length).slice(0, SYMBOLS_PER_RUN);

  for (const symbol of symbols) {
    const company = names.get(symbol) ?? symbol;
    const companyWords = new Set([symbol.toLowerCase(), ...(company.toLowerCase().match(/[\p{L}\d]+/gu) ?? [])]);
    const known = await db.recentNewsTitles(symbol);
    let items: NewsItem[];
    try {
      items = await searchNewsItems(meta, env.META_MODEL, symbol, company, known);
    } catch (err) {
      console.error("news search failed", symbol, err);
      continue;
    }
    const seenBefore = await db.hasSeenNews(symbol);
    // One story per stock per run: several articles at once are usually the same event.
    const toPush = pushable(await db.markNewsSeen(symbol, items), seenBefore, known, companyWords).slice(0, 1);

    for (const item of toPush) {
      const key = `news:${symbol}:${await shortHash(item.url)}`;
      for (const waId of watch.get(symbol)!) {
        if ((await db.newsPushesToday(waId)) >= NEWS_PER_DAY) continue;
        const inWindow = await db.inServiceWindow(waId);
        if (!inWindow && !env.WA_UPDATE_TEMPLATE) continue;
        if (!(await db.claimAlert(waId, key))) continue;

        const msg = newsMessage(symbol, item, (await db.follows(waId)).includes(symbol));
        if (inWindow) {
          await db.addMessage(waId, "assistant", msg.text);
          await send.buttons(waId, msg.text, msg.buttons);
          await db.audit(waId, "news_alert", { symbol, url: item.url, title: item.title });
        } else {
          await notifyOutsideWindow(env, db, send, { waId, kind: "news", symbol, headline: `news: ${item.title}`.slice(0, 120), payload: msg });
        }
      }
    }
  }
}
