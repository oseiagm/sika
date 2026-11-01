import { Hono, type Context } from "hono";
import { Db } from "../db";
import { handle, type Sender } from "../handle";
import type { Env } from "../index";
import { fetchQuotes } from "../market/quotes";
import { prepareMarket } from "../market/replay";
import { transcribe } from "../voice/transcribe";
import { isVoiceWav, MAX_VOICE_BYTES } from "../voice/wav";
import type { ListRow } from "../whatsapp/client";
import type { Inbound } from "../whatsapp/webhook";
import { activityPage } from "./activity";

/**
 * Web visitors can't spend more than this of the model budget. Sessions are chosen by the browser, so
 * the per-network allowance is what actually limits one visitor; the daily total caps everyone.
 */
const LIMITS = { perSession: 80, perNetwork: 150, perDay: 1500 };

async function networkKey(c: { req: { header(name: string): string | undefined } }): Promise<string> {
  // Cloudflare sets CF-Connecting-IP; it can't be supplied by the client. Only a salted hash is stored.
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`sika-try:${day}:${ip}`));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Reply {
  text: string;
  buttons?: { id: string; title: string }[];
  list?: { button: string; rows: ListRow[] };
  image?: string;
}

export const web = new Hono<{ Bindings: Env }>();

// Every web request sees live IC data, or the recorded session when MARKET_MODE=replay.
web.use("*", async (c, next) => {
  await prepareMarket(c.env);
  await next();
});


/** One investor's decisions, step by step. The link is a secret token, so it's private unless shared. */
web.get("/activity/:token", async (c) => {
  const token = c.req.param("token");
  if (!/^[0-9a-f]{24}$/.test(token)) return c.notFound();
  const db = new Db(c.env.DB);
  const waId = await db.userByViewToken(token);
  if (!waId) return c.notFound();
  if (c.req.query("format") === "json") {
    // For the red-team script: every intent, whether a human approved it, and whether it filled.
    const trail = await db.auditTrail(waId, 1000);
    const approved = new Set(trail.filter((e) => e.kind === "approved").map((e) => (e.detail as { id: string }).id));
    const fills = await db.fillsFor(waId);
    const user = await db.user(waId);
    return c.json({
      intents: (await db.intentsFor(waId)).map((i) => ({ id: i.id, side: i.side, symbol: i.symbol, shares: String(i.shares), net: String(i.net), status: i.status, approvedByTap: approved.has(i.id), checksPassed: i.verdict.ok })),
      fills: fills.map((f) => ({ intentId: f.intentId, shares: f.shares, net: f.net })),
      blocked: trail.filter((e) => e.kind === "policy" && (e.detail as { verdict?: { ok: boolean } }).verdict?.ok === false).length,
      mandate: user.mandate,
    });
  }
  const quotes = new Map((await fetchQuotes()).map((q) => [q.symbol, q]));
  return c.html(await activityPage(db, waId, quotes), 200, { "cache-control": "no-store", "x-robots-tag": "noindex" });
});

/** Only the try page itself may call the chat routes from a browser. */
const sameOrigin = (c: { req: { header(name: string): string | undefined; url: string } }) => {
  const origin = c.req.header("origin");
  return !origin || origin === new URL(c.req.url).origin;
};
const validSession = (s: string) => /^[0-9a-f]{16,32}$/.test(s);

/** Counts one message against the demo's allowances; false once one is used up. */
async function allow(c: Context<{ Bindings: Env }>, db: Db, session: string): Promise<boolean> {
  // Local development (and the red-team script) runs everything from one network.
  const limits = c.env.DEV_CHAT === "1" ? { ...LIMITS, perNetwork: 100_000 } : LIMITS;
  return db.allowTryMessage(session, await networkKey(c), limits);
}
const LIMIT_REACHED = "The demo has reached today's message limit. Please come back tomorrow.";

