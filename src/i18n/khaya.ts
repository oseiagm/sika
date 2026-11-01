/**
 * Khaya (GhanaNLP): translation, speech to text and text to speech for Ghanaian languages.
 * One key, sent as Azure API Management's subscription header. Checked against the live API on 1 Nov 2026:
 * translate returns a JSON string, ASR v3 returns {text, warnings}, TTS returns a WAV (16 kHz mono float).
 */
const BASE = "https://translation-api.ghananlp.org";
const TIMEOUT_MS = 25_000;

export class KhayaError extends Error {}

async function call(key: string, path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Ocp-Apim-Subscription-Key": key, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new KhayaError(`Khaya ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** Translates one line. `pair` is e.g. "en-tw" or "tw-en". */
export async function khayaTranslate(key: string, text: string, pair: string): Promise<string> {
  const res = await call(key, "/v1/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ in: text, lang: pair }) });
  const body = (await res.json()) as unknown;
  if (typeof body !== "string") throw new KhayaError("Khaya translate: unexpected response");
  return body.trim();
}

/** A 16 kHz mono WAV voice note → text in that language. */
export async function khayaTranscribe(key: string, wav: Uint8Array, language: string): Promise<string> {
  const res = await call(key, `/asr/v3/transcribe?language=${encodeURIComponent(language)}`, { method: "POST", headers: { "content-type": "audio/wav" }, body: wav });
  const body = (await res.json()) as unknown;
  if (typeof body === "string") return body.trim();
  return String((body as { text?: unknown })?.text ?? "").trim();
}

/** Text → speech, as a WAV file. */
export async function khayaSpeak(key: string, text: string, language: string): Promise<Uint8Array> {
  const res = await call(key, "/tts/v1/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, language }) });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF") throw new KhayaError("Khaya TTS: not a WAV");
  return bytes;
}
