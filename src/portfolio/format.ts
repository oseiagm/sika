import { ghs, percent } from "../fees/engine";
import type { Quote } from "../market/quotes";
import { costHolding, value, type HoldingInput, type Valuation } from "./holdings";

function signedPercent(bps: bigint): string {
  return bps < 0n ? `-${percent(-bps)}` : `+${percent(bps)}`;
}

function signedGhs(pesewas: bigint): string {
  return pesewas < 0n ? `-${ghs(-pesewas)}` : `+${ghs(pesewas)}`;
}

/** The draft list Sika reads back before saving. */
export function holdingsDraftCard(draft: HoldingInput[], quotes: Map<string, Quote>): string {
  const lines = ["*Here's what I have*", ""];
  for (const input of draft) {
    const costed = costHolding(input, quotes);
    if (!costed.ok) {
      lines.push(`• ⚠️ ${costed.error}`);
      continue;
    }
    const h = costed.holding;
    const label = h.source === "estimate" ? " (estimate, from today's price)" : "";
    lines.push(`• *${h.symbol}*: ${h.shares} shares, cost ${ghs(h.cost)} incl. charges${label}`);
  }
  lines.push("", "Is this right?");
  return lines.join("\n");
}

export function portfolioCard(valuations: Valuation[]): string {
  if (valuations.length === 0) return "You have no holdings with Sika yet.";
  const lines = ["*Your portfolio* (if sold now to the best buyer, after charges)", ""];
  let cost = 0n;
  let net = 0n;
  for (const v of valuations) {
    cost += v.cost;
    net += v.netIfSold;
    const estimate = v.source === "estimate" ? " _(cost estimated)_" : "";
    lines.push(
      `*${v.symbol}* · ${v.shares} @ ${ghs(v.price)}${v.basis === "last" ? " _(no buyers now; last trade)_" : ""}${estimate}`,
      `  ${signedGhs(v.profit)} (${signedPercent(v.profitBps)}) · break-even ${ghs(v.breakEven)}`,
    );
  }
  const profit = net - cost;
  lines.push("", `*Total*: ${ghs(net)} · ${signedGhs(profit)} (${signedPercent(cost > 0n ? (profit * 10_000n) / cost : 0n)})`);
  return lines.join("\n");
}

export function valueAll(holdings: Parameters<typeof value>[0][], quotes: Map<string, Quote>): Valuation[] {
  return holdings.flatMap((h) => {
    const q = quotes.get(h.symbol);
    return q ? [value(h, q)] : [];
  });
}
