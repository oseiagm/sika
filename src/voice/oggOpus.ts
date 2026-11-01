/**
 * WAV → mono Ogg Opus, the only format WhatsApp shows as a voice-note bubble.
 * libopus runs as WebAssembly (from @evan/opus, MIT); the caller passes the compiled module, because
 * Workers can only use WebAssembly imported as a module and tests compile it from the file.
 * The Ogg container (RFC 7845) is written here.
 */

/** Opus takes these input rates; anything else is resampled to 16 kHz. */
const OPUS_RATES = [8_000, 12_000, 16_000, 24_000, 48_000];
const FRAME_MS = 20;
const BITRATE = 24_000;

// libopus constants
const OPUS_APPLICATION_VOIP = 2048;
const OPUS_SET_BITRATE = 4002;
const OPUS_GET_LOOKAHEAD = 4027;
const OPUS_SET_SIGNAL = 4024;
const OPUS_SIGNAL_VOICE = 3001;

/** Mono samples in -1..1 and their rate, from a PCM (8/16/24/32-bit) or float WAV, mixing channels down. */
export function readWav(bytes: Uint8Array): { samples: Float32Array; rate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
  let format = 0, channels = 0, rate = 0, bits = 0, data = -1, size = 0;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = tag(at);
    const len = v.getUint32(at + 4, true);
    if (id === "fmt ") {
      format = v.getUint16(at + 8, true);
      channels = v.getUint16(at + 10, true);
      rate = v.getUint32(at + 12, true);
      bits = v.getUint16(at + 22, true);
      if (format === 0xfffe && len >= 26) format = v.getUint16(at + 32, true); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === "data") {
      data = at + 8;
      size = Math.min(len, bytes.length - data);
      break;
    }
    at += 8 + len + (len % 2);
  }
  if (data < 0 || !channels || !rate) throw new Error("WAV has no audio");
  const width = bits / 8;
  const frames = Math.floor(size / (width * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const at = data + (i * channels + c) * width;
      sum +=
        format === 3 ? (bits === 64 ? v.getFloat64(at, true) : v.getFloat32(at, true))
        : bits === 8 ? (v.getUint8(at) - 128) / 128
        : bits === 16 ? v.getInt16(at, true) / 32768
        : bits === 24 ? ((v.getUint8(at) | (v.getUint8(at + 1) << 8) | (v.getInt8(at + 2) << 16)) / 8388608)
        : v.getInt32(at, true) / 2147483648;
    }
    samples[i] = Math.max(-1, Math.min(1, sum / channels));
  }
  return { samples, rate };
}

/** Linear resampling; fine for speech. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const out = new Float32Array(Math.floor((samples.length * to) / from));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const x = i * step;
    const j = Math.floor(x);
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    out[i] = a + (b - a) * (x - j);
  }
  return out;
}

// ── Ogg ──

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    t[i] = r >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0;
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]!) >>> 0;
  return crc;
}

/** One Ogg page holding whole packets (each packet here is far under 255 × 255 bytes). */
function page(packets: Uint8Array[], granule: bigint, serial: number, sequence: number, flags: number): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) {
    let n = p.length;
    while (n >= 255) {
      lacing.push(255);
      n -= 255;
    }
    lacing.push(n);
  }
  const body = packets.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + body);
  const v = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  out[5] = flags;
  v.setBigInt64(6, granule, true);
  v.setUint32(14, serial, true);
  v.setUint32(18, sequence, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let at = 27 + lacing.length;
  for (const p of packets) {
    out.set(p, at);
    at += p.length;
  }
  v.setUint32(22, crc32(out), true);
  return out;
}

function opusHead(preSkip: number, inputRate: number): Uint8Array {
  const out = new Uint8Array(19);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("OpusHead"), 0);
  out[8] = 1; // version
  out[9] = 1; // mono
  v.setUint16(10, preSkip, true);
  v.setUint32(12, inputRate, true);
  v.setInt16(16, 0, true); // gain
  out[18] = 0; // mapping family
  return out;
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode("sika");
  const out = new Uint8Array(8 + 4 + vendor.length + 4);
  const v = new DataView(out.buffer);
  out.set(new TextEncoder().encode("OpusTags"), 0);
  v.setUint32(8, vendor.length, true);
  out.set(vendor, 12);
  v.setUint32(12 + vendor.length, 0, true);
  return out;
}

// ── libopus ──

