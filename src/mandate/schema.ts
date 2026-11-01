import { z } from "zod";
import { riskGap, type Risk } from "../profile/questions";

const symbol = z.string().regex(/^[A-Z0-9]{2,10}$/, "GSE ticker in capitals, e.g. MTNGH");
const cedis = z.number().nonnegative();

/** The investor's standing instructions. The policy engine enforces these; the model can only draft them. */
export const Mandate = z.object({
  goal: z.string().min(1).max(200).describe("The investor's goal in their own words, short"),
  horizon: z.enum(["under 1 year", "1-3 years", "3-5 years", "5+ years"]),
  risk: z.enum(["cautious", "balanced", "adventurous"]),
  monthlyContributionCedis: cedis.describe("How much they plan to invest each month, in GHS; 0 if not regular"),
  maxPositionPercent: z.number().int().min(5).max(100).describe("Most of the portfolio any one stock may be, in %"),
  maxOrderCedis: cedis.positive().describe("Largest single order, in GHS, charges included"),
  preferredSymbols: z.array(symbol).max(20).describe("Stocks they like or want to focus on"),
  excludedSymbols: z.array(symbol).max(20).describe("Stocks they never want to hold"),
  stopLossPercent: z.number().min(1).max(90).nullable().describe("Sell if a holding is down this % after fees; null for none"),
  takeProfitPercent: z.number().min(1).max(500).nullable().describe("Consider selling when up this % after fees; null for none"),
  neverSellAtLoss: z.boolean().describe("Never suggest a sale below break-even after fees (ignores stop loss)"),
});
export type Mandate = z.infer<typeof Mandate>;

const RISK: Record<Mandate["risk"], string> = { cautious: "Cautious", balanced: "Balanced", adventurous: "Adventurous" };

const money = (cedisValue: number) =>
  `GHS ${cedisValue.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** WhatsApp-formatted mandate card. */
export function mandateCard(m: Mandate, profileRisk?: Risk): string {
  const lines = [
    "*Your investing plan*",
    `_${m.goal}_`,
    "",
    `• Time frame: ${m.horizon}`,
    `• Risk: ${RISK[m.risk]}`,
    `• Monthly: ${m.monthlyContributionCedis > 0 ? money(m.monthlyContributionCedis) : "not fixed"}`,
    `• Max in one stock: ${m.maxPositionPercent}%`,
    `• Max per order: ${money(m.maxOrderCedis)}`,
    `• Focus: ${m.preferredSymbols.length ? m.preferredSymbols.join(", ") : "any"}`,
    `• Never buy: ${m.excludedSymbols.length ? m.excludedSymbols.join(", ") : "none"}`,
    `• Stop loss: ${m.neverSellAtLoss ? "off (never sell at a loss)" : m.stopLossPercent ? `${m.stopLossPercent}% after fees` : "none"}`,
    `• Take profit: ${m.takeProfitPercent ? `${m.takeProfitPercent}% after fees` : "none"}`,
    ...(profileRisk && riskGap(profileRisk, m.risk) ? ["", riskGap(profileRisk, m.risk)!] : []),
    "",
    "I only suggest trades that fit this plan. I never buy or sell for you.",
  ];
  return lines.join("\n");
}