/** Runs one message through exactly the same handler as WhatsApp; Sika's replies are added to `replies`. */
async function runTurn(c: Context<{ Bindings: Env }>, db: Db, session: string, message: Omit<Inbound, "id" | "from" | "timestamp">, replies: Reply[]) {
  const send: Sender = {
    text: async (_to, t) => void replies.push({ text: t }),
    buttons: async (_to, t, buttons) => void replies.push({ text: t, buttons }),
    list: async (_to, t, button, rows) => void replies.push({ text: t, list: { button, rows } }),
    flow: async (_to, t) => void replies.push({ text: t }),
    image: async (_to, url, caption) => void replies.push({ text: caption ?? "", image: url }),
    template: async (_to, _name, params) => void replies.push({ text: params.join(" · ") }),
    typing: async () => {},
  };
  const from = `web-${session}`;
  try {
    await handle({ ...message, id: crypto.randomUUID(), from, timestamp: Date.now() } as Inbound, c.env, send);
  } catch (err) {
    console.error("web chat failed", err);
    replies.push({ text: "Something went wrong on my side. Please try that again." });
  }
  return `/activity/${await db.viewToken(from)}`;
}

web.post("/api/try/chat", async (c) => {
  if (!sameOrigin(c)) return c.json({ error: "Not allowed." }, 403);
  const body = await c.req.json<{ session?: string; text?: string; buttonId?: string }>().catch(() => ({}) as { session?: string; text?: string; buttonId?: string });
  const session = body.session ?? "";
  if (!validSession(session)) return c.json({ error: "Refresh the page to start a new chat." }, 400);
  const text = (body.text ?? "").slice(0, 500);
  const buttonId = (body.buttonId ?? "").slice(0, 120);
  if (!text && !buttonId) return c.json({ error: "Type a message first." }, 400);

  const db = new Db(c.env.DB);
  if (!(await allow(c, db, session))) return c.json({ error: LIMIT_REACHED }, 429);
  const replies: Reply[] = [];
  const activity = await runTurn(c, db, session, buttonId ? { kind: "button", buttonId } : { kind: "text", text }, replies);
  return c.json({ replies, activity });
});

/**
 * A voice note from the try page. The browser records it and converts it to a 16 kHz WAV, so the
 * server goes straight to Muse Voice Transcribe (WhatsApp's Ogg Opus notes are decoded first instead).
 * Like on WhatsApp, Sika first shows what it heard, then answers it.
 */
web.post("/api/try/voice", async (c) => {
  if (!sameOrigin(c)) return c.json({ error: "Not allowed." }, 403);
  const session = c.req.query("session") ?? "";
  if (!validSession(session)) return c.json({ error: "Refresh the page to start a new chat." }, 400);
  if (Number(c.req.header("content-length") ?? 0) > MAX_VOICE_BYTES) return c.json({ error: "Voice notes can be up to a minute long." }, 413);
  const wav = new Uint8Array(await c.req.arrayBuffer());
  if (!isVoiceWav(wav)) return c.json({ error: wav.length > MAX_VOICE_BYTES ? "Voice notes can be up to a minute long." : "That recording didn't come through. Please try again." }, 400);

  const db = new Db(c.env.DB);
  if (!(await allow(c, db, session))) return c.json({ error: LIMIT_REACHED }, 429);

  let transcript = "";
  try {
    transcript = (await transcribe(c.env.MODEL_API_KEY, wav)).slice(0, 500);
  } catch (err) {
    console.error("web voice failed", err);
  }
  await db.audit(`web-${session}`, "voice", { bytes: wav.length, transcript, channel: "web" });
  if (!transcript) {
    return c.json({ transcript: "", replies: [{ text: "Sorry, I couldn't make that out. Could you try again, or type it?" }], activity: `/activity/${await db.viewToken(`web-${session}`)}` });
  }
  const replies: Reply[] = [{ text: `🎙️ _"${transcript}"_` }];
  const activity = await runTurn(c, db, session, { kind: "text", text: transcript }, replies);
  return c.json({ transcript, replies, activity });
});
