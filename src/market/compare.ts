import { charges, ghs, maxSharesFor, percent } from "../fees/engine";
import type { Mandate } from "../mandate/schema";
import type { Holding } from "../portfolio/holdings";
import { value } from "../portfolio/holdings";
import { liquidity, type SessionActivity } from "./activity";
import { IMPLAUSIBLE_YIELD_BPS, trailingDividend, type CompanyProfile } from "./profile";
import { markPrice, type Quote } from "./quotes";

/** Extra facts per stock: what the company is and pays (web, cited) and how often it trades (recorded IC data). */
export interface StockExtras {
  profile?: CompanyProfile | null;
  activity?: SessionActivity | null;
}

const cedisToPesewas = (c: number) => BigInt(Math.round(c * 100));

/** Market cap and dividend yield, worked out from the live price (Sika's own sums, not the web's). */
export function valuation(q: Quote, p: CompanyProfile | null | undefined, now = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  if (p?.sharesOutstanding) {
    const cap = q.last * BigInt(Math.round(p.sharesOutstanding));
    out.marketCap = `about ${ghs(cap)} (${Math.round(p.sharesOutstanding).toLocaleString("en-GH")} shares × last trade ${ghs(q.last)})`;
  }
  const dps = trailingDividend(p, now);
  if (dps === 0) out.dividendYield = "none: no dividend in the last 12 months";
  else if (dps && q.last > 0n) {
    const yieldBps = (cedisToPesewas(dps) * 10_000n) / q.last;
    out.dividendYield =
      yieldBps > IMPLAUSIBLE_YIELD_BPS
        ? `not shown: the web's dividend figure (GHS ${dps.toFixed(2)} a share) gives ${percent(yieldBps)}, which looks wrong; check the company's latest dividend notice`
        : `${percent(yieldBps)} (GHS ${dps.toFixed(2)} a share over the last 12 months ÷ last trade)`;
  } else if (p?.dividends?.last12MonthsPerShareCedis) out.dividendYield = "not shown: the web's 12-month dividend figure isn't recent enough to trust";
  if (p?.peRatio) out.peRatio = `${p.peRatio.toFixed(1)} (as reported)`;
  return out;
}

/** Spreads wider than this (as a share of the ask) are flagged: buying and selling straight back loses that much. */
export const WIDE_SPREAD_BPS = 500n;

const signed = (bps: bigint) => (bps < 0n ? `-${percent(-bps)}` : `+${percent(bps)}`);

/**
 * The most a new buy (gross, before charges) can add to a stock before it passes the plan's per-stock
 * limit, valued like the rules engine does (best bid, or last trade). Null when the limit doesn't apply yet
 * (fewer than two holdings after the buy) or there is no plan.
 */
export function roomUnderLimit(symbol: string, holdings: Holding[], quotes: Map<string, Quote>, m: Mandate | null): bigint | null {
  if (!m) return null;
  const others = holdings.filter((h) => h.symbol !== symbol);
  if (others.length === 0) return null;
  const mv = (h: Holding) => {
    const q = quotes.get(h.symbol);
    return h.shares * (q ? markPrice(q) : 0n);
  };
  const held = holdings.find((h) => h.symbol === symbol);
  const position = held ? mv(held) : 0n;
  const total = others.reduce((s, h) => s + mv(h), 0n) + position;
  const p = BigInt(m.maxPositionPercent);
  if (p >= 100n) return null;
  // (position + x) / (total + x) <= p/100  →  x <= (p·total − 100·position) / (100 − p)
  const room = (p * total - 100n * position) / (100n - p);
  return room > 0n ? room : 0n;
}

