import { metaClient } from "./agent/meta";
import { runAgent } from "./agent/loop";
import { checkScope, replyFor } from "./agent/scope";
import { clearlyEnglish, detectLanguage, isGreeting, tooShortToTell } from "./i18n/detect";
import { khayaTranscribe } from "./i18n/khaya";
import { isLang, isVoiceReplies, languageOf, LANGUAGES, type Lang } from "./i18n/languages";
import { localize, type LocalizedSender } from "./i18n/sender";
import { toEnglish } from "./i18n/translate";
import { toVoiceNote } from "./voice/encode";
import { alertsCard, triggered } from "./alerts/levels";
import { alertMessages } from "./alerts/monitor";
import { firstStepCard } from "./cards/milestone";
import { Db, type User } from "./db";
import { ghs } from "./fees/engine";
import {
  applyChoice,
  applyText,
  buildMandate,
  editUi,
  fieldUi,
  goalUi,
  monthlyUi,
  nextPlanStep,
  planFromMandate,
  reviewUi,
  stocksUi,
  type PlanDraft,
} from "./flow/plan";
import { inferFlow, type FlowState } from "./flow/state";
import { advance, formUi, stockUi } from "./flow/holdingForm";
import { followCommand } from "./flow/follow";
import { extractStocks } from "./flow/stocks";
import { STEP, type Ui } from "./flow/ui";
import type { Env } from "./index";
import { dismiss, recordDone, whyCard, type Deps } from "./intents/service";
import { fingerprint } from "./intents/sign";
import { mandateCard } from "./mandate/schema";
import { fetchQuotes, refreshLive, withLiveBook, type Quote } from "./market/quotes";
import { MENU, MENU_MARKER, menuAction, SETUP_MENU, type MenuAction } from "./menu";
import { holdingsDraftCard, portfolioCard, valueAll } from "./portfolio/format";
import { costHolding, type HoldingInput } from "./portfolio/holdings";
import { answer, ask, classify, nextQuestion, type ProfileState } from "./profile/conversation";
import { profileCard, QUESTIONS } from "./profile/questions";
import { oggOpusToWav } from "./voice/opus";
import { transcribe } from "./voice/transcribe";
import { downloadMedia, markReadTyping, sendButtons, sendFlow, sendImage, sendList, sendTemplate, sendText, sendVoice, type ListRow, type WhatsAppConfig } from "./whatsapp/client";
import type { Inbound } from "./whatsapp/webhook";

/** Where replies go: WhatsApp in production, a list in tests and the dev chat route. */
export interface Sender {
  text(to: string, body: string): Promise<void>;
  buttons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<void>;
  list(to: string, body: string, button: string, rows: ListRow[]): Promise<void>;
  /** An image by public URL (e.g. a Muse Image card). */
  image(to: string, url: string, caption?: string): Promise<void>;
  /** Opens the holdings form; data pre-fills it (the stock list). */
  flow(to: string, body: string, data: Record<string, unknown>): Promise<void>;
  /** An approved template (outside the 24-hour window); payload comes back as the tapped button id. */
  template(to: string, name: string, bodyParams: string[], quickReplyPayload: string): Promise<void>;
  /** A voice note from a WAV (WhatsApp gets Ogg Opus; the web page plays the WAV). */
  voice(to: string, wav: Uint8Array): Promise<void>;
  typing(messageId: string): Promise<void>;
}

export function whatsappConfig(env: Env): WhatsAppConfig {
  return { phoneNumberId: env.WA_PHONE_NUMBER_ID, accessToken: env.WA_ACCESS_TOKEN };
}

export function whatsappSender(env: Env): Sender {
  const wa = whatsappConfig(env);
  return {
    text: (to, body) => sendText(wa, to, body),
    buttons: (to, body, buttons) => sendButtons(wa, to, body, buttons),
    list: (to, body, button, rows) => sendList(wa, to, body, button, rows),
    image: (to, url, caption) => sendImage(wa, to, url, caption),
    flow: (to, body, data) =>
      env.WA_HOLDING_FLOW_ID
        ? sendFlow(wa, to, { id: env.WA_HOLDING_FLOW_ID, published: false }, body, "Open form", "HOLDING", data)
        : sendText(wa, to, body),
    template: (to, name, params, payload) => sendTemplate(wa, to, { name, language: env.WA_TEMPLATE_LANG ?? "en" }, params, payload),
    voice: (to, wav) => sendVoice(wa, to, toVoiceNote(wav)),
    typing: (id) => markReadTyping(wa, id).catch(() => {}),
  };
}

/** A sender that speaks each investor's language (see src/i18n/sender.ts). Used for chats and the scheduled jobs. */
export function localizedSender(env: Env, base: Sender, db: Db = new Db(env.DB)): LocalizedSender {
  return localize(
    base,
    { db, meta: metaClient(env.MODEL_API_KEY), model: env.META_MODEL, khayaKey: env.KHAYA_API_KEY, speech: { ai: env.AI, khayaKey: env.KHAYA_API_KEY, englishVoice: env.VOICE_EN } },
    (to) => db.langOf(to),
  );
}

const HOW_IT_WORKS = [
  "*How Sika works*",
  "",
  "1. *About you*: five quick questions so I understand how you like to invest.",
  "2. *Your plan*: your goal, monthly amount and limits. I suggest; you decide.",
  "3. *What you own*: tell me your shares, or start fresh.",
  "",
  "Then ask me anything: prices, exact charges, comparing stocks, news with sources, your portfolio. Say *follow GCB* and I'll message you when there's important news on it. When you want to invest, I suggest a trade that fits your plan, with every charge shown. *Sika never buys or sells for you*: you place the order with your broker, then tap *I bought it* and I keep your holdings up to date.",
  "",
  "Tap a button or just type or send a voice note. Send *menu* any time to see everything.",

].join("\n");

const WELCOME = (name: string | null) =>
  [
    `Hi${name ? ` ${name.split(" ")[0]}` : ""} 👋 I'm *Sika*, your investing assistant for the Ghana Stock Exchange.`,
    "",
    "I'll help you set up a plan, then suggest trades that fit it, with the exact charges. *I never buy or sell for you*: you decide, and you place orders with your own broker.",
    "",
    "Setup takes about 3 minutes:",
    "1️⃣ About you  2️⃣ Your plan  3️⃣ What you own",

  ].join("\n");

/** Menu choices that are questions for the agent. */
const AGENT_PROMPTS: Partial<Record<MenuAction, string>> = {
  invest: "I'd like to invest this month's amount. Please suggest a trade that fits my plan.",
  news: "Any recent news on the stocks I hold, follow or like? Also remind me which stocks I'm following for news.",
  market: "How is the GSE doing today?",
};

