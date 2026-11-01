import { Hono } from "hono";
import { ghs } from "./fees/engine";
import { checkPriceAlerts, monthlyReminder } from "./alerts/monitor";
import { checkNews } from "./news/monitor";
import { handle, localizedSender, whatsappSender } from "./handle";
import { prepareMarket, recordTape } from "./market/replay";
import { devSeedPage } from "./web/devSeed";
import { TRY_PAGE } from "./web/tryPage";
import { web } from "./web/routes";
import { fetchQuotes } from "./market/quotes";
import { oggOpusToWav } from "./voice/opus";
import { transcribe } from "./voice/transcribe";
import { sendText } from "./whatsapp/client";
import { parseInbound, verifySignature, type Inbound } from "./whatsapp/webhook";

export interface Env {
  DB: D1Database;
  META_MODEL: string;
  MODEL_API_KEY: string;
  WA_PHONE_NUMBER_ID: string;
  WA_ACCESS_TOKEN: string;
  WA_APP_SECRET: string;
  WA_VERIFY_TOKEN: string;
  /** "replay" serves the last recorded GSE session instead of live IC data (weekend or after-hours demos). */
  MARKET_MODE?: string;
  /** Where the web pages live, for links sent in chat. */
  PUBLIC_BASE_URL?: string;
  /** WhatsApp Flow for adding a holding (scripts/setup-whatsapp.mjs prints it). */
  WA_HOLDING_FLOW_ID?: string;
  /** Approved template for updates outside the 24-hour window (scripts/setup-whatsapp.mjs submits it). Unset: those updates are skipped. */
  WA_UPDATE_TEMPLATE?: string;
  /** The template's language code (default en). */
  WA_TEMPLATE_LANG?: string;
  /** "1" only in local dev: enables POST /dev/chat. */
  DEV_CHAT?: string;
  /** Khaya (GhanaNLP) key: Ghanaian-language translation, voice notes and voice replies. Unset: English only, no voice replies. */
  KHAYA_API_KEY?: string;
  INBOX: Queue<Inbound>;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.html(TRY_PAGE));
// Old links.
app.get("/try", (c) => c.redirect("/", 301));
app.route("/", web);

app.get("/quotes", async (c) => {
  const quotes = await fetchQuotes();
  return c.json(
    quotes.map((q) => ({ ...q, last: ghs(q.last), prevClose: ghs(q.prevClose), bid: q.bid && ghs(q.bid), ask: q.ask && ghs(q.ask) })),
  );
});

// Local testing without WhatsApp: runs the same handler and returns the replies.
app.post("/dev/chat", async (c) => {
  if (c.env.DEV_CHAT !== "1") return c.notFound();
  await prepareMarket(c.env);
  const { from = "dev", text, buttonId, form } = await c.req.json<{ from?: string; text?: string; buttonId?: string; form?: Record<string, string> }>();
  const replies: { text: string; buttons?: string[] }[] = [];
  const message: Inbound = form
    ? { id: crypto.randomUUID(), from, timestamp: Date.now(), kind: "form", form }
    : buttonId
    ? { id: crypto.randomUUID(), from, timestamp: Date.now(), kind: "button", buttonId, text: buttonId }
    : { id: crypto.randomUUID(), from, timestamp: Date.now(), kind: "text", text: text ?? "" };
  await handle(message, c.env, {
    text: async (_to, body) => void replies.push({ text: body }),
    buttons: async (_to, body, buttons) => void replies.push({ text: body, buttons: buttons.map((b) => b.id) }),
    list: async (_to, body, _button, rows) => void replies.push({ text: body, buttons: rows.map((r) => r.id) }),
    flow: async (_to, body) => void replies.push({ text: `[form] ${body}` }),
    image: async (_to, url, caption) => void replies.push({ text: `[image] ${caption ?? ""} ${url}` }),
    template: async (_to, name, params, payload) => void replies.push({ text: `[template ${name}] ${params.join(" · ")}`, buttons: [payload] }),
    voice: async (_to, wav) => void replies.push({ text: `[voice note] ${wav.length} bytes` }),
    typing: async () => {},
  });
  return c.json(replies);
});

app.get("/dev/seed", (c) => (c.env.DEV_CHAT === "1" ? c.html(devSeedPage()) : c.notFound()));