/* eslint-disable @typescript-eslint/no-explicit-any */
function libopus(module: WebAssembly.Module) {
  let wasm: any;
  const instance = new WebAssembly.Instance(module, {
    wasi_snapshot_preview1: { fd_seek() {}, fd_write() {}, fd_close() {}, proc_exit() {} },
    env: { emscripten_notify_memory_growth() {} },
  });
  wasm = instance.exports;
  const heap = () => new Uint8Array(wasm.memory.buffer);
  const check = (code: number) => {
    if (code < 0) throw new Error(`opus error ${code}`);
    return code;
  };
  return {
    encoder(rate: number) {
      const enc = wasm.malloc(wasm.opus_encoder_get_size(1));
      check(wasm.opus_encoder_init(enc, rate, 1, OPUS_APPLICATION_VOIP));
      check(wasm.opus_encoder_ctl_set(enc, OPUS_SET_BITRATE, BITRATE));
      check(wasm.opus_encoder_ctl_set(enc, OPUS_SET_SIGNAL, OPUS_SIGNAL_VOICE));
      const frame = (rate * FRAME_MS) / 1000;
      const pcm = wasm.malloc(frame * 2);
      const packet = wasm.malloc(4000);
      return {
        frame,
        lookahead: wasm.opus_encoder_ctl_get(enc, OPUS_GET_LOOKAHEAD) as number,
        encode(samples: Int16Array): Uint8Array {
          heap().set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength), pcm);
          const n = check(wasm.opus_encode(enc, pcm, frame, packet, 4000));
          return heap().slice(packet, packet + n);
        },
        free() {
          wasm.free(packet);
          wasm.free(pcm);
          wasm.free(enc);
        },
      };
    },
  };
}

/** A WAV file → a mono Ogg Opus voice note. */
export function wavToOggOpus(wav: Uint8Array, module: WebAssembly.Module): Uint8Array {
  const { samples: raw, rate: wavRate } = readWav(wav);
  const rate = OPUS_RATES.includes(wavRate) ? wavRate : 16_000;
  const samples = resample(raw, wavRate, rate);
  const enc = libopus(module).encoder(rate);
  try {
    const toGranule = 48_000 / rate; // Ogg Opus granules always count 48 kHz samples
    const preSkip = enc.lookahead * toGranule;
    const serial = (Math.random() * 0xffffffff) >>> 0;
    const pages: Uint8Array[] = [page([opusHead(preSkip, wavRate)], 0n, serial, 0, 0x02), page([opusTags()], 0n, serial, 1, 0)];

    // Pad so the lookahead's worth of audio is encoded too, then cut it with the final granule.
    const total = samples.length;
    const padded = new Int16Array(Math.ceil((total + enc.lookahead) / enc.frame) * enc.frame || enc.frame);
    for (let i = 0; i < total; i++) padded[i] = Math.round(samples[i]! < 0 ? samples[i]! * 32768 : samples[i]! * 32767);

    const frames = padded.length / enc.frame;
    const endGranule = BigInt(preSkip + total * toGranule);
    let batch: Uint8Array[] = [];
    let sequence = 2;
    for (let f = 0; f < frames; f++) {
      batch.push(enc.encode(padded.subarray(f * enc.frame, (f + 1) * enc.frame)));
      const last = f === frames - 1;
      if (batch.length === 50 || last) {
        const granule = last ? endGranule : BigInt((f + 1) * enc.frame * toGranule);
        pages.push(page(batch, granule, serial, sequence++, last ? 0x04 : 0));
        batch = [];
      }
    }
    const out = new Uint8Array(pages.reduce((s, p) => s + p.length, 0));
    let at = 0;
    for (const p of pages) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  } finally {
    enc.free();
  }
}

/** Any WAV → 16 kHz mono 16-bit PCM WAV (what browsers and Muse Voice Transcribe all take). */
export function toPcm16Wav(wav: Uint8Array): Uint8Array {
  const { samples: raw, rate } = readWav(wav);
  const samples = resample(raw, rate, 16_000);
  const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const tag = (at: number, t: string) => [...t].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  tag(0, "RIFF"); out.setUint32(4, 36 + samples.length * 2, true); tag(8, "WAVE");
  tag(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 16_000, true); out.setUint32(28, 32_000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  tag(36, "data"); out.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => out.setInt16(44 + i * 2, Math.round(s < 0 ? s * 32768 : s * 32767), true));
  return new Uint8Array(out.buffer);
}
