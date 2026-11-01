import { khayaSpeak } from "../i18n/khaya";
import { languageOf, type Lang } from "../i18n/languages";

/**
 * Text → a spoken WAV for Sika's voice replies.
 * - English and Pidgin: Deepgram Aura-2 on Cloudflare Workers AI, a natural female voice ("luna" by default).
 *   Khaya's English voice sounded robotic, and Pidgin reads far better in a natural English voice than in
 *   Khaya's Nigerian Pidgin one.
 * - Ghanaian languages: Khaya's female voice.
 */

/** Female Aura-2 voices; `luna` is Aura-2's own default. */
export const AURA_FEMALE = ["luna", "asteria", "athena", "thalia", "helena", "hera", "aurora"] as const;
const AURA_RATE = 24_000;

export interface SpeechDeps {
  ai?: Ai;
  khayaKey?: string;
  /** An Aura-2 speaker name; defaults to luna. */
  englishVoice?: string;
}

/** Workers AI may hand the audio back as a stream, bytes, base64 text or { audio: base64 }. */
async function audioBytes(out: unknown): Promise<Uint8Array> {
  if (out instanceof Uint8Array) return out;
  if (out instanceof ArrayBuffer) return new Uint8Array(out);
  if (out instanceof ReadableStream) return new Uint8Array(await new Response(out).arrayBuffer());
  if (out instanceof Response) return new Uint8Array(await out.arrayBuffer());
  const b64 = typeof out === "string" ? out : typeof (out as { audio?: unknown })?.audio === "string" ? (out as { audio: string }).audio : null;
  if (b64) return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  throw new Error("Workers AI returned no audio");
}

/** True when a voice reply can be made for this language. */
export function canSpeak(d: SpeechDeps, lang: Lang): boolean {
  return languageOf(lang).tts.by === "aura" ? Boolean(d.ai) : Boolean(d.khayaKey);
}

export async function speak(d: SpeechDeps, text: string, lang: Lang): Promise<Uint8Array> {
  const tts = languageOf(lang).tts;
  if (tts.by === "aura") {
    if (!d.ai) throw new Error("No Workers AI binding");
    const speaker = (AURA_FEMALE as readonly string[]).includes(d.englishVoice ?? "") ? d.englishVoice! : "luna";
    const out = await d.ai.run("@cf/deepgram/aura-2-en", { text, speaker: speaker as "luna", encoding: "linear16", container: "wav", sample_rate: AURA_RATE } as never);
    const wav = await audioBytes(out);
    if (String.fromCharCode(...wav.subarray(0, 4)) !== "RIFF") throw new Error("Aura-2 didn't return a WAV");
    return wav;
  }
  if (!d.khayaKey) throw new Error("No Khaya key");
  return khayaSpeak(d.khayaKey, text, tts.code, "female");
}
