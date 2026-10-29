import { IC_GSE, type FeeComponent, type FeeSchedule, type Side } from "./schedule";

export interface FeeLine {
  name: string;
  bps: bigint;
  pesewas: bigint;
}

export interface Charges {
  side: Side;
  shares: bigint;
  price: bigint;
  gross: bigint;
  lines: FeeLine[];
  total: bigint;
  /** BUY: what you pay (gross + charges). SELL: what you receive (gross − charges). */
  net: bigint;
  /** All-in rate of the tier used, in bps. */
  allInBps: bigint;
}

function rateFor(component: FeeComponent, gross: bigint): bigint {
  if ("bps" in component.rate) return component.rate.bps;
  for (const tier of component.rate.tiers) {
    if (tier.upTo === null || gross <= tier.upTo) return tier.bps;
  }
  throw new Error(`No tier for ${component.name} at ${gross}`);
}

/** gross × bps / 10,000, rounded half up to the pesewa. Each line is rounded on its own. */
function line(gross: bigint, bps: bigint): bigint {
  return (gross * bps + 5_000n) / 10_000n;
}

export function charges(side: Side, shares: bigint, price: bigint, schedule: FeeSchedule = IC_GSE): Charges {
  if (shares <= 0n) throw new RangeError("shares must be positive");
  if (price <= 0n || price % schedule.tick !== 0n) throw new RangeError("price must be positive and on the tick");
  const gross = shares * price;
  const lines = schedule.components.map((c) => {
    const bps = rateFor(c, gross);
    return { name: c.name, bps, pesewas: line(gross, bps) };
  });
  const total = lines.reduce((sum, l) => sum + l.pesewas, 0n);
  const allInBps = lines.reduce((sum, l) => sum + l.bps, 0n);
  return { side, shares, price, gross, lines, total, net: side === "BUY" ? gross + total : gross - total, allInBps };
}

/**
 * Lowest tick price at which selling `shares` returns at least `needed` after charges.
 * Scans ticks instead of bisecting: rounding and tier edges mean proceeds aren't guaranteed monotonic.
 */
export function lowestSellPrice(shares: bigint, needed: bigint, schedule: FeeSchedule = IC_GSE): bigint {
  const tick = schedule.tick;
  // Proceeds are below gross, so the price is at least needed / shares.
  let price = ((needed + shares - 1n) / shares + tick - 1n) / tick * tick;
  if (price <= 0n) price = tick;
  for (;;) {
    if (charges("SELL", shares, price, schedule).net >= needed) return price;
    price += tick;
  }
}

/** Most shares that `cash` buys at `price` after charges (0 if none). Buy cost dips at tier edges, so scan down. */
export function maxSharesFor(cash: bigint, price: bigint, schedule: FeeSchedule = IC_GSE): bigint {
  for (let shares = cash / price; shares > 0n; shares--) {
    if (charges("BUY", shares, price, schedule).net <= cash) return shares;
  }
  return 0n;
}

/** "GHS 1,234.56" */
export function ghs(pesewas: bigint): string {
  const negative = pesewas < 0n;
  const abs = negative ? -pesewas : pesewas;
  const cedis = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}GHS ${cedis}.${rest}`;
}

/** "2.25%" */
export function percent(bps: bigint): string {
  return `${bps / 100n}.${(bps % 100n).toString().padStart(2, "0")}%`;
}

/** Parses "6.5", "6.50", "1,234" into pesewas; null if not a valid amount. */
export function toPesewas(input: string | number): bigint | null {
  const text = String(input).replace(/,/g, "").trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}
