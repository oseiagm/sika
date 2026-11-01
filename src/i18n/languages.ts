/**
 * The languages Sika speaks, and which service handles each one.
 * Khaya (GhanaNLP) is built for Ghanaian languages; Muse covers English and Pidgin voice notes, and
 * Muse Spark translates Pidgin and Hausa (Khaya doesn't translate those).
 * Khaya's codes differ by service: translation pairs use e.g. "tw" and "ee", speech uses ISO 639-3 ("twi", "ewe").
 */
export type Lang = "en" | "pcm" | "tw" | "fat" | "gaa" | "ee" | "ha" | "dag";

export interface Language {
  code: Lang;
  /** The language's own name, as shown in the picker. */
  endonym: string;
  /** In English, for prompts and logs. */
  english: string;
  /** Speech to text: Muse Voice Transcribe, or Khaya with this language code. */
  asr: { by: "muse" } | { by: "khaya"; code: string };
  /** Translation to and from English: none, Khaya with this pair code, or Muse Spark. */
  translate: { by: "none" } | { by: "khaya"; code: string } | { by: "spark" };
  /** Khaya text-to-speech language code. */
  tts: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", endonym: "English", english: "English", asr: { by: "muse" }, translate: { by: "none" }, tts: "eng" },
  { code: "pcm", endonym: "Pidgin", english: "Ghanaian Pidgin English", asr: { by: "muse" }, translate: { by: "spark" }, tts: "pcm" },
  { code: "tw", endonym: "Twi", english: "Asante Twi", asr: { by: "khaya", code: "twi" }, translate: { by: "khaya", code: "tw" }, tts: "twi" },
  { code: "fat", endonym: "Fante", english: "Fante", asr: { by: "khaya", code: "fat" }, translate: { by: "khaya", code: "fat" }, tts: "fat" },
  { code: "gaa", endonym: "Ga", english: "Ga", asr: { by: "khaya", code: "gaa" }, translate: { by: "khaya", code: "gaa" }, tts: "gaa" },
  { code: "ee", endonym: "Eʋegbe", english: "Ewe", asr: { by: "khaya", code: "ewe" }, translate: { by: "khaya", code: "ee" }, tts: "ewe" },
  { code: "ha", endonym: "Hausa", english: "Hausa", asr: { by: "khaya", code: "hau" }, translate: { by: "spark" }, tts: "hau" },
  { code: "dag", endonym: "Dagbanli", english: "Dagbani", asr: { by: "khaya", code: "dag" }, translate: { by: "khaya", code: "dag" }, tts: "dag" },
];

export const languageOf = (code: string | null | undefined): Language => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
export const isLang = (code: string): code is Lang => LANGUAGES.some((l) => l.code === code);

export type VoiceReplies = "match" | "always" | "off";
export const isVoiceReplies = (v: string): v is VoiceReplies => v === "match" || v === "always" || v === "off";

/** Whether this turn gets a voice note back: by default, only when the investor spoke. */
export const wantsVoice = (setting: VoiceReplies, spoke: boolean) => setting === "always" || (setting === "match" && spoke);
