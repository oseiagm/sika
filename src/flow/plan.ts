import { mandateCard, type Mandate } from "../mandate/schema";
import { DEFAULTS, type Profile, type Risk } from "../profile/questions";
import { STEP, type Ui } from "./ui";

/** The investor's choices while building (or editing) their plan. Unset fields fall back to profile defaults. */
export interface PlanDraft {
  goal?: string;
  /** GHS per month; 0 means "not monthly". */
  monthly?: number;
  /** Set once they've answered the stocks question, even with "no preference". */
  stocksAnswered?: boolean;
  like?: string[];
  avoid?: string[];
  risk?: Risk;
  maxOrder?: number;
  maxPosition?: number;
  /** null means none. */
  takeProfit?: number | null;
  stopLoss?: number | null;
  neverSellAtLoss?: boolean;
}

const GOALS: [string, string][] = [
  ["retirement", "Retirement"],
  ["house", "A house"],
  ["education", "Children's education"],
  ["business", "Start or grow a business"],
  ["grow", "Grow my savings"],
];

const money = (n: number) => `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** "about 400 a month", "GHS 1,500", "2k" → 400, 1500, 2000. */
export function parseAmount(text: string): number | null {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?/i.exec(text.replace(/ghs|gh₵|cedis?/gi, ""));
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return Number.isFinite(n) && n > 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : null;
}

/** Which plan question is still open, or "review" when everything needed is answered. */
export function nextPlanStep(p: PlanDraft): "goal" | "monthly" | "stocks" | "review" {
  if (!p.goal) return "goal";
  if (p.monthly === undefined) return "monthly";
  if (!p.stocksAnswered) return "stocks";
  return "review";
}

export function goalUi(): Ui {
  return {
    text: `${STEP(2, "Your plan")}\nWhat are you investing for? Pick one, or just tell me in your own words.`,
    list: { button: "Choose a goal", rows: [...GOALS.map(([id, title]) => ({ id: `plan:goal:${id}`, title })), { id: "plan:goal:other", title: "Something else" }] },
  };
}

export function monthlyUi(): Ui {
  const amounts = [100, 200, 300, 500, 1000, 2000];
  return {
    text: `${STEP(2, "Your plan")}\nHow much would you like to invest each month? Pick one, or type any amount.`,
    list: {
      button: "Choose amount",
      rows: [
        ...amounts.map((a) => ({ id: `plan:monthly:${a}`, title: money(a) })),
        { id: "plan:monthly:0", title: "Not monthly", description: "I'll invest now and then" },
        { id: "plan:monthly:other", title: "Another amount" },
      ],
    },
  };
}

export function stocksUi(): Ui {
  return {
    text: `${STEP(2, "Your plan")}\nAre there GSE stocks you especially like, or want me to never buy?`,
    buttons: [
      { id: "plan:stocks:none", title: "No preference" },
      { id: "plan:stocks:tell", title: "Yes, tell Sika" },
    ],
  };
}

export function riskOf(p: PlanDraft, profile: Profile | undefined): Risk {
  return p.risk ?? profile?.risk ?? "balanced";
}

const HORIZON: Record<string, Mandate["horizon"]> = { soon: "under 1 year", mid: "1-3 years", long: "5+ years" };

export function buildMandate(p: PlanDraft, profile: Profile | undefined): Mandate {
  const risk = riskOf(p, profile);
  const d = DEFAULTS[risk];
  const monthly = p.monthly ?? 0;
  return {
    goal: p.goal ?? "Grow my savings",
    horizon: HORIZON[profile?.answers.horizon ?? "long"] ?? "5+ years",
    risk,
    monthlyContributionCedis: monthly,
    maxPositionPercent: p.maxPosition ?? d.maxPositionPercent,
    maxOrderCedis: p.maxOrder ?? (monthly > 0 ? Math.max(monthly * 2, 200) : 1000),
    preferredSymbols: p.like ?? [],
    excludedSymbols: p.avoid ?? [],
    stopLossPercent: p.stopLoss === undefined ? d.stopLossPercent : p.stopLoss,
    takeProfitPercent: p.takeProfit === undefined ? d.takeProfitPercent : p.takeProfit,
    neverSellAtLoss: p.neverSellAtLoss ?? risk === "cautious",
  };
}

/** Editing an existing mandate starts from exactly what it says. */
export function planFromMandate(m: Mandate): PlanDraft {
  return {
    goal: m.goal,
    monthly: m.monthlyContributionCedis,
    stocksAnswered: true,
    like: m.preferredSymbols,
    avoid: m.excludedSymbols,
    risk: m.risk,
    maxOrder: m.maxOrderCedis,
    maxPosition: m.maxPositionPercent,
    takeProfit: m.takeProfitPercent,
    stopLoss: m.stopLossPercent,
    neverSellAtLoss: m.neverSellAtLoss,
  };
}

export function reviewUi(p: PlanDraft, profile: Profile | undefined, editing: boolean): Ui {
  const header = editing ? "*Your plan, with your changes*" : `${STEP(2, "Your plan")}\nHere's the plan I'd suggest. Check it over:`;
  return {
    text: `${header}\n\n${mandateCard(buildMandate(p, profile), profile?.risk)}`,
    buttons: [
      { id: "plan:confirm", title: editing ? "Save changes" : "Confirm plan" },
      { id: "plan:edit", title: "Change something" },
    ],
  };
}

type Field = "goal" | "monthly" | "stocks" | "risk" | "maxOrder" | "maxPosition" | "takeProfit" | "stopLoss" | "neverSellAtLoss";

export function editUi(p: PlanDraft, profile: Profile | undefined): Ui {
  const m = buildMandate(p, profile);
  const rows: [Field, string, string][] = [
    ["goal", "Goal", m.goal],
    ["monthly", "Monthly amount", m.monthlyContributionCedis ? money(m.monthlyContributionCedis) : "Not monthly"],
    ["maxOrder", "Max per order", money(m.maxOrderCedis)],
    ["maxPosition", "Max in one stock", `${m.maxPositionPercent}% of your portfolio`],
    ["takeProfit", "Take profit", m.takeProfitPercent ? `+${m.takeProfitPercent}% after charges` : "None"],
    ["stopLoss", "Stop loss", m.stopLossPercent ? `-${m.stopLossPercent}% after charges` : "None"],
    ["neverSellAtLoss", "Never sell at a loss", m.neverSellAtLoss ? "On" : "Off"],
    ["stocks", "Stocks I like or avoid", [...m.preferredSymbols, ...m.excludedSymbols.map((s) => `not ${s}`)].join(", ") || "No preference"],
    ["risk", "Risk level", m.risk],
  ];
  return {
    text: "What would you like to change?",
    list: {
      button: "Choose setting",
      rows: [
        ...rows.map(([id, title, description]) => ({ id: `plan:edit:${id}`, title, description: description.slice(0, 72) })),
        { id: "plan:review", title: "⬅ Back to my plan" },
      ],
    },
  };
}

/** The choices for one setting. */
export function fieldUi(field: string, p: PlanDraft, profile: Profile | undefined): Ui | null {
  const m = buildMandate(p, profile);
  const pct = (name: string, values: number[], current: number | null, none: boolean, sign = "") => ({
    button: "Choose",
    rows: [
      ...values.map((v) => ({ id: `plan:${name}:${v}`, title: `${sign}${v}%${v === current ? " (current)" : ""}` })),
      ...(none ? [{ id: `plan:${name}:none`, title: `None${current === null ? " (current)" : ""}` }] : []),
      { id: "plan:review", title: "⬅ Back to my plan" },
    ],
  });
  switch (field) {
    case "goal":
      return goalUi();
    case "monthly":
      return monthlyUi();
    case "stocks":
      return { text: "Tell me which stocks you like and any you never want, e.g. \"I like MTN and GCB, never buy oil companies\"." };
    case "maxOrder": {
      const base = m.monthlyContributionCedis || 500;
      const values = [...new Set([base, base * 2, base * 3, 500, 1000, 2000, 5000])].sort((a, b) => a - b).slice(0, 8);
      return {
        text: "What's the most a single order should cost, charges included?",
        list: {
          button: "Choose",
          rows: [
            ...values.map((v) => ({ id: `plan:maxOrder:${v}`, title: `${money(v)}${v === m.maxOrderCedis ? " (current)" : ""}` })),
            { id: "plan:maxOrder:other", title: "Another amount" },
            { id: "plan:review", title: "⬅ Back to my plan" },
          ],
        },
      };
    }
    case "maxPosition":
      return { text: "At most how much of your portfolio should any one stock be?", list: pct("maxPosition", [10, 20, 30, 40, 50, 100], m.maxPositionPercent, false) };
    case "takeProfit":
      return { text: "When a holding is up this much after charges, I'll propose taking some profit:", list: pct("takeProfit", [10, 15, 20, 25, 30, 50, 100], m.takeProfitPercent, true, "+") };
    case "stopLoss":
      return { text: "When a holding is down this much after charges, I'll propose selling to limit the loss:", list: pct("stopLoss", [5, 10, 15, 20, 25, 30], m.stopLossPercent, true, "-") };
    case "neverSellAtLoss":
      return {
        text: "Should I *never* propose selling below what you paid (after charges)? This turns off the stop loss.",
        buttons: [
          { id: "plan:neverSellAtLoss:on", title: "Yes, never" },
          { id: "plan:neverSellAtLoss:off", title: "No, allow it" },
        ],
      };
    case "risk":
      return {
        text: `Your profile says *${profile?.risk ?? "balanced"}*. Choosing a level resets the limits to that level's defaults.`,
        buttons: [
          { id: "plan:risk:cautious", title: "Cautious" },
          { id: "plan:risk:balanced", title: "Balanced" },
          { id: "plan:risk:adventurous", title: "Adventurous" },
        ],
      };
    default:
      return null;
  }
}

