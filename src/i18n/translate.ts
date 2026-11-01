import type OpenAI from "openai";
import { clearlyEnglish } from "./detect";
import { khayaTranslate } from "./khaya";
import { languageOf, type Lang } from "./languages";

/**
 * Sika thinks in English and speaks the investor's language. Messages are translated line by line
 * (Khaya merges lines), lines that are just numbers stay as they are, and any translated line that
 * loses an amount, ticker or link falls back to English: translating money wrongly is worse than not
 * translating it.
 */

export interface TranslationCache {
  get(key: string): Promise<string | null>;
  put(key: string, text: string): Promise<void>;
}

export interface TranslateDeps {
  khayaKey?: string;
  meta: Pick<OpenAI, "chat">;
  model: string;
  cache?: TranslationCache;
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
/** Tickers, GHS and other all-capital words that must survive unchanged. */
const CAPS_RE = /\b[A-Z][A-Z0-9]{1,}\b/g;

/** The facts in a line: numbers, all-capital words (tickers, GHS) and links. */
export function factsOf(text: string): string[] {
  const urls = text.match(URL_RE) ?? [];
  const rest = urls.reduce((t, u) => t.replace(u, " "), text);
  return [...urls, ...(rest.match(NUMBER_RE) ?? []), ...(rest.match(CAPS_RE) ?? [])];
}

/** True when every fact in the English line appears unchanged in the translation. */
export function keepsFacts(source: string, translated: string): boolean {
  return factsOf(source).every((f) => translated.includes(f));
}

/** Bullets, numbering, emoji and bold or italic markers around a line, kept out of the translation. */
export function splitDecor(line: string): { pre: string; core: string; post: string } {
  const pre = /^\s*(?:[•\-–]\s+|\d+[.)]\s+|(?:\p{Extended_Pictographic}|️|‍|⃣)+\s*)*[*_]?/u.exec(line)?.[0] ?? "";
  let core = line.slice(pre.length);
  const post = /[*_]?[:\s]*$/.exec(core)?.[0] ?? "";
  core = core.slice(0, core.length - post.length);
  return { pre, core, post };
}

/** Lines that are figures with a short label ("Gross: GHS 487.50", "Charges: GHS 12.19 (2.50% tier)") stay as they are. */
export function keepAsIs(core: string): boolean {
  const words = core.replace(URL_RE, " ").replace(NUMBER_RE, " ").replace(CAPS_RE, " ").match(/\p{L}{2,}/gu) ?? [];
  if (words.length === 0) return true;
  return /GHS|%/.test(core) && core.length <= 48 && words.length <= 4;
}

async function hash(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...d.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Several lines at once with Muse Spark (Pidgin, Hausa): a JSON array in, a JSON array out. */
async function sparkLines(d: TranslateDeps, lines: string[], from: string, to: string): Promise<(string | null)[]> {
  const res = await d.meta.chat.completions.create({
    model: d.model,
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content: `Translate each string from ${from} to ${to}, as a friendly WhatsApp assistant for Ghanaian investors would say it. Keep every number, amount, all-capital word (tickers like MTNGH, GHS) and link exactly as written. Reply with a JSON array of strings only, the same length and order as the input.`,
      },
      { role: "user", content: JSON.stringify(lines) },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "";
  try {
    const out = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)) as unknown;
    if (Array.isArray(out) && out.length === lines.length) return out.map((x) => (typeof x === "string" ? x : null));
  } catch {
    // fall through
  }
  return lines.map(() => null);
}

/** Translates lines between English and `lang`, using the cache; null where a line couldn't be translated. */
async function translateLines(d: TranslateDeps, lines: string[], lang: Lang, direction: "out" | "in"): Promise<(string | null)[]> {
  const l = languageOf(lang);
  if (l.translate.by === "none" || lines.length === 0) return lines;
  const keys = await Promise.all(lines.map((x) => hash(`${direction}:${lang}:${x}`)));
  const cached = await Promise.all(keys.map((k) => d.cache?.get(k) ?? null));
  const todo = lines.map((_, i) => i).filter((i) => cached[i] == null);
  let fresh: (string | null)[] = [];
  if (todo.length) {
    if (l.translate.by === "khaya") {
      if (!d.khayaKey) return lines.map(() => null);
      const code = l.translate.code;
      const pair = direction === "out" ? `en-${code}` : `${code}-en`;
      fresh = await Promise.all(todo.map((i) => khayaTranslate(d.khayaKey!, lines[i]!, pair).catch(() => null)));
    } else {
      const [from, to] = direction === "out" ? ["English", l.english] : [l.english, "English"];
      fresh = await sparkLines(d, todo.map((i) => lines[i]!), from, to).catch(() => todo.map(() => null));
    }
    await Promise.all(todo.map((i, n) => (fresh[n] && d.cache ? d.cache.put(keys[i]!, fresh[n]!) : undefined)));
  }
  return lines.map((_, i) => cached[i] ?? fresh[todo.indexOf(i)] ?? null);
}

export interface Localized {
  text: string;
  /** Lines kept in English because translating would have changed a fact, or the service failed. */
  fellBack: number;
}

/** An English message → the investor's language, line by line, facts checked. */
export async function fromEnglish(d: TranslateDeps, text: string, lang: Lang): Promise<Localized> {
  if (languageOf(lang).translate.by === "none" || !text.trim()) return { text, fellBack: 0 };
  const lines = text.split("\n").map(splitDecor);
  const todo = lines.map((x, i) => i).filter((i) => lines[i]!.core.trim() && !keepAsIs(lines[i]!.core));
  // Inner *bold* markers confuse translation; the wrapping ones are kept by splitDecor.
  const out = await translateLines(d, todo.map((i) => lines[i]!.core.replace(/[*_]/g, "")), lang, "out");
  let fellBack = 0;
  const result = lines.map((x, i) => {
    const n = todo.indexOf(i);
    if (n < 0) return x.pre + x.core + x.post;
    const t = out[n];
    if (!t || !keepsFacts(x.core, t)) {
      fellBack++;
      return x.pre + x.core + x.post;
    }
    // Khaya ends every line with a full stop; drop it where the English had none ("Fits your plan (8 checks)").
    return x.pre + (/[.!?]$/.test(x.core.trim()) ? t : t.replace(/\s*\.$/, "")) + x.post;
  });
  return { text: result.join("\n"), fellBack };
}

/** A short label (a button or list row): translated if it fits WhatsApp's limit, otherwise English. */
export async function label(d: TranslateDeps, text: string, lang: Lang, max: number): Promise<string> {
  if (languageOf(lang).translate.by === "none") return text;
  const { pre, core, post } = splitDecor(text);
  if (keepAsIs(core)) return text;
  const [t] = await translateLines(d, [core], lang, "out");
  const full = t && keepsFacts(core, t) ? pre + t + post : text;
  return full.length <= max ? full : text;
}

/** What the investor wrote → English for Sika's flows. Unchanged when it's already English or a fact would be lost. */
export async function toEnglish(d: TranslateDeps, text: string, lang: Lang): Promise<string> {
  if (languageOf(lang).translate.by === "none" || clearlyEnglish(text)) return text;
  const [t] = await translateLines(d, [text], lang, "in");
  return t && keepsFacts(text, t) ? t : text;
}
