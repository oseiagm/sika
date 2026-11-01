import { ghs, percent } from "../fees/engine";
import type { SessionActivity } from "../market/activity";
import type { CompanyProfile } from "../market/profile";
import type { Valuation } from "./holdings";

/**
 * What the investor's holdings add up to beyond profit: how spread out they are, what they might pay
 * in dividends, and which could be hard to sell. Weights use what each holding would fetch today.
 */
export function portfolioInsights(
  valuations: Valuation[],
  profiles: Map<string, CompanyProfile | null>,
  activity: Map<string, SessionActivity | null>,
): Record<string, unknown> {
  const total = valuations.reduce((s, v) => s + v.netIfSold, 0n);
  if (valuations.length === 0 || total <= 0n) return { note: "No holdings to look at yet." };
  const weight = (v: bigint) => (v * 10_000n) / total;

  const bySector = new Map<string, bigint>();
  for (const v of valuations) {
    const sector = profiles.get(v.symbol)?.sector ?? "Not known";
    bySector.set(sector, (bySector.get(sector) ?? 0n) + v.netIfSold);
  }
  const sectorMix = [...bySector.entries()].sort((a, b) => Number(b[1] - a[1])).map(([s, v]) => `${s}: ${percent(weight(v))}`);

  const biggest = [...valuations].sort((a, b) => Number(b.netIfSold - a.netIfSold))[0]!;

  // Dividends: the last 12 months' payments per share if known, else the most recent one, as a guide only.
  let yearly = 0n;
  const counted: string[] = [];
  const unknown: string[] = [];
  for (const v of valuations) {
    const d = profiles.get(v.symbol)?.dividends;
    const perShare = d?.last12MonthsPerShareCedis ?? null;
    if (perShare === null) {
      if (d && d.lastPerShareCedis === 0) counted.push(`${v.symbol}: no recent dividend`);
      else unknown.push(v.symbol);
      continue;
    }
    const amount = (BigInt(Math.round(perShare * 100)) * v.shares);
    yearly += amount;
    counted.push(`${v.symbol}: about ${ghs(amount)}`);
  }

  const hardToSell = valuations.flatMap((v) => {
    const a = activity.get(v.symbol);
    return a && a.sessions >= 3 && a.tradedSessions * 2 < a.sessions ? [`${v.symbol} traded in only ${a.tradedSessions} of the last ${a.sessions} sessions`] : [];
  });

  return {
    worthNow: ghs(total),
    holdings: valuations.length,
    largestHolding: `${biggest.symbol}: ${percent(weight(biggest.netIfSold))} of the portfolio`,
    sectorMix,
    ...(counted.length ? { dividendsLast12Months: { total: ghs(yearly), byStock: counted, note: "Based on what each company paid per share in the last 12 months; future dividends aren't guaranteed." } } : {}),
    ...(unknown.length ? { dividendsNotKnown: unknown } : {}),
    ...(hardToSell.length ? { mayBeHardToSell: hardToSell } : {}),
  };
}
