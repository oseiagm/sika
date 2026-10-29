import { charges, ghs, type Charges } from "../fees/engine";
import type { Side } from "../fees/schedule";
import type { Quote } from "../market/quotes";

export interface Order {
  side: Side;
  symbol: string;
  shares: bigint;
  /** Limit price in pesewas: buys never pay more, sells never take less. */
  limit: bigint;
}

export type Execution =
  | { filled: true; shares: bigint; price: bigint; charges: Charges; partial: boolean; note?: string }
  | { filled: false; reason: string };

/** Anything that can execute an approved order. A real broker adapter would implement the same interface. */
export interface Broker {
  execute(order: Order, quote: Quote): Promise<Execution>;
}

/**
 * Simulated broker on IC's live GSE order book. A buy fills at the best ask and a sell at the best
 * bid, if within the limit, and never for more shares than are offered there (GSE books are thin).
 */
export class PaperBroker implements Broker {
  async execute(order: Order, quote: Quote): Promise<Execution> {
    if (!quote.tradable) return { filled: false, reason: `${order.symbol} isn't trading right now.` };
    const price = order.side === "BUY" ? quote.ask : quote.bid;
    if (price === null) {
      return { filled: false, reason: order.side === "BUY" ? `Nobody is selling ${order.symbol} right now.` : `Nobody is bidding for ${order.symbol} right now.` };
    }
    if (order.side === "BUY" ? price > order.limit : price < order.limit) {
      return { filled: false, reason: `The price moved to ${ghs(price)}, past your approved limit.` };
    }
    const offered = order.side === "BUY" ? quote.askVolume : quote.bidVolume;
    const shares = offered !== null && offered > 0 && BigInt(offered) < order.shares ? BigInt(offered) : order.shares;
    return {
      filled: true,
      shares,
      price,
      charges: charges(order.side, shares, price),
      partial: shares < order.shares,
      note: quote.live ? undefined : "Simulated on IC's snapshot prices; the live order book wasn't available.",
    };
  }
}
