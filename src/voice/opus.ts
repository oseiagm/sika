import { OpusDecoder } from "opus-decoder";
// Extracted by scripts/extract-opus-wasm.mjs: Workers can only run WebAssembly imported as a module.
import opusWasm from "./opus-decoder.wasm";

/** Muse Voice Transcribe takes mono 16-bit PCM WAV at 16 or 24 kHz. */
const RATE = 16_000;

/** Splits an Ogg stream into its packets (segments of 255 bytes continue into the next one). */
export function oggPackets(bytes: Uint8Array): Uint8Array[] {
  const packets: Uint8Array[] = [];
  let pending: Uint8Array[] = [];
  let pos = 0;
  while (pos + 27 <= bytes.length) {
    if (bytes[pos] !== 0x4f || bytes[pos + 1] !== 0x67 || bytes[pos + 2] !== 0x67 || bytes[pos + 3] !== 0x53) {
      throw new Error("Not an Ogg stream");
    }
    const segments = bytes[pos + 26]!;
    const table = bytes.subarray(pos + 27, pos + 27 + segments);
    let data = pos + 27 + segments;
    for (const size of table) {
      pending.push(bytes.subarray(data, data + size));
      data += size;
      if (size < 255) {
        packets.push(concat(pending));
        pending = [];
      }
    }
    pos = data;
  }
  return packets;
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function wav(samples: Float32Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

/** WhatsApp voice note (Ogg Opus) → 16 kHz mono WAV. Opus decodes straight to 16 kHz, so no resampling. */
export async function oggOpusToWav(bytes: Uint8Array): Promise<Uint8Array> {
  const [head, , ...frames] = oggPackets(bytes);
  if (!head || new TextDecoder().decode(head.subarray(0, 8)) !== "OpusHead") throw new Error("Not an Opus stream");
  const channels = head[9]!;
  const preSkip = head[10]! | (head[11]! << 8);

  (OpusDecoder as unknown as { module: WebAssembly.Module }).module = opusWasm;
  const decoder = new OpusDecoder({ channels, preSkip, sampleRate: RATE, forceStereo: false } as never);
  await decoder.ready;
  try {
    const { channelData, samplesDecoded } = decoder.decodeFrames(frames);
    const mono = channelData[0]!.subarray(0, samplesDecoded);
    if (channelData.length > 1) {
      for (let i = 0; i < mono.length; i++) mono[i] = (mono[i]! + channelData[1]![i]!) / 2;
    }
    return wav(mono, RATE);
  } finally {
    decoder.free();
  }
}