export function compareStocks(
  symbols: string[],
  quotes: Map<string, Quote>,
  holdings: Holding[],
  mandate: Mandate | null,
  amount: bigint | null,
  extras: Map<string, StockExtras> = new Map(),
): unknown[] {
  return symbols.map((raw) => {
    const symbol = raw.toUpperCase();
    const q = quotes.get(symbol);
    if (!q) return { symbol: raw, error: "not a GSE ticker" };

    const changeBps = q.prevClose > 0n ? ((q.last - q.prevClose) * 10_000n) / q.prevClose : 0n;
    const spreadBps = q.bid !== null && q.ask !== null && q.ask > 0n ? ((q.ask - q.bid) * 10_000n) / q.ask : null;
    const held = holdings.find((h) => h.symbol === symbol);
    const room = roomUnderLimit(symbol, holdings, quotes, mandate);

    let forAmount: Record<string, string> | undefined;
    if (amount !== null) {
      if (q.ask === null) forAmount = { result: "nobody is selling right now" };
      else {
        const shares = maxSharesFor(amount, q.ask);
        if (shares === 0n) forAmount = { result: `${ghs(amount)} doesn't buy one share after charges` };
        else {
          const c = charges("BUY", shares, q.ask);
          forAmount = { shares: shares.toString(), atAsk: ghs(q.ask), totalCharges: ghs(c.total), totalToPay: ghs(c.net), tier: `${percent(c.allInBps)} all-in` };
        }
      }
    }

    let holding: Record<string, string> | undefined;
    if (held) {
      const v = value(held, q);
      holding = { shares: held.shares.toString(), cost: ghs(v.cost), netIfSoldNow: ghs(v.netIfSold), profitAfterFees: `${ghs(v.profit < 0n ? -v.profit : v.profit)} ${v.profit < 0n ? "loss" : "gain"} (${signed(v.profitBps)})` };
    }

    const x = extras.get(symbol);
    const p = x?.profile;
    const about = p
      ? {
          ...(p.sector ? { sector: p.sector } : {}),
          ...(p.industry ? { industry: p.industry } : {}),
          ...(p.business ? { business: p.business } : {}),
        }
      : null;
    const dividends = p?.dividends
      ? {
          ...(p.dividends.lastPerShareCedis ? { last: `GHS ${p.dividends.lastPerShareCedis.toFixed(2)} a share${p.dividends.lastPaid ? ` (${p.dividends.lastPaid})` : ""}` } : {}),
          ...(p.dividends.note ? { note: p.dividends.note } : {}),
        }
      : null;
    const val = valuation(q, p);

    return {
      symbol,
      name: q.name,
      ...(about && Object.keys(about).length ? { about } : {}),
      ...(Object.keys(val).length ? { valuation: val } : {}),
      ...(dividends && Object.keys(dividends).length ? { dividends } : {}),
      ...(p?.latestResults?.summary ? { latestResults: `${p.latestResults.period ? `${p.latestResults.period}: ` : ""}${p.latestResults.summary}` } : {}),
      ...(p?.recentNews?.length ? { recentNews: p.recentNews.map((n) => `${n.title}${n.date ? ` (${n.date})` : ""}: ${n.url}`) } : {}),
      liquidity: liquidity(q, x?.activity ?? null, amount),
      ...(p ? { companyFactsFrom: `the web, as of ${p.fetchedAt.slice(0, 10)}: ${p.sources.map((s) => s.url).join(" ") || "sources not given"}` } : {}),
      bestBid: q.bid !== null ? ghs(q.bid) : "no buyers",
      bestAsk: q.ask !== null ? ghs(q.ask) : "no sellers",
      lastTrade: ghs(q.last),
      changeToday: signed(changeBps),
      spread: spreadBps === null ? "no two-sided market right now" : `${percent(spreadBps)} of the ask${spreadBps > WIDE_SPREAD_BPS ? " (wide: buying and selling back straight away loses about this much)" : ""}`,
      sharesTradedToday: q.volume,
      tradable: q.tradable,
      planFit: mandate
        ? {
            onNeverBuyList: mandate.excludedSymbols.includes(symbol),
            preferred: mandate.preferredSymbols.includes(symbol),
            roomUnderPerStockLimit: room === null ? `no per-stock limit until you own two or more stocks` : `${ghs(room)} more before it passes your ${mandate.maxPositionPercent}% limit`,
            maxPerOrder: ghs(BigInt(Math.round(mandate.maxOrderCedis * 100))),
          }
        : "no plan yet",
      ...(holding ? { yourHolding: holding } : {}),
      ...(forAmount ? { forAmount } : {}),
      source: q.recordedAt ? `IC order book recorded ${q.recordedAt.slice(0, 16)} GMT (replay)` : q.live ? "IC live order book" : `IC snapshot (${q.quality.toLowerCase()})`,
    };
  });
}