// Local testing of the scheduled jobs, with replies collected instead of sent.
app.post("/dev/cron/:job", async (c) => {
  if (c.env.DEV_CHAT !== "1") return c.notFound();
  const sent: { to: string; text: string; buttons?: string[] }[] = [];
  const send = {
    text: async (to: string, text: string) => void sent.push({ to, text }),
    buttons: async (to: string, text: string, buttons: { id: string }[]) => void sent.push({ to, text, buttons: buttons.map((b) => b.id) }),
    list: async (to: string, text: string) => void sent.push({ to, text }),
    flow: async (to: string, text: string) => void sent.push({ to, text }),
    image: async (to: string, url: string) => void sent.push({ to, text: `[image] ${url}` }),
    template: async (to: string, name: string, params: string[], payload: string) => void sent.push({ to, text: `[template ${name}] ${params.join(" · ")}`, buttons: [payload] }),
    voice: async (to: string, wav: Uint8Array) => void sent.push({ to, text: `[voice note] ${wav.length} bytes` }),
    typing: async () => {},
  };
  if (c.req.param("job") === "record") await recordTape(c.env);
  else if (c.req.param("job") === "alerts") await checkPriceAlerts(c.env, localizedSender(c.env, send));
  else if (c.req.param("job") === "news") await checkNews(c.env, localizedSender(c.env, send));
  else await monthlyReminder(c.env, localizedSender(c.env, send));
  return c.json(sent);
});

// Local testing of voice notes: POST an Ogg Opus file, get the transcript.
app.post("/dev/voice", async (c) => {
  if (c.env.DEV_CHAT !== "1") return c.notFound();
  const started = Date.now();
  const wav = await oggOpusToWav(new Uint8Array(await c.req.arrayBuffer()));
  const decodedMs = Date.now() - started;
  return c.json({ wavBytes: wav.length, decodedMs, transcript: await transcribe(c.env.MODEL_API_KEY, wav) });
});

// Meta calls this once when the webhook is saved in the app dashboard.
app.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token === c.env.WA_VERIFY_TOKEN && challenge) return c.text(challenge);
  return c.text("Forbidden", 403);
});

// Acknowledge fast and hand the work to the queue; Meta retries anything slower than a few seconds.
app.post("/webhook", async (c) => {
  const raw = await c.req.arrayBuffer();
  if (!(await verifySignature(raw, c.req.header("x-hub-signature-256"), c.env.WA_APP_SECRET))) {
    return c.text("Bad signature", 401);
  }
  const payload = JSON.parse(new TextDecoder().decode(raw));
  // WhatsApp reports failed deliveries separately; log them so they show up in the Worker logs.
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const st of change?.value?.statuses ?? []) {
        if (st.status === "failed") console.error("delivery failed", st.id, JSON.stringify(st.errors ?? []));
      }
    }
  }
  const messages = parseInbound(payload);
  if (messages.length > 0) await c.env.INBOX.sendBatch(messages.map((body) => ({ body })));
  return c.text("OK");
});

/** Cron schedules (UTC, which is also Accra time). Keep in step with wrangler.jsonc. */
const PRICE_ALERTS = "*/30 10-15 * * 1-5";
const MONTHLY_REMINDER = "0 9 * * *";
const NEWS_CHECK = "0 8,13 * * 1-5";

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    // Alerts, reminders and news go out in each investor's language.
    const send = localizedSender(env, whatsappSender(env));
    if (controller.cron === PRICE_ALERTS) {
      await recordTape(env).catch((err) => console.error("recording failed", err));
      await prepareMarket(env);
      await checkPriceAlerts(env, send);
    }
    else if (controller.cron === MONTHLY_REMINDER) await monthlyReminder(env, send);
    else if (controller.cron === NEWS_CHECK) await checkNews(env, send);
  },
  async queue(batch: MessageBatch<Inbound>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await prepareMarket(env);
        await handle(msg.body, env);
      } catch (err) {
        // Not retried: the message id is already marked handled, and a half-sent reply shouldn't repeat.
        console.error("handle failed", msg.body.id, err);
        await sendText({ phoneNumberId: env.WA_PHONE_NUMBER_ID, accessToken: env.WA_ACCESS_TOKEN }, msg.body.from, "Sorry, something went wrong on my side. Please try again.").catch(() => {});
      }
      msg.ack();
    }
  },
} satisfies ExportedHandler<Env, Inbound>;
