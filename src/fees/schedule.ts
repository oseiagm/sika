// Fee rules are data. Rates are in basis points (1 bp = 0.01%), amounts in pesewas.

export type Side = "BUY" | "SELL";

export interface Tier {
  /** Upper bound of gross consideration in pesewas, inclusive; null = no limit. */
  upTo: bigint | null;
  bps: bigint;
}

export interface FeeComponent {
  name: string;
  /** Flat rate, or a tier chosen by the gross consideration of the whole trade. */
  rate: { bps: bigint } | { tiers: Tier[] };
}

export interface FeeSchedule {
  id: string;
  broker: string;
  market: string;
  /** Smallest price step in pesewas. */
  tick: bigint;
  /** IC charges the same components on buys and sells. */
  components: FeeComponent[];
}

/** IC Securities, GSE equities: 0.70% statutory levies plus tiered brokerage (published schedule). */
export const IC_GSE: FeeSchedule = {
  id: "ic-gse-equities",
  broker: "IC Securities",
  market: "GSE",
  tick: 1n,
  components: [
    { name: "CSD levy", rate: { bps: 15n } },
    { name: "SEC levy", rate: { bps: 15n } },
    { name: "GSE levy", rate: { bps: 35n } },
    { name: "Market development levy", rate: { bps: 5n } },
    {
      name: "Brokerage",
      rate: {
        tiers: [
          { upTo: 50_000n, bps: 180n }, // up to GHS 500.00: 2.50% all-in
          { upTo: 500_000n, bps: 155n }, // up to GHS 5,000.00: 2.25%
          { upTo: 1_000_000n, bps: 130n }, // up to GHS 10,000.00: 2.00%
          { upTo: null, bps: 105n }, // above: 1.75%
        ],
      },
    },
  ],
};
