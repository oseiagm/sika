import type OpenAI from "openai";
import type { Db } from "../db";
import type { Sender } from "../handle";
import { khayaSpeak } from "./khaya";
import { languageOf, wantsVoice, type Lang, type VoiceReplies } from "./languages";
import { fromEnglish, label, type TranslateDeps } from "./translate";

/** WhatsApp's limits for interactive labels. */
const BUTTON_MAX = 20;
const ROW_TITLE_MAX = 24;
const ROW_DESC_MAX = 72;

export interface Prefs {
  lang: Lang;
  voiceReplies: VoiceReplies;
}

export interface LocalizedSender extends Sender {
  /** The underlying sender, for messages that must go out exactly as written (the language picker, a transcript echo). */
  raw: Sender;
  /** Call after changing someone's language mid-turn. */
  forget(to: string): void;
  /** After the turn: a short voice note of what was said, when the investor's setting asks for one. */
  speak(to: string, spoke: boolean): Promise<void>;
}

export interface LocalizeDeps {
  db: Db;
  meta: Pick<OpenAI, "chat">;
  model: string;
  khayaKey?: string;
}

/** Spark turns the turn's messages into what a person would say in a voice note: the gist, not the card. */
async function spokenScript(d: LocalizeDeps, said: string[]): Promise<string> {
  const res = await d.meta.chat.completions.create({
    model: d.model,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content:
          "You turn Sika's WhatsApp messages into a short voice note, spoken by Sika. At most 45 words, plain spoken English, warm. Give the gist only: say what matters and what to tap next. Round amounts (\"about 500 cedis\"), say tickers as company names when obvious, never read lists, charges or links. If there's a suggestion card, say what's suggested and that the details are in the message. No emoji, no markdown. Reply with the script only.",
      },
      { role: "user", content: said.join("\n\n---\n\n").slice(0, 6000) },
    ],
  });
  return (res.choices[0]?.message?.content ?? "").replace(/[*_#•]/g, "").trim();
}

/**
 * Wraps a sender so everything Sika sends is in the investor's language: message text line by line
 * (facts checked), button and list labels when they fit, and an optional voice note after the turn.
 * Ids, numbers, tickers and links never change. Sika's history and audit trail stay in English.
 */
export function localize(base: Sender, d: LocalizeDeps, prefsOf: (to: string) => Promise<Prefs>): LocalizedSender {
  const prefs = new Map<string, Promise<Prefs>>();
  const said = new Map<string, string[]>();
  const get = (to: string) => {
    if (!prefs.has(to)) prefs.set(to, prefsOf(to).catch(() => ({ lang: "en" as Lang, voiceReplies: "match" as VoiceReplies })));
    return prefs.get(to)!;
  };
  const tdeps: TranslateDeps = { khayaKey: d.khayaKey, meta: d.meta, model: d.model, cache: d.db.translations() };

  const body = async (to: string, text: string) => {
    said.set(to, [...(said.get(to) ?? []), text]);
    const { lang } = await get(to);
    if (lang === "en") return text;
    const out = await fromEnglish(tdeps, text, lang);
    if (out.fellBack > 0) await d.db.audit(to, "localized", { lang, fellBack: out.fellBack });
    return out.text;
  };
  const lbl = async (to: string, text: string, max: number) => {
    const { lang } = await get(to);
    return lang === "en" ? text : label(tdeps, text, lang, max);
  };

  return {
    raw: base,
    forget: (to) => void prefs.delete(to),
    text: async (to, text) => base.text(to, await body(to, text)),
    buttons: async (to, text, buttons) =>
      base.buttons(to, await body(to, text), await Promise.all(buttons.map(async (b) => ({ id: b.id, title: await lbl(to, b.title, BUTTON_MAX) })))),
    list: async (to, text, button, rows) =>
      base.list(
        to,
        await body(to, text),
        await lbl(to, button, BUTTON_MAX),
        await Promise.all(
          rows.map(async (r) => ({ id: r.id, title: await lbl(to, r.title, ROW_TITLE_MAX), ...(r.description ? { description: await lbl(to, r.description, ROW_DESC_MAX) } : {}) })),
        ),
      ),
    image: async (to, url, caption) => base.image(to, url, caption ? await body(to, caption) : caption),
    flow: async (to, text, data) => base.flow(to, await body(to, text), data),
    template: (to, name, params, payload) => base.template(to, name, params, payload),
    voice: (to, wav) => base.voice(to, wav),
    typing: (id) => base.typing(id),

    async speak(to, spoke) {
      const lines = said.get(to) ?? [];
      said.delete(to);
      const p = await get(to);
      if (!lines.length || !wantsVoice(p.voiceReplies, spoke) || !d.khayaKey) return;
      try {
        const script = await spokenScript(d, lines);
        if (!script) return;
        const spoken = p.lang === "en" ? script : (await fromEnglish(tdeps, script, p.lang)).text;
        const wav = await khayaSpeak(d.khayaKey, spoken, languageOf(p.lang).tts);
        await base.voice(to, wav);
        await d.db.audit(to, "voice_reply", { lang: p.lang, script, spoken });
      } catch (err) {
        // The text has already gone out; a missing voice note loses nothing.
        console.error("voice reply failed", err);
        await d.db.audit(to, "voice_reply_failed", { error: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}
