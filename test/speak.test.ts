import { describe, expect, it, vi } from "vitest";
import { canSpeak, speak } from "../src/voice/speak";

const wav = Uint8Array.from([..."RIFF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0]));
const b64 = btoa(String.fromCharCode(...wav));

describe("voice replies", () => {
  it("uses a female Aura-2 voice for English and Pidgin, whatever shape the audio comes back in", async () => {
    for (const out of [wav, wav.buffer, new Response(wav).body, b64, { audio: b64 }]) {
      const run = vi.fn(async () => out);
      expect([...(await speak({ ai: { run } as never }, "Hello", "en"))]).toEqual([...wav]);
      expect(run).toHaveBeenCalledWith("@cf/deepgram/aura-2-en", expect.objectContaining({ speaker: "luna", encoding: "linear16", container: "wav" }));
    }
  });

  it("only takes female voices from the setting, falling back to luna", async () => {
    const run = vi.fn(async () => wav);
    await speak({ ai: { run } as never, englishVoice: "athena" }, "Hi", "pcm");
    await speak({ ai: { run } as never, englishVoice: "zeus" }, "Hi", "en");
    expect(run.mock.calls.map((c) => (c as unknown as [string, { speaker: string }])[1].speaker)).toEqual(["athena", "luna"]);
  });

  it("asks Khaya for its female voice in Ghanaian languages", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => (bodies.push(JSON.parse(String(init.body))), new Response(wav)));
    await speak({ khayaKey: "k" }, "Akwaaba", "tw");
    vi.unstubAllGlobals();
    expect(bodies[0]).toEqual({ text: "Akwaaba", language: "twi", speaker_id: "female" });
  });

  it("knows when it can't speak", () => {
    expect(canSpeak({}, "en")).toBe(false);
    expect(canSpeak({ ai: {} as never }, "en")).toBe(true);
    expect(canSpeak({ ai: {} as never }, "tw")).toBe(false);
    expect(canSpeak({ khayaKey: "k" }, "tw")).toBe(true);
  });
});
