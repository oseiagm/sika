import { charges, ghs, type Charges } from "../fees/engine";
import type { Side } from "../fees/schedule";
import type { Mandate } from "../mandate/schema";
import { markPrice, type Quote } from "../market/quotes";
import type { Holding } from "../portfolio/holdings";

export interface Proposal {
  side: Side;
  symbol: string;
  shares: bigint;
  /** Price per share in pesewas: the ask for a buy, the bid for a sell (0 if there is none). */
  price: bigint;
}

export interface PolicyContext {
  mandate: Mandate | null;
  mandateConfirmed: boolean;
  holdings: Holding[];
  quotes: Map<string, Quote>;
  /** All-in cost of buys already filled this calendar month, in pesewas. */
  boughtThisMonth: bigint;
}

export interface Finding {
  rule: string;
  message: string;
}

export interface Verdict {
  ok: boolean;
  violations: Finding[];
  warnings: Finding[];
  /** Rules that were checked and passed, for "Why?" and the audit trail. */
  passed: string[];
  preview: Charges | null;
}

const cedis = (value: number) => BigInt(Math.round(value * 100));

/**
 * Deterministic checks between the model and execution. The model can propose anything;
 * only a proposal with no violations can be shown to the investor for approval.
 */
export function check(p: Proposal, ctx: PolicyContext): Verdict {
  const violations: Finding[] = [];
  const warnings: Finding[] = [];
  const passed: string[] = [];
  const rule = (name: string, ok: boolean, message: string) => {
    if (ok) passed.push(name);
    else violations.push({ rule: name, message });
    return ok;
  };

  const m = ctx.mandate;
  rule("mandate", m !== null && ctx.mandateConfirmed, "There's no confirmed plan yet.");
  const quote = ctx.quotes.get(p.symbol);
  rule("known stock", quote !== undefined, `${p.symbol} isn't a GSE stock I can price.`);
  rule("whole shares", p.shares > 0n, "The order must be for at least 1 whole share.");
  if (quote) {
    rule(
      "someone to trade with",
      p.side === "BUY" ? quote.ask !== null : quote.bid !== null,
      p.side === "BUY" ? `Nobody is selling ${p.symbol} right now, so there's nothing to buy.` : `Nobody is bidding for ${p.symbol} right now, so there's no one to sell to.`,
    );
  }
  if (!m || !ctx.mandateConfirmed || !quote || p.shares <= 0n || p.price <= 0n) {
    return { ok: false, violations, warnings, passed, preview: null };
  }

  rule("tradable", quote.tradable, `${p.symbol} isn't trading right now (halted or suspended).`);
  if (!quote.live && quote.quality !== "LIVE") {
    warnings.push({ rule: "price freshness", message: `The ${p.symbol} price is from IC's ${quote.quality.toLowerCase()} snapshot; it may be out of date.` });
  }
  const available = p.side === "BUY" ? quote.askVolume : quote.bidVolume;
  if (available !== null && BigInt(available) < p.shares) {
    warnings.push({
      rule: "liquidity",
      message: `Only ${available} ${p.symbol} shares are ${p.side === "BUY" ? "offered" : "wanted"} at ${p.side === "BUY" ? "that price" : "the best bid"}; the order may fill only partly.`,
    });
  }

  const preview = charges(p.side, p.shares, p.price);
  const held = ctx.holdings.find((h) => h.symbol === p.symbol);

  if (p.side === "BUY") {
    rule("not excluded", !m.excludedSymbols.includes(p.symbol), `${p.symbol} is on your never-buy list.`);
    const maxOrder = cedis(m.maxOrderCedis);
    rule("max per order", preview.net <= maxOrder, `This order costs ${ghs(preview.net)}, above your ${ghs(maxOrder)} limit per order.`);

    if (m.monthlyContributionCedis > 0) {
      const budget = cedis(m.monthlyContributionCedis);
      const left = budget - ctx.boughtThisMonth;
      rule(
        "monthly budget",
        preview.net <= left,
        `This order costs ${ghs(preview.net)} but only ${ghs(left < 0n ? 0n : left)} of your ${ghs(budget)} monthly budget is left.`,
      );
    }

    // Concentration: value every holding at the current price, add the order's gross.
    const others = ctx.holdings.filter((h) => h.symbol !== p.symbol);
    if (others.length === 0) {
      warnings.push({ rule: "max in one stock", message: "This would be your only holding; the per-stock limit applies once you own two or more." });
    } else {
      const marketValue = (h: Holding) => {
        const q = ctx.quotes.get(h.symbol);
        return h.shares * (q ? markPrice(q) : 0n);
      };
      const positionAfter = (held ? marketValue(held) : 0n) + preview.gross;
      const totalAfter = others.reduce((sum, h) => sum + marketValue(h), 0n) + positionAfter;
      const pctBps = (positionAfter * 10_000n) / totalAfter;
      const limitBps = BigInt(m.maxPositionPercent) * 100n;
      rule(
        "max in one stock",
        pctBps <= limitBps,
        `${p.symbol} would be ${pctBps / 100n}% of your portfolio, above your ${m.maxPositionPercent}% limit.`,
      );
    }
  } else {
    const owned = held?.shares ?? 0n;
    rule("shares held", p.shares <= owned, `You hold ${owned} ${p.symbol} shares, fewer than the ${p.shares} in this sale.`);
    if (held && p.shares <= owned) {
      const costOfSold = (held.cost * p.shares) / held.shares;
      const loss = preview.net < costOfSold;
      if (m.neverSellAtLoss) {
        rule(
          "never sell at a loss",
          !loss,
          `Selling at ${ghs(p.price)} returns ${ghs(preview.net)}, less than the ${ghs(costOfSold)} these shares cost.`,
        );
      } else if (loss) {
        warnings.push({ rule: "loss", message: `This sale realises a loss of ${ghs(costOfSold - preview.net)} after charges.` });
      }
    }
  }

  return { ok: violations.length === 0, violations, warnings, passed, preview };
}