export type Applied = { ok: true; awaitText?: string } | { ok: false };

/** Applies a tapped choice ("plan:monthly:500") to the draft. "other"/"tell" choices ask for typed text instead. */
export function applyChoice(p: PlanDraft, field: string, value: string): Applied {
  const num = Number(value);
  switch (field) {
    case "goal":
      if (value === "other") return { ok: true, awaitText: "goal" };
      p.goal = GOALS.find(([id]) => id === value)?.[1] ?? p.goal;
      return { ok: true };
    case "monthly":
      if (value === "other") return { ok: true, awaitText: "monthly" };
      if (!Number.isFinite(num) || num < 0) return { ok: false };
      p.monthly = num;
      return { ok: true };
    case "stocks":
      if (value === "tell") return { ok: true, awaitText: "stocks" };
      p.stocksAnswered = true;
      p.like = [];
      p.avoid = [];
      return { ok: true };
    case "maxOrder":
      if (value === "other") return { ok: true, awaitText: "maxOrder" };
      if (!(num > 0)) return { ok: false };
      p.maxOrder = num;
      return { ok: true };
    case "maxPosition":
      if (!(num >= 5 && num <= 100)) return { ok: false };
      p.maxPosition = num;
      return { ok: true };
    case "takeProfit":
      p.takeProfit = value === "none" ? null : num > 0 ? num : (p.takeProfit ?? null);
      return { ok: true };
    case "stopLoss":
      p.stopLoss = value === "none" ? null : num > 0 ? num : (p.stopLoss ?? null);
      return { ok: true };
    case "neverSellAtLoss":
      p.neverSellAtLoss = value === "on";
      return { ok: true };
    case "risk":
      if (value !== "cautious" && value !== "balanced" && value !== "adventurous") return { ok: false };
      p.risk = value;
      delete p.maxPosition;
      delete p.takeProfit;
      delete p.stopLoss;
      delete p.neverSellAtLoss;
      return { ok: true };
    default:
      return { ok: false };
  }
}

/** Typed answers for the steps that accept text. Returns false if the text didn't fit. */
export function applyText(p: PlanDraft, awaiting: string, text: string): boolean {
  if (awaiting === "goal") {
    const goal = text.trim().slice(0, 120);
    p.goal = goal.charAt(0).toUpperCase() + goal.slice(1);
    return p.goal.length > 0;
  }
  if (awaiting === "monthly" || awaiting === "maxOrder") {
    if (/\b(no|not|none|zero|nothing)\b/i.test(text) && awaiting === "monthly") {
      p.monthly = 0;
      return true;
    }
    const n = parseAmount(text);
    if (n === null) return false;
    if (awaiting === "monthly") p.monthly = n;
    else p.maxOrder = n;
    return true;
  }
  return false;
}