/** A private link to this investor's activity page (WhatsApp users only; the web page shows its own link). */
async function activityLink(t: Turn): Promise<string> {
  if (t.to.startsWith("web-") || !t.env.PUBLIC_BASE_URL) return "";
  return `

See every step behind it: ${t.env.PUBLIC_BASE_URL}/activity/${await t.db.viewToken(t.to)}`;
}

/** After an investor records their very first purchase: a Muse Image postcard of their goal, with the purchase on it. */
async function celebrateFirstBuy(t: Turn): Promise<void> {
  const fills = await t.db.fillsFor(t.to);
  if (fills.length !== 1 || !t.user.mandate) return;
  const intent = await t.db.intent(t.to, fills[0]!.intentId);
  if (!intent || intent.side !== "BUY") return;
  try {
    const line = `${fills[0]!.shares} ${intent.symbol} shares · ${ghs(BigInt(fills[0]!.net))}`;
    const url = await firstStepCard(t.env.MODEL_API_KEY, t.user.mandate.goal, line);
    if (!url) return;
    await t.db.audit(t.to, "card", { kind: "first_step", line });
    await t.db.addMessage(t.to, "assistant", "[first-step card]");
    await t.send.image(t.to, url, "Your first step 🌱 Every month adds to it.");
  } catch (err) {
    console.error("first-step card failed", err);
  }
}

/** Everything one incoming message needs. */
interface Turn {
  db: Db;
  env: Env;
  send: LocalizedSender;
  to: string;
  user: User;
  flow: FlowState;
  quotes: Map<string, Quote>;
  /** The Worker's waitUntil: lets background work (refreshing company facts) finish after the reply. */
  waitUntil?: (p: Promise<unknown>) => void;
}

// ── Sending ────────────────────────────────────────────────────────────────

/** WhatsApp caps interactive message bodies; longer text goes first on its own. */
const BODY_LIMIT = 1000;

/** Sends Sika's message (in English; the sender translates it). `raw` sends it exactly as written. */
async function deliver(t: Turn, ui: Ui, raw = false): Promise<void> {
  await t.db.addMessage(t.to, "assistant", ui.text);
  const send = raw ? t.send.raw : t.send;
  const controls = ui.buttons || ui.list;
  const body = controls && ui.text.length > BODY_LIMIT ? (await send.text(t.to, ui.text), "What would you like to do next?") : ui.text;
  if (ui.buttons) await send.buttons(t.to, body, ui.buttons);
  else if (ui.list) await send.list(t.to, body, ui.list.button, ui.list.rows);
  else await send.text(t.to, body);
}

// ── Language and voice settings ───────────────────────────────────────────

/** The language picker: each language in its own name. Sent as written, since it's for every language. */
function languageUi(): Ui {
  return {
    text: "🌍 Which language should I use? You can type or send voice notes in it, and change it any time in *Settings*.",
    list: { button: "Languages", rows: LANGUAGES.map((l) => ({ id: `lang:${l.code}`, title: l.endonym, ...(l.english !== l.endonym ? { description: l.english } : {}) })) },
  };
}

const VOICE_LABEL = { match: "When I send one", always: "Always", off: "Text only" } as const;

function settingsUi(t: Turn): Ui {
  return {
    text: [
      "*Settings*",
      `• Language: ${languageOf(t.user.lang).endonym}`,
      `• Voice replies: ${VOICE_LABEL[t.user.voiceReplies]}`,
    ].join("\n"),
    buttons: [
      { id: "set:language", title: "Language" },
      { id: "set:voice", title: "Voice replies" },
      { id: "menu:profile", title: "Investor profile" },
    ],
  };
}

function voiceUi(t: Turn): Ui {
  return {
    text: `When should I reply with a voice note? Now: *${VOICE_LABEL[t.user.voiceReplies]}*.\n\nI always send the text too, so you can check the numbers.`,
    buttons: [
      { id: "voice:match", title: "When I send one" },
      { id: "voice:always", title: "Always" },
      { id: "voice:off", title: "Text only" },
    ],
  };
}

async function chooseLanguage(t: Turn, lang: Lang): Promise<void> {
  await t.db.setLang(t.to, lang);
  await t.db.audit(t.to, "language", { lang });
  t.user.lang = lang;
  t.send.forget(t.to);
  await t.db.addMessage(t.to, "user", `(chose) ${languageOf(lang).english}`);
  if (t.flow.stage === "welcome") return deliver(t, welcomeUi(t));
  return deliver(t, withMenu(t, `✅ I'll use ${languageOf(lang).endonym} from now on.`));
}

/** Text with the Menu list button underneath, so there's always somewhere to go next. */
function withMenu(t: Turn, text: string): Ui {
  const ready = t.flow.stage === "ready";
  const rows = (ready ? MENU : SETUP_MENU).map(({ id, title, description }) => ({ id, title, description }));
  return { text, list: { button: "Menu", rows } };
}

async function saveFlow(t: Turn): Promise<void> {
  await t.db.saveFlow(t.to, t.flow);
}

// ── Where the user is: show the current step ──────────────────────────────

/** After answering a newcomer's first question: a short invitation instead of the whole welcome. */
function inviteUi(): Ui {
  return {
    text: "Want help investing on the GSE? I can set up a plan with you and suggest trades that fit it, with every charge shown. It takes about 3 minutes.",
    buttons: [
      { id: "flow:start", title: "Let's start" },
      { id: "flow:how", title: "How it works" },
    ],
  };
}

function welcomeUi(t: Turn): Ui {
  return {
    text: WELCOME(t.user.name),
    buttons: [
      { id: "flow:start", title: "Let's start" },
      { id: "flow:how", title: "How it works" },
    ],
  };
}

function profileStepUi(t: Turn): Ui {
  const state = t.user.profile;
  if (state?.done) {
    return {
      text: `${profileCard(state.done, firstName(t))}\n\nDoes that sound like you?`,
      buttons: [
        { id: "flow:profile_ok", title: "Sounds right" },
        { id: "flow:profile_retake", title: "Retake questions" },
      ],
    };
  }
  const q = nextQuestion(state ?? { answers: {} })!;
  const prompt = ask(q);
  return { text: `${STEP(1, "About you")}\n${prompt.text}`, buttons: prompt.buttons };
}

function planStepUi(t: Turn): Ui {
  const plan = t.flow.plan ?? {};
  switch (t.flow.awaiting) {
    case "goal":
      return { text: "Tell me in a few words what you're investing for, e.g. *a car in 3 years*." };
    case "monthly":
      return { text: "How much a month? Just type the amount, e.g. *750*." };
    case "maxOrder":
      return { text: "What's the most one order should cost? Type the amount, e.g. *1500*." };
    case "stocks":
      return { text: "Tell me the stocks you like and any you never want, e.g. *\"I like MTN and the banks, never buy oil companies\"*." };
  }
  switch (nextPlanStep(plan)) {
    case "goal":
      return goalUi();
    case "monthly":
      return monthlyUi();
    case "stocks":
      return stocksUi();
    case "review":
      return reviewUi(plan, t.user.profile?.done, t.flow.editing ?? false);
  }
}

