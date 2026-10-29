import type { HoldingFormState } from "./holdingForm";
import type { PlanDraft } from "./plan";

export type Stage = "welcome" | "profile" | "plan" | "holdings" | "ready";

export interface FlowState {
  stage: Stage;
  /** Set when Sika asked for typed text (e.g. "monthly", "stocks", "holdings"); cleared once answered. */
  awaiting?: string;
  plan?: PlanDraft;
  /** True when changing an existing plan after setup, rather than building the first one. */
  editing?: boolean;
  /** The step-by-step "add a holding" form, while it's open (awaiting = "form"). */
  form?: HoldingFormState;
}

/** Users from before the guided flow get the stage their data implies. */
export function inferFlow(f: FlowState | null, hasProfile: boolean, mandateConfirmed: boolean, holdingCount: number): FlowState {
  if (f) return f;
  if (mandateConfirmed) return { stage: holdingCount > 0 ? "ready" : "holdings" };
  if (hasProfile) return { stage: "profile" };
  return { stage: "welcome" };
}
