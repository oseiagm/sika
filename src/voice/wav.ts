/** What the try page records: checked before it's sent to Muse Voice Transcribe. */

/** 60 seconds of 16 kHz mono 16-bit audio, plus the header. */
export const MAX_VOICE_BYTES = 60 * 16_000 * 2 + 44;

/** A plain PCM WAV file (what the page records): RIFF/WAVE, format 1, mono, 16 kHz, 16-bit. */
export function isVoiceWav(bytes: Uint8Array): boolean {
  if (bytes.length < 44 || bytes.length > MAX_VOICE_BYTES) return false;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  return tag(0) === "RIFF" && tag(8) === "WAVE" && tag(12) === "fmt " && v.getUint16(20, true) === 1 && v.getUint16(22, true) === 1 && v.getUint32(24, true) === 16_000 && v.getUint16(34, true) === 16;
}