function holdingsAskUi(): Ui {
  return {
    text: `${STEP(3, "What you own")}\nDo you already own any shares on the GSE?`,
    buttons: [
      { id: "hold:yes", title: "Yes, I own some" },
      { id: "hold:no", title: "No, starting fresh" },
    ],
  };
}

function holdingsHowUi(): Ui {
  return {
    text: "How would you like to add them?\n\n• *Step by step*: pick the stock, then shares and price\n• *Type or voice note*: e.g. \"200 MTN at 1.80 and some GCB\"",
    buttons: [
      { id: "hold:form", title: "Step by step" },
      { id: "hold:text", title: "Type or voice note" },
    ],
  };
}

/** The user's holdings, with their stocks' prices refreshed from IC's live order book. */
async function liveHoldings(t: Turn) {
  const holdings = await t.db.holdings(t.to);
  await refreshLive(t.quotes, holdings.map((h) => h.symbol));
  return holdings;
}

async function homeUi(t: Turn): Promise<Ui> {
  const m = t.user.mandate;
  const holdings = await liveHoldings(t);
  const lines = [`🎉 *You're all set${firstName(t) ? `, ${firstName(t)}` : ""}!*`, ""];
  if (m) {
    lines.push(
      `• Plan: ${m.risk}, ${m.monthlyContributionCedis ? `GHS ${m.monthlyContributionCedis.toLocaleString("en-GH")} a month` : "invest as you go"}`,
    );
  }
  const valued = valueAll(holdings, t.quotes);
  if (valued.length) {
    const net = valued.reduce((s, v) => s + v.netIfSold, 0n);
    lines.push(`• Portfolio: ${valued.length} stock${valued.length > 1 ? "s" : ""}, worth ${ghs(net)} after charges`);
  }
  lines.push("", "Ask me anything, in text or a voice note. Or tap below:");
  const monthly = m?.monthlyContributionCedis ?? 0;
  const investTitle = monthly > 0 && `Invest GHS ${monthly.toLocaleString("en-GH")} now`.length <= 20 ? `Invest GHS ${monthly.toLocaleString("en-GH")} now` : "Invest now";
  return {
    text: lines.join("\n"),
    buttons: [
      { id: "menu:invest", title: investTitle },
      { id: "menu:portfolio", title: "My portfolio" },
      { id: "flow:menu", title: "More options" },
    ],
  };
}

async function currentUi(t: Turn): Promise<Ui> {
  switch (t.flow.stage) {
    case "welcome":
      return welcomeUi(t);
    case "profile":
      return profileStepUi(t);
    case "plan":
      return planStepUi(t);
    case "holdings":
      return t.flow.awaiting === "holdings" ? { text: "Tell me what you own, e.g. *\"200 MTN at 1.80 and some GCB\"*. Typing or a voice note is fine." } : holdingsAskUi();
    case "ready":
      return homeUi(t);
  }
}

const firstName = (t: Turn) => t.user.name?.split(" ")[0] ?? null;

// ── Moving between stages ─────────────────────────────────────────────────

async function startProfile(t: Turn, retake: boolean): Promise<void> {
  const state: ProfileState = { answers: {} };
  t.user.profile = state;
  await t.db.saveProfile(t.to, state);
  t.flow = { ...t.flow, stage: t.flow.stage === "ready" ? "ready" : "profile", awaiting: undefined };
  if (t.flow.stage === "ready") t.flow.awaiting = "profile";
  await saveFlow(t);
  await t.db.audit(t.to, "profile_started", { retake });
  const first = profileStepUi(t);
  const intro = retake ? "Sure, here are the five questions again." : "Great! Five quick questions first. There are no right or wrong answers: tap one, or reply in your own words.";
  await deliver(t, { ...first, text: `${intro}\n\n${first.text}` });
}

async function startPlan(t: Turn): Promise<void> {
  t.flow = { stage: "plan", plan: {} };
  await saveFlow(t);
  await deliver(t, planStepUi(t));
}

async function editPlan(t: Turn): Promise<void> {
  if (!t.user.mandate) return startPlan(t);
  t.flow = { stage: "plan", plan: planFromMandate(t.user.mandate), editing: true };
  await saveFlow(t);
  await deliver(t, editUi(t.flow.plan!, t.user.profile?.done));
}

async function confirmPlan(t: Turn): Promise<void> {
  const mandate = buildMandate(t.flow.plan ?? {}, t.user.profile?.done);
  await t.db.saveMandateDraft(t.to, mandate);
  await t.db.confirmMandate(t.to);
  t.user.mandate = mandate;
  t.user.mandateConfirmed = true;
  await t.db.audit(t.to, "plan_confirmed", mandate);
  const editing = t.flow.editing;
  if (editing) {
    t.flow = { stage: "ready" };
    await saveFlow(t);
    return deliver(t, withMenu(t, "✅ Plan updated. I'll work within it from now on."));
  }
  t.flow = { stage: "holdings" };
  await saveFlow(t);
  const ask = holdingsAskUi();
  return deliver(t, { ...ask, text: `✅ Plan saved.\n\n${ask.text}` });
}

async function finishSetup(t: Turn): Promise<void> {
  t.flow = { stage: "ready" };
  await saveFlow(t);
  await t.db.audit(t.to, "setup_done", {});
  await deliver(t, await homeUi(t));
}

// ── Profile answers ───────────────────────────────────────────────────────

async function afterProfileAnswer(t: Turn, state: ProfileState, reply: string): Promise<void> {
  await t.db.saveProfile(t.to, state);
  if (state.done) await t.db.audit(t.to, "profile_done", state.done);
  const next = profileStepUi(t);
  await deliver(t, { ...next, text: `${reply}\n\n${next.text}` });
}

