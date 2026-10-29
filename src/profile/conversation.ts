import type OpenAI from "openai";
import { QUESTIONS, profileCard, score, type Answers, type Profile, type Question } from "./questions";

/** Where the investor is in the questions; stored on the user until finished. */
export interface ProfileState {
  answers: Answers;
  done?: Profile;
}

export interface Prompt {
  text: string;
  buttons: { id: string; title: string }[];
}

export const INTRO = (name: string | null) =>
  [
    `Hi${name ? ` ${name}` : ""} 👋 I'm Sika. I help you invest on the Ghana Stock Exchange, right here on WhatsApp.`,
    "",
    "Before we talk money, five quick questions so I understand how you like to invest. There are no right or wrong answers, and you can tap or just reply in your own words.",
  ].join("\n");

export function nextQuestion(state: ProfileState): Question | undefined {
  return QUESTIONS.find((q) => !state.answers[q.id]);
}

export function ask(q: Question): Prompt {
  const n = QUESTIONS.indexOf(q) + 1;
  return {
    text: `*${n}/${QUESTIONS.length}* ${q.text}`,
    buttons: q.options.map((o) => ({ id: `profile:${q.id}:${o.id}`, title: o.title })),
  };
}

export type Step =
  | { kind: "next"; reply: string; prompt: Prompt }
  | { kind: "done"; reply: string; profile: Profile; card: string }
  | { kind: "unclear"; prompt: Prompt };

/** Records one answer and says what comes next. */
export function answer(state: ProfileState, questionId: string, optionId: string, name: string | null): Exclude<Step, { kind: "unclear" }> | null {
  const q = QUESTIONS.find((x) => x.id === questionId);
  const o = q?.options.find((x) => x.id === optionId);
  if (!q || !o) return null;
  state.answers[q.id] = o.id;
  const following = nextQuestion(state);
  if (following) return { kind: "next", reply: o.reply, prompt: ask(following) };
  const profile = score(state.answers);
  state.done = profile;
  return { kind: "done", reply: o.reply, profile, card: profileCard(profile, name) };
}

/** Maps a typed or spoken answer to one of the question's options with Muse Spark, or null if it doesn't fit. */
export async function classify(meta: OpenAI, model: string, q: Question, reply: string): Promise<string | null> {
  const options = q.options.map((o) => `${o.id}: ${o.title}`).join("\n");
  const res = await meta.chat.completions.create({
    model,
    reasoning_effort: "minimal",
    messages: [
      {
        role: "system",
        content:
          "You map an investor's free-text reply to the closest option of a multiple-choice question. " +
          "Reply with only the option id. If the reply doesn't answer the question, reply with: none",
      },
      { role: "user", content: `Question: ${q.text}\nOptions:\n${options}\nReply: ${reply}` },
    ],
  });
  const id = res.choices[0]?.message.content?.trim().toLowerCase() ?? "";
  return q.options.some((o) => o.id === id) ? id : null;
}
