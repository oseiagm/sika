// libopus from @evan/opus (MIT), imported as a module: Workers can't compile WebAssembly at runtime.
import encoderWasm from "./opus-encoder.wasm";
import { wavToOggOpus } from "./oggOpus";

/** A WAV (e.g. Khaya's text-to-speech output) → a mono Ogg Opus voice note for WhatsApp. */
export const toVoiceNote = (wav: Uint8Array): Uint8Array => wavToOggOpus(wav, encoderWasm);