async function profileText(t: Turn, text: string): Promise<void> {
  const state = t.user.profile ?? { answers: {} };
  if (state.done) {
    if (/^(yes|yeah|yep|ok|okay|sure|correct|right|sounds (right|good)|that'?s (me|right))\b/i.test(text.trim())) return profileOk(t);
    return answerThenResume(t, text, "confirming their investor profile", profileStepUi(t));
  }
  if (/^\s*skip\b/i.test(text)) {
    t.user.profile = null;
    await t.db.saveProfile(t.to, null);
    await t.db.audit(t.to, "profile_skipped", {});
    await deliver(t, { text: "No problem, we'll skip that. I'll suggest balanced limits, and you can change any of them." });
    return startPlan(t);
  }
  const q = nextQuestion(state)!;
  const meta = metaClient(t.env.MODEL_API_KEY);
  const optionId = await classify(meta, t.env.META_MODEL, q, text);
  if (optionId) {
    const step = answer(state, q.id, optionId, t.user.name)!;
    t.user.profile = state;
    return afterProfileAnswer(t, state, step.reply);
  }
  return answerThenResume(t, text, `profile question: ${q.text}`, {
    ...profileStepUi(t),
    text: `${profileStepUi(t).text}\n\n_Tap the closest answer, or say *skip* to set your limits yourself._`,
  });
}

async function profileOk(t: Turn): Promise<void> {
  if (t.user.mandate && t.user.mandateConfirmed) {
    t.flow = { stage: "ready" };
    await saveFlow(t);
    return deliver(t, {
      text: "Profile updated. Want to look at your plan's limits with your new profile in mind?",
      buttons: [
        { id: "menu:mandate", title: "Review my plan" },
        { id: "flow:home", title: "No thanks" },
      ],
    });
  }
  return startPlan(t);
}

// ── Plan answers ──────────────────────────────────────────────────────────

async function afterPlanChange(t: Turn, plan: PlanDraft): Promise<void> {
  t.flow.plan = plan;
  t.flow.awaiting = undefined;
  await saveFlow(t);
  // While editing an existing plan, every change returns to the plan card.
  if (t.flow.editing) return deliver(t, reviewUi(plan, t.user.profile?.done, true));
  return deliver(t, planStepUi(t));
}

async function planChoice(t: Turn, field: string, value: string): Promise<void> {
  if (t.flow.stage !== "plan") {
    if (!t.user.mandate) return deliver(t, await currentUi(t));
    t.flow = { stage: "plan", plan: planFromMandate(t.user.mandate), editing: true };
  }
  const plan = t.flow.plan ?? {};
  const applied = applyChoice(plan, field, value);
  if (!applied.ok) return deliver(t, planStepUi(t));
  if (applied.awaitText) {
    t.flow.plan = plan;
    t.flow.awaiting = applied.awaitText;
    await saveFlow(t);
    return deliver(t, planStepUi(t));
  }
  return afterPlanChange(t, plan);
}

async function planText(t: Turn, text: string): Promise<void> {
  const plan = t.flow.plan ?? {};
  const awaiting = t.flow.awaiting ?? (() => {
    const step = nextPlanStep(plan);
    return step === "review" ? undefined : step;
  })();

  if (awaiting === "stocks") {
    const found = await extractStocks(metaClient(t.env.MODEL_API_KEY), t.env.META_MODEL, text, t.quotes);
    if (found || /\b(no|none|nothing|any|no preference)\b/i.test(text)) {
      plan.like = found?.like ?? [];
      plan.avoid = found?.avoid ?? [];
      plan.stocksAnswered = true;
      return afterPlanChange(t, plan);
    }
    return deliver(t, { text: "I couldn't match those to GSE stocks. Try names like *MTN*, *GCB* or *Ecobank*, or say *no preference*." });
  }

  // A question rather than an answer: reply, then show the same step again.
  const looksLikeQuestion = /\?\s*$/.test(text) || /^(what|how|why|can|is|are|do|does|should|will|who|when)\b/i.test(text.trim());
  if (awaiting && !looksLikeQuestion && applyText(plan, awaiting, text)) return afterPlanChange(t, plan);

  if (!awaiting && !looksLikeQuestion && /^(yes|ok|okay|confirm|looks good|good|fine|correct|save)\b/i.test(text.trim())) return confirmPlan(t);

  const step = awaiting ?? "review";
  return answerThenResume(t, text, `plan setup: ${step}`, planStepUi(t));
}

// ── Holdings ──────────────────────────────────────────────────────────────

async function holdingsAfterSave(t: Turn): Promise<void> {
  const card = portfolioCard(valueAll(await liveHoldings(t), t.quotes));
  if (t.flow.stage === "holdings") {
    t.flow.awaiting = undefined;
    await saveFlow(t);
    return deliver(t, {
      text: `✅ Saved.\n\n${card}\n\nAnything else to add?`,
      buttons: [
        { id: "hold:more", title: "Add more" },
        { id: "hold:done", title: "That's all" },
      ],
    });
  }
  return deliver(t, withMenu(t, `✅ Saved.\n\n${card}`));
}

/** Opens the step-by-step holding form in the chat (lists and buttons; WhatsApp Flows need a verified business). */
async function openHoldingsForm(t: Turn): Promise<void> {
  t.flow.form = { step: "stock" };
  t.flow.awaiting = "form";
  await saveFlow(t);
  await deliver(t, stockUi(t.quotes));
}

async function formInput(t: Turn, input: { buttonId?: string; text?: string }): Promise<void> {
  const form = t.flow.form ?? { step: "stock" as const };
  if (input.text) await t.db.addMessage(t.to, "user", input.text);
  const step = advance(form, input, t.quotes);
  if (step.kind === "retry") return deliver(t, { text: step.hint });
  if (step.kind === "choose") return deliver(t, stockUi(t.quotes, step.choices));
  if (step.kind === "next") {
    t.flow.form = step.form;
    t.flow.awaiting = "form";
    await saveFlow(t);
    return deliver(t, formUi(step.form, t.quotes));
  }
  t.flow.form = undefined;
  t.flow.awaiting = undefined;
  await saveFlow(t);
  await t.db.audit(t.to, "holding_form", step.input);
  const costed = costHolding(step.input, t.quotes);
  if (!costed.ok) return deliver(t, { text: `I couldn't use that: ${costed.error}.`, buttons: [{ id: "hold:form", title: "Start again" }] });
  await t.db.saveHoldingsDraft(t.to, [step.input]);
  const confirmId = `holdings:confirm:${await fingerprint([step.input])}`;
  return deliver(t, {
    text: holdingsDraftCard([step.input], t.quotes),
    buttons: [
      { id: confirmId, title: "Looks right" },
      { id: "holdings:fix", title: "Fix something" },
    ],
  });
}

/** Answers from the holdings Flow → a one-line draft to confirm, like a holding told in chat. */
async function handleHoldingForm(t: Turn, form: Record<string, string>): Promise<void> {
  const amount = form.amount ? Number(form.amount) : null;
  const input: HoldingInput = {
    symbol: (form.symbol ?? "").toUpperCase(),
    shares: Number(form.shares),
    pricePaidCedis: form.cost_type === "price" && amount ? amount : null,
    totalPaidCedis: form.cost_type === "total" && amount ? amount : null,
  };
  await t.db.audit(t.to, "holding_form", { form });
  await t.db.addMessage(t.to, "user", `(form) ${input.symbol}: ${form.shares} shares, ${form.cost_type ?? ""} ${form.amount ?? ""}`.trim());
  const costed = costHolding(input, t.quotes);
  if (!costed.ok) return deliver(t, { text: `I couldn't save that: ${costed.error}.`, buttons: [{ id: "hold:form", title: "Step by step" }, { id: "hold:text", title: "Type it instead" }] });
  await t.db.saveHoldingsDraft(t.to, [input]);
  const confirmId = `holdings:confirm:${await fingerprint([input])}`;
  return deliver(t, {
    text: holdingsDraftCard([input], t.quotes),
    buttons: [
      { id: confirmId, title: "Looks right" },
      { id: "holdings:fix", title: "Fix something" },
    ],
  });
}

// ── The agent (free conversation) ─────────────────────────────────────────

/**
 * A question asked before or during setup ("What's GCB trading at?"): Muse Spark answers it with look-up
 * tools only, then the step the investor was on is shown again, so nothing is lost.
 */
async function answerThenResume(t: Turn, text: string, step: string, resume: Ui): Promise<void> {
  if (await outOfScope(t, text)) return deliver(t, resume);
  const history = (await t.db.history(t.to)).filter((m) => m.content !== MENU_MARKER);
  const result = await runAgent(
    { db: t.db, user: t.user, quotes: t.quotes, meta: metaClient(t.env.MODEL_API_KEY), model: t.env.META_MODEL, background: t.waitUntil },
    history,
    0,
    step,
  );
  if (result.text) await deliver(t, { text: result.text });
  return deliver(t, resume);
}

/**
 * Sika only talks about investing on the GSE. Off-topic questions and attempts to change its rules get a
 * fixed reply from code (the agent never sees them). True when the message was answered here.
 * The user message must already be in history.
 */
async function outOfScope(t: Turn, text: string): Promise<boolean> {
  const recent = (await t.db.history(t.to, 3)).filter((m) => m.content !== MENU_MARKER).slice(0, -1);
  const verdict = await checkScope(metaClient(t.env.MODEL_API_KEY), t.env.META_MODEL, text, t.quotes, recent);
  if (verdict === "in_scope") return false;
  await t.db.audit(t.to, "scope_blocked", { verdict, text: text.slice(0, 500) });
  await deliver(t, t.flow.stage === "ready" ? withMenu(t, replyFor(verdict)) : { text: replyFor(verdict) });
  return true;
}

async function converse(t: Turn, text: string): Promise<void> {
  await t.db.addMessage(t.to, "user", text);
  if (await outOfScope(t, text)) return;
  const history = (await t.db.history(t.to)).filter((m) => m.content !== MENU_MARKER);
  const holdingCount = (await t.db.holdings(t.to)).length;
  const result = await runAgent(
    { db: t.db, user: t.user, quotes: t.quotes, meta: metaClient(t.env.MODEL_API_KEY), model: t.env.META_MODEL, background: t.waitUntil },
    history,
    holdingCount,
  );
  const cards = result.outbox;
  const text_ = result.text || (cards.length ? "" : "Sorry, I didn't catch that. Could you say it another way?");
  // The last message always carries controls: a card's own buttons, or the Menu.
  if (text_) await deliver(t, cards.length ? { text: text_ } : withMenu(t, text_));
  for (const out of cards) await deliver(t, out.buttons ? { text: out.text, buttons: out.buttons } : withMenu(t, out.text));
}

// ── Menu actions (after setup) ────────────────────────────────────────────

async function runMenuAction(t: Turn, action: MenuAction | "menu"): Promise<void> {
  await t.db.audit(t.to, "menu", { action });
  if (action === "menu") {
    await deliver(t, withMenu(t, t.flow.stage === "ready" ? "What would you like to do?" : "You're in the middle of setup. What would you like to do?"));
    return t.db.addMessage(t.to, "assistant", MENU_MARKER);
  }
  if (action === "continue") return deliver(t, await currentUi(t));
  if (action === "language") return deliver(t, languageUi(), true);
  if (action === "settings") return deliver(t, settingsUi(t));
  if (action === "help") return deliver(t, t.flow.stage === "ready" ? withMenu(t, HOW_IT_WORKS) : { text: HOW_IT_WORKS, buttons: [{ id: "flow:continue", title: "Continue setup" }] });
  if (action === "reset") {
    return deliver(t, {
      text: "This deletes your profile, plan, holdings and history with Sika. Are you sure?",
      buttons: [
        { id: "flow:reset_yes", title: "Yes, delete all" },
        { id: "flow:continue", title: "Cancel" },
      ],
    });
  }
  if (t.flow.stage !== "ready") {
    return deliver(t, { text: "Let's finish setting up first; it only takes a few minutes. Here's where we were:" }).then(async () => deliver(t, await currentUi(t)));
  }
  switch (action) {
    case "portfolio":
      return deliver(t, {
        text: portfolioCard(valueAll(await liveHoldings(t), t.quotes)) + (await activityLink(t)),
        buttons: [
          { id: "portfolio:insights", title: "Insights" },
          { id: "menu:holdings", title: "Update holdings" },
          { id: "flow:menu", title: "More options" },
        ],
      });
    case "alerts":
      return deliver(t, {
        text: alertsCard(await liveHoldings(t), t.user.mandate, t.quotes),
        buttons: [
          { id: "plan:edit:takeProfit", title: "Change take profit" },
          { id: "plan:edit:stopLoss", title: "Change stop loss" },
          { id: "flow:menu", title: "More options" },
        ],
      });
    case "mandate":
      if (!t.user.mandate) return startPlan(t);
      return deliver(t, {
        text: mandateCard(t.user.mandate, t.user.profile?.done?.risk),
        buttons: [
          { id: "plan:edit", title: "Change something" },
          { id: "flow:home", title: "Back" },
        ],
      });
    case "profile":
      if (t.user.profile?.done) {
        return deliver(t, {
          text: profileCard(t.user.profile.done, firstName(t)),
          buttons: [
            { id: "flow:profile_retake", title: "Retake questions" },
            { id: "flow:home", title: "Back" },
          ],
        });
      }
      return startProfile(t, true);
    case "holdings":
      return deliver(t, { text: "Add or correct a holding:", buttons: [{ id: "hold:form", title: "Step by step" }, { id: "hold:text", title: "Type or voice note" }] });
    case "price":
      return deliver(t, { text: "Which stock? Say a name or ticker, e.g. *MTN* or *GCB*. You can also ask what a number of shares would cost." });
    default:
      return converse(t, AGENT_PROMPTS[action]!);
  }
}

// ── Following stocks and updates ─────────────────────────────────────────

async function followStock(t: Turn, on: boolean, symbol: string | null, typed: string): Promise<void> {
  await t.db.addMessage(t.to, "user", typed);
  if (t.flow.stage !== "ready") return deliver(t, { text: "You can follow stocks once setup is done. Here's where we were:" }).then(async () => deliver(t, await currentUi(t)));
  if (!symbol) return deliver(t, withMenu(t, "Which stock? Use a GSE ticker, e.g. *follow GCB*."));
  if (on) {
    await t.db.follow(t.to, symbol);
    await t.db.setNewsAlerts(t.to, true);
    await t.db.audit(t.to, "follow", { symbol });
    const outside = t.to.startsWith("web-") ? " (News messages reach WhatsApp only, not this web demo.)" : " I check twice each weekday.";
    return deliver(t, withMenu(t, `🔔 Following *${symbol}*. I'll message you when there's important news on it.${outside} Say *unfollow ${symbol}* to stop.`));
  }
  const removed = await t.db.unfollow(t.to, symbol);
  await t.db.audit(t.to, "unfollow", { symbol });
  const held = (await t.db.holdings(t.to)).some((h) => h.symbol === symbol);
  return deliver(
    t,
    withMenu(
      t,
      !removed && !held
        ? `You weren't following ${symbol}.`
        : held
          ? `Unfollowed ${symbol}. You still hold it, so I'll still tell you about important news on it. Tap *Stop news alerts* on a news message to turn them all off.`
          : `Unfollowed ${symbol}.`,
    ),
  );
}

/** "Show me" on a template sent outside the 24-hour window: the news item, or a fresh check of the price alert. */
async function showPending(t: Turn, id: string): Promise<void> {
  const update = await t.db.takePending(t.to, id);
  if (!update) return deliver(t, withMenu(t, "That update has already been shown, or I can't find it."));
  await t.db.addMessage(t.to, "user", "Show me");
  await t.db.audit(t.to, "update_shown", { id, kind: update.kind, symbol: update.symbol });
  if (update.kind === "news") {
    const msg = update.payload as { text: string; buttons: { id: string; title: string }[] };
    return deliver(t, { text: msg.text, buttons: msg.buttons });
  }
  // A price alert from a while ago: check the live price again before saying anything.
  const h = (await t.db.holdings(t.to)).find((x) => x.symbol === update.symbol);
  const snapshot = t.quotes.get(update.symbol);
  if (!h || !snapshot || !t.user.mandate || !t.user.mandateConfirmed) return deliver(t, withMenu(t, `You no longer hold ${update.symbol}, so there's nothing to do.`));
  const quote = await withLiveBook(snapshot);
  t.quotes.set(quote.symbol, quote);
  const trigger = triggered(h, quote, t.user.mandate);
  if (!trigger) {
    const now = quote.bid !== null ? `buyers are at ${ghs(quote.bid)}` : `nobody is bidding (last trade ${ghs(quote.last)})`;
    return deliver(t, {
      text: `The ${update.symbol} price has moved back since that alert: ${now}, so neither of your levels is reached now. I'll tell you if one is.`,
      buttons: [
        { id: "menu:alerts", title: "My alerts" },
        { id: "flow:menu", title: "Menu" },
      ],
    });
  }
  const messages = await alertMessages(t.db, t.user, t.quotes, h, trigger);
  for (const m of messages) await deliver(t, m.buttons ? { text: m.text, buttons: m.buttons } : messages.length === 1 ? withMenu(t, m.text) : { text: m.text });
}

// ── Buttons ───────────────────────────────────────────────────────────────

async function handleButton(t: Turn, id: string): Promise<void> {
  const { db, to, user, quotes } = t;
  await db.audit(to, "button", { id });

  // Suggestion buttons. Sika never trades: "I bought it" only records what the investor did with their broker.
  const [, action, intentId] = /^sug:(done|why|skip):([0-9a-f-]{36})$/.exec(id) ?? [];
  if (action && intentId) {
    if (action === "why") {
      const intent = await db.intent(to, intentId);
      return deliver(t, withMenu(t, intent ? whyCard(intent) : "I can't find that suggestion."));
    }
    const deps: Deps = { db, user, quotes };
    if (action === "skip") {
      await db.addMessage(to, "user", "Not now");
      return deliver(t, withMenu(t, await dismiss(deps, intentId)));
    }
    const intent = await db.intent(to, intentId);
    await db.addMessage(to, "user", intent?.side === "SELL" ? "I sold it" : "I bought it");
    const result = await recordDone(deps, intentId);
    if (!result.ok) return deliver(t, withMenu(t, result.message));
    await deliver(t, {
      text: result.message + (await activityLink(t)),
      buttons: [
        { id: "holdings:fix", title: "Fix it" },
        { id: "menu:portfolio", title: "My portfolio" },
        { id: "flow:menu", title: "Menu" },
      ],
    });
    if (result.firstBuy) await celebrateFirstBuy(t);
    return;
  }

  const [, qId, oId] = /^profile:(\w+):(\w+)$/.exec(id) ?? [];
  if (qId && oId) {
    const state = user.profile;
    // Taps on a finished or already-answered question just show where we are.
    if (!state || state.done || state.answers[qId as keyof typeof state.answers]) return deliver(t, await currentUi(t));
    const step = answer(state, qId, oId, user.name);
    if (!step) return deliver(t, await currentUi(t));
    await db.addMessage(to, "user", `(tapped) ${QUESTIONS.find((q) => q.id === qId)?.options.find((o) => o.id === oId)?.title ?? oId}`);
    return afterProfileAnswer(t, state, step.reply);
  }

  if (id.startsWith("hf:")) return formInput(t, { buttonId: id });

  const [, langCode] = /^lang:(\w+)$/.exec(id) ?? [];
  if (langCode && isLang(langCode)) return chooseLanguage(t, langCode);
  const [, voiceSetting] = /^voice:(\w+)$/.exec(id) ?? [];
  if (voiceSetting && isVoiceReplies(voiceSetting)) {
    await db.setVoiceReplies(to, voiceSetting);
    t.user.voiceReplies = voiceSetting;
    t.send.forget(to);
    await db.audit(to, "voice_replies", { setting: voiceSetting });
    return deliver(t, withMenu(t, `✅ Voice replies: ${VOICE_LABEL[voiceSetting]}.`));
  }
  if (id === "set:language") return deliver(t, languageUi(), true);
  if (id === "set:voice") return deliver(t, voiceUi(t));

  const [, pendingId] = /^update:show:([0-9a-f-]{36})$/.exec(id) ?? [];
  if (pendingId) return showPending(t, pendingId);
  const [, offSymbol] = /^follow:off:([A-Z0-9.]{2,12})$/.exec(id) ?? [];
  if (offSymbol) return followStock(t, false, quotes.has(offSymbol) ? offSymbol : null, `(tapped) Unfollow ${offSymbol}`);
  const [, moreSymbol] = /^news:more:([A-Z0-9.]{2,12})$/.exec(id) ?? [];
  if (moreSymbol && quotes.has(moreSymbol)) return converse(t, `What's the latest news on ${moreSymbol}?`);
  if (id === "news:mute") {
    await db.setNewsAlerts(to, false);
    await db.audit(to, "news_muted", {});
    await db.addMessage(to, "user", "(tapped) Stop news alerts");
    return deliver(t, {
      text: "🔕 Done: no more news messages. Price alerts for your take-profit and stop-loss levels still come. Say *follow* and a stock (e.g. *follow GCB*) to turn news back on.",
      buttons: [{ id: "flow:menu", title: "Menu" }],
    });
  }

  const [, field, value] = /^plan:(\w+):(\w+)$/.exec(id) ?? [];
  if (field === "edit" && value) {
    if (t.flow.stage !== "plan") return editPlan(t).then(() => showField(t, value));
    return showField(t, value);
  }
  if (field && value) return planChoice(t, field, value);

  // A Confirm tap only counts for the exact draft its card showed (see fingerprint()).
  const [, draftKind, draftPrint] = /^(mandate|holdings):confirm(?::([0-9a-f]{12}))?$/.exec(id) ?? [];
  if (draftKind) {
    const current = draftKind === "mandate" ? (user.mandateConfirmed ? null : user.mandate) : user.holdingsDraft;
    if (!current) return deliver(t, withMenu(t, "There's nothing waiting to be confirmed."));
    if (draftPrint !== (await fingerprint(current))) {
      await db.audit(to, "stale_confirm", { kind: draftKind });
      const fresh = `${draftKind}:confirm:${await fingerprint(current)}`;
      return deliver(t, {
        text: `That card is out of date, so I haven't confirmed anything. Here's what's waiting now:

${
          draftKind === "mandate" ? mandateCard(user.mandate!, user.profile?.done?.risk) : holdingsDraftCard(user.holdingsDraft!, quotes)
        }`,
        buttons: [
          { id: fresh, title: draftKind === "mandate" ? "Confirm" : "Looks right" },
          { id: draftKind === "mandate" ? "mandate:change" : "holdings:fix", title: draftKind === "mandate" ? "Change something" : "Fix something" },
        ],
      });
    }
    id = `${draftKind}:confirm`;
  }

  switch (id) {
    case "flow:start":
      return t.flow.stage === "welcome" ? startProfile(t, false) : deliver(t, await currentUi(t));
    case "flow:how":
      return deliver(t, t.flow.stage === "ready" ? withMenu(t, HOW_IT_WORKS) : { text: HOW_IT_WORKS, buttons: [{ id: t.flow.stage === "welcome" ? "flow:start" : "flow:continue", title: t.flow.stage === "welcome" ? "Let's start" : "Continue setup" }] });
    case "flow:continue":
      return deliver(t, await currentUi(t));
    case "flow:menu":
      return runMenuAction(t, "menu");
    case "flow:home":
      if (t.flow.stage === "plan" && t.flow.editing) t.flow = { stage: "ready" };
      await saveFlow(t);
      return deliver(t, t.flow.stage === "ready" ? withMenu(t, "Okay. What would you like to do?") : await currentUi(t));
    case "flow:reset_yes":
      await db.reset(to);
      t.user = await db.user(to, user.name ?? undefined);
      t.flow = { stage: "welcome" };
      await saveFlow(t);
      return deliver(t, welcomeUi(t));
    case "flow:profile_ok":
      return profileOk(t);
    case "flow:profile_retake":
      return startProfile(t, true);
    case "plan:confirm":
      return t.flow.stage === "plan" ? confirmPlan(t) : deliver(t, await currentUi(t));
    case "plan:edit":
      return t.flow.stage === "plan" ? deliver(t, editUi(t.flow.plan ?? {}, user.profile?.done)) : editPlan(t);
    case "plan:review":
      if (t.flow.stage !== "plan") return deliver(t, await currentUi(t));
      t.flow.awaiting = undefined;
      await saveFlow(t);
      return deliver(t, reviewUi(t.flow.plan ?? {}, user.profile?.done, t.flow.editing ?? false));
    case "mandate:confirm": {
      // A plan the agent drafted from chat after setup.
      if (!(await db.confirmMandate(to))) return deliver(t, await currentUi(t));
      await db.audit(to, "plan_confirmed", user.mandate);
      return deliver(t, withMenu(t, "✅ Plan updated. I'll work within it from now on."));
    }
    case "mandate:change":
      return editPlan(t);
    case "hold:yes":
    case "hold:more":
      return deliver(t, holdingsHowUi());
    case "hold:form":
      return openHoldingsForm(t);
    case "hold:text":
      t.flow.awaiting = "holdings";
      await saveFlow(t);
      return deliver(t, { text: "Tell me what you own, e.g. *\"200 MTN at 1.80, and some GCB I paid 3,000 cedis for\"*. Typing or a voice note is fine." });
    case "hold:no":
    case "hold:done":
      return t.flow.stage === "holdings" ? finishSetup(t) : deliver(t, withMenu(t, "Okay."));
    case "holdings:confirm": {
      const draft = user.holdingsDraft;
      if (!draft) return deliver(t, withMenu(t, "There's nothing waiting to be saved."));
      const holdings = draft.map((h) => costHolding(h, quotes)).flatMap((c) => (c.ok ? [c.holding] : []));
      await db.upsertHoldings(to, holdings);
      await db.audit(to, "holdings_saved", holdings);
      return holdingsAfterSave(t);
    }
    case "holdings:fix":
      t.flow.awaiting = "holdings";
      await saveFlow(t);
      await db.addMessage(to, "user", "Some of those holdings are wrong.");
      return deliver(t, { text: "No problem. Tell me what to change, e.g. *\"it's 250 MTN, not 200\"*." });
    case "portfolio:insights":
      return converse(t, "How diversified is my portfolio, and what has it paid in dividends? Use the portfolio insights.");
    case "invest:now":
      return converse(t, AGENT_PROMPTS.invest!);
    case "invest:skip":
      await db.addMessage(to, "user", "Not this month.");
      return deliver(t, withMenu(t, "No problem. I'll remind you next month."));
    default: {
      const choice = menuAction({ buttonId: id }, false, t.flow.stage === "ready");
      return choice ? runMenuAction(t, choice) : deliver(t, await currentUi(t));
    }
  }
}

async function showField(t: Turn, field: string): Promise<void> {
  const plan = t.flow.plan ?? {};
  if (field === "stocks") {
    t.flow.awaiting = "stocks";
    await saveFlow(t);
  }
  return deliver(t, fieldUi(field, plan, t.user.profile?.done) ?? editUi(plan, t.user.profile?.done));
}

// ── Voice ─────────────────────────────────────────────────────────────────

/** Voice note → text, via Muse Voice Transcribe. Returns null (after telling the user) if it can't be heard. */
/**
 * Voice note → text: Muse Voice Transcribe for English and Pidgin, Khaya for Ghanaian languages.
 * WhatsApp sends Ogg Opus (decoded here); the web page sends a 16 kHz WAV it made in the browser.
 * The transcript is echoed back as heard, in the investor's own words.
 */
async function hear(t: Turn, message: Inbound): Promise<string | null> {
  let wav: Uint8Array;
  if (message.wav) wav = message.wav;
  else {
    const { bytes, mimeType } = await downloadMedia(whatsappConfig(t.env), message.mediaId ?? "");
    if (!mimeType.startsWith("audio/ogg")) {
      await deliver(t, { text: "I can only listen to WhatsApp voice notes. Could you record one, or type it?" });
      return null;
    }
    wav = await oggOpusToWav(bytes);
  }
  // Listen in the language they've been using. English and Pidgin are always Muse's: Khaya isn't used for
  // English. Only when Muse hears nothing, or what it heard is clearly a Ghanaian language, does Khaya
  // try Twi, Ghana's most spoken language.
  const lang = languageOf(t.user.lang);
  const key = t.env.KHAYA_API_KEY;
  const muse = () => transcribe(t.env.MODEL_API_KEY, wav).catch(() => "");
  const khaya = (code: string) => (key ? khayaTranscribe(key, wav, code).catch(() => "") : Promise.resolve(""));
  let transcript: string;
  let by: string;
  if (lang.asr.by === "khaya") {
    transcript = await khaya(lang.asr.code);
    by = `khaya:${lang.asr.code}`;
    if (!transcript) [transcript, by] = [await muse(), "muse"];
  } else {
    transcript = await muse();
    by = "muse";
    const heardAs = transcript && !clearlyEnglish(transcript) ? await detectLanguage(metaClient(t.env.MODEL_API_KEY), t.env.META_MODEL, transcript) : "en";
    const ghanaian = heardAs !== null && heardAs !== "en" && heardAs !== "pcm";
    if (key && (!transcript || ghanaian)) {
      const twi = await khaya("twi");
      if (twi) [transcript, by] = [twi, "khaya:twi"];
    }
  }
  await t.db.audit(t.to, "voice", { bytes: wav.length, lang: lang.code, by, transcript });
  if (!transcript) {
    await deliver(t, { text: "Sorry, I couldn't make that out. Could you try again, or type it?" });
    return null;
  }
  await t.send.raw.text(t.to, `🎙️ _"${transcript.slice(0, 500)}"_`);
  return transcript.slice(0, 500);
}

/**
 * Answer the way they asked: if this message is clearly in another language Sika speaks, switch to it.
 * Short replies ("ok", "2", "follow GCB") never switch, so mixing in English doesn't flip the language.
 */
async function followLanguage(t: Turn, text: string): Promise<void> {
  const current = t.user.lang ?? "en";
  const first = !t.user.lang;
  if (!first && (tooShortToTell(text) || text.trim().split(/\s+/).length < 3)) return;
  if (followCommand(text, t.quotes)) return;
  const detected = await detectLanguage(metaClient(t.env.MODEL_API_KEY), t.env.META_MODEL, text);
  if (!detected || (detected === current && !first)) return;
  // Without Khaya, Sika can still follow English and Pidgin and Hausa (Muse Spark translates those).
  if (!t.env.KHAYA_API_KEY && languageOf(detected).translate.by === "khaya") return;
  await t.db.setLang(t.to, detected);
  if (detected !== current) await t.db.audit(t.to, "language_detected", { from: t.user.lang, to: detected, text: text.slice(0, 200) });
  t.user.lang = detected;
  t.send.forget(t.to);
}

/** What the investor wrote or said → English for Sika's flows (commands, numbers and tickers pass through). */
async function inEnglish(t: Turn, text: string): Promise<string> {
  const lang = t.user.lang;
  if (!lang || lang === "en" || /^\/|^\d{1,2}$/.test(text.trim()) || followCommand(text, t.quotes)) return text;
  const english = await toEnglish({ khayaKey: t.env.KHAYA_API_KEY, meta: metaClient(t.env.MODEL_API_KEY), model: t.env.META_MODEL, cache: t.db.translations() }, text, lang);
  if (english !== text) await t.db.audit(t.to, "translated_in", { lang, original: text, english });
  return english;
}

// ── Entry point ───────────────────────────────────────────────────────────

export async function handle(message: Inbound, env: Env, send: Sender = whatsappSender(env), waitUntil?: (p: Promise<unknown>) => void): Promise<void> {
  const db = new Db(env.DB);
  if (!(await db.firstDelivery(message.id))) return;
  await send.typing(message.id);

  const to = message.from;
  const user = await db.user(to, message.name);
  const flow = inferFlow(user.flow, user.profile !== null, user.mandateConfirmed, (await db.holdings(to)).length);
  const quotes = new Map<string, Quote>((await fetchQuotes()).map((q) => [q.symbol, q]));
  const t: Turn = { db, env, send: localizedSender(env, send, db), to, user, flow, quotes, waitUntil };
  await route(t, message);
  // Reply in the investor's mode: a voice note after the text when they spoke (or always, if they chose that).
  await t.send.speak(to, message.kind === "audio");
}

async function route(t: Turn, message: Inbound): Promise<void> {
  const { db, to, user, flow, quotes } = t;

  if (message.kind === "other") {
    await deliver(t, { text: "I can read text and listen to voice notes. Could you send it as one of those?" });
    return deliver(t, await currentUi(t));
  }
  if (message.kind === "button") return handleButton(t, message.buttonId ?? "");
  if (message.kind === "form") return handleHoldingForm(t, message.form ?? {});

  const heard = message.kind === "audio" ? await hear(t, message) : (message.text ?? "");
  if (!heard) return;
  await followLanguage(t, heard);
  const text = await inEnglish(t, heard);
  const greeting = isGreeting(heard) || isGreeting(text);

  // First message ever: a greeting gets the welcome; a question gets answered first, then a short invitation.
  if (!user.flow && flow.stage === "welcome") {
    await saveFlow(t);
    await db.addMessage(to, "user", text);
    return greeting ? deliver(t, welcomeUi(t)) : answerThenResume(t, text, "welcome, before setup has started", inviteUi());
  }

  const follow = followCommand(text, quotes);
  if (follow) return followStock(t, follow.on, follow.symbol, text);

  const lastAssistant = (await db.history(to, 1))[0];
  const choice = menuAction({ text }, lastAssistant?.role === "assistant" && lastAssistant.content === MENU_MARKER, flow.stage === "ready");
  if (choice) return runMenuAction(t, choice);

  if (flow.awaiting === "form") return formInput(t, { text });

  switch (flow.stage) {
    case "welcome":
      await db.addMessage(to, "user", text);
      return greeting ? startProfile(t, false) : answerThenResume(t, text, "welcome, before setup has started", inviteUi());
    case "profile":
      await db.addMessage(to, "user", text);
      return profileText(t, text);
    case "plan":
      await db.addMessage(to, "user", text);
      return planText(t, text);
    case "holdings":
      if (/^(no|none|nothing|starting fresh|i don'?t (own|have) any)/i.test(text.trim())) return finishSetup(t);
      return converse(t, text);
    case "ready":
      if (flow.awaiting === "profile") {
        await db.addMessage(to, "user", text);
        return profileText(t, text);
      }
      return converse(t, text);
  }
}
