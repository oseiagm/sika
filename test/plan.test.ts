import { describe, expect, it } from "vitest";
import { applyChoice, applyText, buildMandate, editUi, monthlyUi, nextPlanStep, parseAmount, planFromMandate, type PlanDraft } from "../src/flow/plan";
import { Mandate } from "../src/mandate/schema";
import { score } from "../src/profile/questions";

const balanced = score({ horizon: "long", cushion: "maybe", drop: "wait", experience: "some", style: "balanced" });

describe("plan wizard", () => {
  it("asks goal, then monthly, then stocks, then shows the review", () => {
    const p: PlanDraft = {};
    expect(nextPlanStep(p)).toBe("goal");
    applyChoice(p, "goal", "house");
    expect(nextPlanStep(p)).toBe("monthly");
    applyChoice(p, "monthly", "500");
    expect(nextPlanStep(p)).toBe("stocks");
    applyChoice(p, "stocks", "none");
    expect(nextPlanStep(p)).toBe("review");
  });

  it("'other' and 'tell' wait for typed text", () => {
    expect(applyChoice({}, "monthly", "other")).toEqual({ ok: true, awaitText: "monthly" });
    expect(applyChoice({}, "stocks", "tell")).toEqual({ ok: true, awaitText: "stocks" });
  });

  it("reads typed amounts the way people write them", () => {
    expect(parseAmount("about 400 a month")).toBe(400);
    expect(parseAmount("GHS 1,500")).toBe(1500);
    expect(parseAmount("2k")).toBe(2000);
    expect(parseAmount("not sure")).toBeNull();
    const p: PlanDraft = {};
    expect(applyText(p, "monthly", "nothing monthly for now")).toBe(true);
    expect(p.monthly).toBe(0);
  });

  it("builds a valid mandate from the profile's defaults", () => {
    const m = buildMandate({ goal: "A house", monthly: 400, stocksAnswered: true, like: ["MTNGH"] }, balanced);
    expect(Mandate.safeParse(m).success).toBe(true);
    expect(m).toMatchObject({ risk: "balanced", horizon: "5+ years", maxPositionPercent: 30, maxOrderCedis: 800, takeProfitPercent: 25, stopLossPercent: 15 });
  });

  it("changing risk resets limits to that level's defaults", () => {
    const p: PlanDraft = { goal: "x", monthly: 100, stocksAnswered: true, maxPosition: 50 };
    applyChoice(p, "risk", "cautious");
    expect(buildMandate(p, balanced)).toMatchObject({ risk: "cautious", maxPositionPercent: 20, neverSellAtLoss: true });
  });

  it("editing starts from the saved plan exactly", () => {
    const m = buildMandate({ goal: "A house", monthly: 400, stocksAnswered: true, takeProfit: null }, balanced);
    expect(buildMandate(planFromMandate(m), balanced)).toEqual(m);
  });

  it("keeps WhatsApp's list limits", () => {
    for (const ui of [monthlyUi(), editUi({}, balanced)]) {
      expect(ui.list!.rows.length).toBeLessThanOrEqual(10);
      for (const r of ui.list!.rows) expect(r.title.length).toBeLessThanOrEqual(24);
    }
  });
});
