import type { Mandate } from "../mandate/schema";

export type Level = 0 | 1 | 2;
export type Risk = Mandate["risk"];

export interface Option {
  id: string;
  /** Button title, max 20 characters. */
  title: string;
  score: Level;
  /** What Sika says back, so it feels like a conversation rather than a form. */
  reply: string;
  /** How the answer reads on the profile card. */
  summary: string;
}

export interface Question {
  id: "horizon" | "cushion" | "drop" | "experience" | "style";
  /** Willingness is how much risk you'd like; capacity is how much you can afford. */
  measures: "willingness" | "capacity";
  text: string;
  options: [Option, Option, Option];
}

export const QUESTIONS: Question[] = [
  {
    id: "horizon",
    measures: "capacity",
    text: "First one: when do you think you might need this money back?",
    options: [
      { id: "soon", title: "Within a year", score: 0, reply: "Got it, sooner rather than later.", summary: "You may need the money within a year" },
      { id: "mid", title: "In 1 to 5 years", score: 1, reply: "Okay, a few years out.", summary: "You'll need it in 1 to 5 years" },
      { id: "long", title: "5+ years from now", score: 2, reply: "Nice, time is on your side.", summary: "You won't need it for 5+ years" },
    ],
  },
  {
    id: "cushion",
    measures: "capacity",
    text: "If something unexpected came up, like a hospital bill or a car repair, could you handle it without touching this money?",
    options: [
      { id: "no", title: "Not really", score: 0, reply: "Thanks for being honest. That matters more than people think.", summary: "No emergency cushion yet" },
      { id: "maybe", title: "Just about", score: 1, reply: "Fair enough, most of us are there.", summary: "A thin emergency cushion" },
      { id: "yes", title: "Yes, easily", score: 2, reply: "Good, that's a solid cushion.", summary: "A solid emergency cushion" },
    ],
  },
  {
    id: "drop",
    measures: "willingness",
    text: "Imagine you put in GHS 1,000, and a month later it shows GHS 800. Honestly, what would you do?",
    options: [
      { id: "sell", title: "Sell, stop the loss", score: 0, reply: "Totally understandable. Losses sting.", summary: "After a 20% drop you'd sell" },
      { id: "wait", title: "Wait it out", score: 1, reply: "Steady hands, I like it.", summary: "After a 20% drop you'd wait it out" },
      { id: "buy", title: "Buy more, it's cheap", score: 2, reply: "Bold! You see dips as discounts.", summary: "After a 20% drop you'd buy more" },
    ],
  },
  {
    id: "experience",
    measures: "willingness",
    text: "Have you bought shares before, on the GSE or anywhere else?",
    options: [
      { id: "new", title: "First time", score: 0, reply: "Welcome! I'll explain things as we go.", summary: "New to shares" },
      { id: "some", title: "A little", score: 1, reply: "Okay, you know the basics then.", summary: "Some experience with shares" },
      { id: "years", title: "Yes, for years", score: 2, reply: "Great, I'll keep things brief.", summary: "Years of experience with shares" },
    ],
  },
  {
    id: "style",
    measures: "willingness",
    text: [
      "Last one. Which sounds most like you?",
      "",
      "• *Slow and steady*: smaller gains, fewer surprises",
      "• *Some ups and downs*: more growth, some bumpy months",
      "• *Go big*: aim for bigger growth and accept big swings",
    ].join("\n"),
    options: [
      { id: "steady", title: "Slow and steady", score: 0, reply: "Slow and steady it is.", summary: "Prefers slow and steady" },
      { id: "balanced", title: "Some ups and downs", score: 1, reply: "A sensible middle road.", summary: "Accepts some ups and downs for growth" },
      { id: "big", title: "Go big", score: 2, reply: "Ambitious, I like it.", summary: "Aims high and accepts big swings" },
    ],
  },
];

export type Answers = Partial<Record<Question["id"], string>>;

const RISKS: Risk[] = ["cautious", "balanced", "adventurous"];
const LABEL: Record<Risk, string> = { cautious: "Cautious 🛡️", balanced: "Balanced ⚖️", adventurous: "Adventurous 🚀" };

/** Mandate limits each profile starts from; the investor can change any of them. */
export const DEFAULTS: Record<Risk, Pick<Mandate, "maxPositionPercent" | "stopLossPercent" | "takeProfitPercent">> = {
  cautious: { maxPositionPercent: 20, stopLossPercent: 10, takeProfitPercent: 15 },
  balanced: { maxPositionPercent: 30, stopLossPercent: 15, takeProfitPercent: 25 },
  adventurous: { maxPositionPercent: 40, stopLossPercent: 25, takeProfitPercent: 50 },
};

export interface Profile {
  risk: Risk;
  willingness: Level;
  capacity: Level;
  answers: Answers;
}

function option(q: Question, answers: Answers): Option | undefined {
  return q.options.find((o) => o.id === answers[q.id]);
}

/**
 * Willingness (reaction to a drop, style, experience: 0–6) and capacity (horizon, cushion: 0–4)
 * are each banded into three levels. The profile is the lower of the two, and money needed
 * within a year is always cautious.
 */
export function score(answers: Answers): Profile {
  let w = 0;
  let c = 0;
  for (const q of QUESTIONS) {
    const s = option(q, answers)?.score ?? 0;
    if (q.measures === "willingness") w += s;
    else c += s;
  }
  const willingness: Level = w <= 1 ? 0 : w <= 4 ? 1 : 2;
  const capacity: Level = c <= 1 ? 0 : c <= 3 ? 1 : 2;
  const level = answers.horizon === "soon" ? 0 : Math.min(willingness, capacity);
  return { risk: RISKS[level]!, willingness, capacity, answers };
}

export function profileCard(p: Profile, name: string | null): string {
  const lines = [`*${name ? `${name}, here's` : "Here's"} how I read you: ${LABEL[p.risk]}*`, ""];
  for (const q of QUESTIONS) {
    const o = option(q, p.answers);
    if (o) lines.push(`• ${o.summary}`);
  }
  lines.push("");
  if (p.answers.horizon === "soon") {
    lines.push("Money you may need within a year shouldn't ride the ups and downs of shares, so I'll keep things careful.");
  } else if (p.capacity < p.willingness) {
    lines.push(`You've got the appetite for more, but your situation calls for a steadier approach, so I'll keep things ${p.risk}. As your cushion grows, we can revisit this.`);
  } else if (p.willingness < p.capacity) {
    lines.push(`On paper you could take more risk, but comfort matters: a plan you can't sleep with doesn't last. So I'll keep things ${p.risk}.`);
  } else {
    lines.push(`Your comfort with risk and your situation line up, so ${p.risk} it is.`);
  }
  const d = DEFAULTS[p.risk];
  lines.push(
    "",
    "*What I'd suggest for your plan* (you can change any of it):",
    `• Up to ${d.maxPositionPercent}% in any one stock`,
    `• Take profit at +${d.takeProfitPercent}% after charges`,
    `• Stop loss at -${d.stopLossPercent}% after charges`,
  );
  return lines.join("\n");
}

/** Shown on the mandate card when the investor picks more risk than their profile suggests. */
export function riskGap(profile: Risk, chosen: Risk): string | null {
  return RISKS.indexOf(chosen) > RISKS.indexOf(profile)
    ? `⚠️ This is more adventurous than your profile (${profile}) suggests. That's your call; I just want you to know.`
    : null;
}
