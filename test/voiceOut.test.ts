import { OpusDecoder } from "opus-decoder";
import { describe, expect, it } from "vitest";
import { readWav, resample, wavToOggOpus } from "../src/voice/oggOpus";

// Workers types have no Node; tests run in Node, so load the wasm with Node's fs here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeFs = (globalThis as any).process.getBuiltinModule("node:fs") as { readFileSync(path: URL): Uint8Array };
const wasmFile = new URL("../src/voice/opus-encoder.wasm", (import.meta as unknown as { url: string }).url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const encoderModule = new (WebAssembly.Module as any)(nodeFs.readFileSync(wasmFile)) as WebAssembly.Module;

/** A WAV like Khaya's TTS output: 16 kHz mono 32-bit float. */
function floatWav(samples: Float32Array, rate = 16_000): Uint8Array {
  const out = new DataView(new ArrayBuffer(44 + samples.length * 4));
  const tag = (at: number, t: string) => [...t].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "RIFF"); out.setUint32(4, 36 + samples.length * 4, true); tag(8, "WAVE");
  tag(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 3, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 32, true);
  tag(36, "data"); out.setUint32(40, samples.length * 4, true);
  samples.forEach((s, i) => out.setFloat32(44 + i * 4, s, true));
  return new Uint8Array(out.buffer);
}

/** Ogg pages → packets, plus each page's header type and granule. */
function readOgg(bytes: Uint8Array) {
  const pages: { flags: number; granule: bigint; packets: Uint8Array[] }[] = [];
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at < bytes.length; ) {
    expect(String.fromCharCode(...bytes.subarray(at, at + 4))).toBe("OggS");
    const segs = bytes[at + 26]!;
    const table = bytes.subarray(at + 27, at + 27 + segs);
    let data = at + 27 + segs;
    const packets: Uint8Array[] = [];
    let cur: number[] = [];
    for (const n of table) {
      cur.push(...bytes.subarray(data, data + n));
      data += n;
      if (n < 255) {
        packets.push(Uint8Array.from(cur));
        cur = [];
      }
    }
    pages.push({ flags: bytes[at + 5]!, granule: v.getBigInt64(at + 6, true), packets });
    at = data;
  }
  return pages;
}

const tone = (seconds: number, rate = 16_000) => Float32Array.from({ length: seconds * rate }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 220 * i) / rate));

describe("readWav", () => {
  it("reads float and 16-bit PCM WAVs as mono samples", () => {
    const { samples, rate } = readWav(floatWav(Float32Array.of(0, 0.5, -0.5)));
    expect(rate).toBe(16_000);
    expect([...samples]).toEqual([0, 0.5, -0.5]);
  });

  it("resamples linearly", () => {
    expect(resample(Float32Array.of(0, 1, 0, 1), 16_000, 8_000).length).toBe(2);
    expect(resample(Float32Array.of(0, 1), 16_000, 16_000)).toEqual(Float32Array.of(0, 1));
  });
});

describe("wavToOggOpus", () => {
  it("writes a valid mono Ogg Opus stream that decodes back to the same length", async () => {
    const samples = tone(2);
    const ogg = wavToOggOpus(floatWav(samples), encoderModule);
    const pages = readOgg(ogg);

    const head = pages[0]!.packets[0]!;
    expect(new TextDecoder().decode(head.subarray(0, 8))).toBe("OpusHead");
    expect(head[9]).toBe(1); // mono
    expect(pages[0]!.flags).toBe(0x02); // beginning of stream
    expect(new TextDecoder().decode(pages[1]!.packets[0]!.subarray(0, 8))).toBe("OpusTags");
    expect(pages.at(-1)!.flags).toBe(0x04); // end of stream

    const preSkip = head[10]! | (head[11]! << 8);
    expect(pages.at(-1)!.granule).toBe(BigInt(preSkip + samples.length * 3)); // 16 kHz → 48 kHz granules

    const decoder = new OpusDecoder({ channels: 1, sampleRate: 48_000 } as never);
    await decoder.ready;
    const frames = pages.slice(2).flatMap((p) => p.packets);
    const { samplesDecoded } = decoder.decodeFrames(frames);
    decoder.free();
    expect(frames.length).toBe(Math.ceil((samples.length + preSkip / 3) / 320));
    expect(samplesDecoded).toBeGreaterThanOrEqual(samples.length * 3);
    expect(ogg.length).toBeLessThan(2 * 24_000 / 8 + 4_000); // about 24 kbps
  });
});
