import { describe, expect, it } from "vitest";
import { isVoiceWav, MAX_VOICE_BYTES } from "../src/voice/wav";

/** The same layout the try page writes. */
function wav(samples: number, { rate = 16_000, channels = 1, bits = 16 } = {}): Uint8Array {
  const out = new DataView(new ArrayBuffer(44 + samples * 2));
  const tag = (at: number, t: string) => [...t].forEach((ch, i) => out.setUint8(at + i, ch.charCodeAt(0)));
  tag(0, "RIFF"); out.setUint32(4, 36 + samples * 2, true); tag(8, "WAVE");
  tag(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, channels, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, bits, true);
  tag(36, "data"); out.setUint32(40, samples * 2, true);
  return new Uint8Array(out.buffer);
}

describe("isVoiceWav", () => {
  it("accepts the page's 16 kHz mono 16-bit WAV, up to a minute", () => {
    expect(isVoiceWav(wav(16_000 * 3))).toBe(true);
    expect(isVoiceWav(wav(16_000 * 60))).toBe(true);
  });

  it("rejects anything longer, another format, or not a WAV at all", () => {
    expect(isVoiceWav(wav(16_000 * 60 + 1))).toBe(false);
    expect(MAX_VOICE_BYTES).toBe(1_920_044);
    expect(isVoiceWav(wav(1000, { rate: 44_100 }))).toBe(false);
    expect(isVoiceWav(wav(1000, { channels: 2 }))).toBe(false);
    expect(isVoiceWav(wav(1000, { bits: 8 }))).toBe(false);
    expect(isVoiceWav(new TextEncoder().encode("OggS not a wav at all, just some bytes padding padding"))).toBe(false);
    expect(isVoiceWav(new Uint8Array(10))).toBe(false);
  });
});
