import { afterEach, describe, expect, it, vi } from "vitest";
import { languageOf, LANGUAGES, wantsVoice } from "../src/i18n/languages";
import { clearlyEnglish, detectLanguage, isGreeting, tooShortToTell } from "../src/i18n/detect";
import { factsOf, fromEnglish, keepAsIs, keepsFacts, label, splitDecor, toEnglish, type TranslationCache } from "../src/i18n/translate";

/** Khaya's translate endpoint, faked: a lookup table, like the real responses seen on 1 Nov 2026. */
function fakeKhaya(table: Record<string, string>) {
  const calls: { in: string; lang: string }[] = [];
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { in: string; lang: string };
    calls.push(body);
    const out = table[body.in];
    return out === undefined ? new Response("nope", { status: 500 }) : new Response(JSON.stringify(out), { status: 200 });
  });
  return calls;
}

const memoryCache = (): TranslationCache & { store: Map<string, string> } => {
  const store = new Map<string, string>();
  return { store, get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
};

const noSpark = { chat: { completions: { create: vi.fn() } } } as never;

afterEach(() => vi.unstubAllGlobals());

describe("languages", () => {
  it("routes each language to the right services", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(["en", "pcm", "tw", "fat", "gaa", "ee", "ha", "dag"]);
    expect(languageOf("tw")).toMatchObject({ asr: { by: "khaya", code: "twi" }, translate: { by: "khaya", code: "tw" }, tts: { by: "khaya", code: "twi" } });
    expect(languageOf("ee")).toMatchObject({ asr: { code: "ewe" }, translate: { code: "ee" }, tts: { by: "khaya", code: "ewe" } });
    expect(languageOf("pcm")).toMatchObject({ asr: { by: "muse" }, translate: { by: "spark" }, tts: { by: "aura" } });
    expect(languageOf("en").tts).toEqual({ by: "aura" });
    expect(languageOf("ha").translate).toEqual({ by: "spark" });
    expect(languageOf(null).code).toBe("en");
    expect(languageOf("xx").code).toBe("en");
  });

  it("replies with voice when the investor spoke, or always, never when off", () => {
    expect(wantsVoice("match", true)).toBe(true);
    expect(wantsVoice("match", false)).toBe(false);
    expect(wantsVoice("always", false)).toBe(true);
    expect(wantsVoice("off", true)).toBe(false);
  });
});

describe("facts", () => {
  it("finds numbers, all-capital words and links", () => {
    expect(factsOf("Buyers at GHS 6.45 for MTNGH, see https://gse.com.gh/x.")).toEqual(["https://gse.com.gh/x.", "6.45", "GHS", "MTNGH"]);
  });

  it("catches a mangled ticker or changed amount (Khaya turned MTNGH into MTH)", () => {
    expect(keepsFacts("Buyers are paying GHS 6.45 for MTNGH today.", "Adetɔfoɔ retua GHS 6.45 wɔ MTH ho nnɛ.")).toBe(false);
    expect(keepsFacts("Total: GHS 499.69", "Nyinaa: GHS 499.96")).toBe(false);
    expect(keepsFacts("Your plan is ready.", "Wo nhyehyɛe no ayɛ krado.")).toBe(true);
  });
});

describe("line handling", () => {
  it("keeps bullets, emoji and bold markers out of the translation", () => {
    expect(splitDecor("• Monthly: GHS 500.00")).toEqual({ pre: "• ", core: "Monthly: GHS 500.00", post: "" });
    expect(splitDecor("*Your investing plan*")).toEqual({ pre: "*", core: "Your investing plan", post: "*" });
    expect(splitDecor("✅ Fits your plan (8 checks)").pre).toBe("✅ ");
    // A mid-line *GCB* leaves no lone marker behind.
    expect(splitDecor("Latest for *GCB*:")).toEqual({ pre: "", core: "Latest for *GCB", post: ":" });
  });

  it("leaves figure lines alone and translates sentences", () => {
    expect(keepAsIs("Gross: GHS 487.50")).toBe(true);
    expect(keepAsIs("Charges: GHS 12.19 (2.50% tier)")).toBe(true);
    expect(keepAsIs("MTNGH")).toBe(true);
    expect(keepAsIs("Tell me what you already own.")).toBe(false);
  });

  it("spots plain English, which needn't be translated in", () => {
    expect(clearlyEnglish("What is the price of GCB?")).toBe(true);
    expect(clearlyEnglish("ok")).toBe(true);
    expect(clearlyEnglish("GCB boɔ yɛ sɛn?")).toBe(false);
    expect(clearlyEnglish("Me pɛ sɛ metɔ MTN shares")).toBe(false);
    expect(clearlyEnglish("me pe se meto MTN shares")).toBe(false);
    expect(clearlyEnglish("Abeg wetin be GCB price?")).toBe(false);
  });
});

describe("fromEnglish", () => {
  const card = ["*Your investing plan*", "Tell me what you already own.", "• Monthly: GHS 500.00", "Buyers are paying GHS 6.45 for MTNGH today."].join("\n");
  const khaya = {
    "Your investing plan": "Wo sika nhyehyɛe",
    "Tell me what you already own.": "Ka nea wowɔ dedaw kyerɛ me.",
    "Buyers are paying GHS 6.45 for MTNGH today.": "Adetɔfoɔ retua GHS 6.45 wɔ MTH ho nnɛ.",
  };

  it("translates sentences line by line, keeps figures, and falls back to English where a fact changed", async () => {
    const calls = fakeKhaya(khaya);
    const cache = memoryCache();
    const out = await fromEnglish({ khayaKey: "k", meta: noSpark, model: "m", cache }, card, "tw");
    expect(out.text.split("\n")).toEqual(["*Wo sika nhyehyɛe*", "Ka nea wowɔ dedaw kyerɛ me.", "• Monthly: GHS 500.00", "Buyers are paying GHS 6.45 for MTNGH today."]);
    expect(out.fellBack).toBe(1);
    expect(calls.map((c) => c.lang)).toEqual(["en-tw", "en-tw", "en-tw"]);
    expect(cache.store.size).toBe(3);
  });

  it("drops the full stop Khaya adds to lines that had none", async () => {
    fakeKhaya({ "Fits your plan (8 checks)": "Ɛfata wo nhyehyɛe (8 checks) ." });
    expect((await fromEnglish({ khayaKey: "k", meta: noSpark, model: "m" }, "✅ Fits your plan (8 checks)", "tw")).text).toBe("✅ Ɛfata wo nhyehyɛe (8 checks)");
  });

  it("uses the cache the second time", async () => {
    const cache = memoryCache();
    fakeKhaya(khaya);
    await fromEnglish({ khayaKey: "k", meta: noSpark, model: "m", cache }, card, "tw");
    const calls = fakeKhaya({});
    await fromEnglish({ khayaKey: "k", meta: noSpark, model: "m", cache }, card, "tw");
    expect(calls).toHaveLength(0);
  });

  it("sends English as written when the service fails", async () => {
    fakeKhaya({});
    const out = await fromEnglish({ khayaKey: "k", meta: noSpark, model: "m" }, "Tell me what you already own.", "gaa");
    expect(out).toEqual({ text: "Tell me what you already own.", fellBack: 1 });
  });

  it("leaves English untouched and makes no calls", async () => {
    const calls = fakeKhaya({});
    expect((await fromEnglish({ khayaKey: "k", meta: noSpark, model: "m" }, card, "en")).text).toBe(card);
    expect(calls).toHaveLength(0);
  });

  it("translates Pidgin and Hausa with Spark, a whole message in one call", async () => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: '["Tell me wetin you get already."]' } }] }));
    const out = await fromEnglish({ meta: { chat: { completions: { create } } } as never, model: "m" }, "Tell me what you already own.\nGross: GHS 487.50", "pcm");
    expect(out.text).toBe("Tell me wetin you get already.\nGross: GHS 487.50");
    expect(create).toHaveBeenCalledOnce();
  });
});

describe("labels and input", () => {
  it("translates a button title only when it fits", async () => {
    fakeKhaya({ "Looks right": "Ɛyɛ", "Change something": "Sesa biribi a ɛwɔ wo nhyehyɛe no mu" });
    expect(await label({ khayaKey: "k", meta: noSpark, model: "m" }, "Looks right", "tw", 20)).toBe("Ɛyɛ");
    expect(await label({ khayaKey: "k", meta: noSpark, model: "m" }, "Change something", "tw", 20)).toBe("Change something");
  });

  it("translates what the investor wrote into English, unless it's English already", async () => {
    const calls = fakeKhaya({ "GCB boɔ yɛ sɛn?": "How much is GCB?" });
    expect(await toEnglish({ khayaKey: "k", meta: noSpark, model: "m" }, "GCB boɔ yɛ sɛn?", "tw")).toBe("How much is GCB?");
    expect(calls[0]!.lang).toBe("tw-en");
    expect(await toEnglish({ khayaKey: "k", meta: noSpark, model: "m" }, "What is the price of GCB?", "tw")).toBe("What is the price of GCB?");
    expect(calls).toHaveLength(1);
  });
});

describe("language detection", () => {
  const spark = (reply: string) => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: reply } }] }));
    return { meta: { chat: { completions: { create } } } as never, create };
  };

  it("answers English and Pidgin without a model call", async () => {
    const { meta, create } = spark("tw");
    expect(await detectLanguage(meta, "m", "What is the price of MTN today?")).toBe("en");
    expect(await detectLanguage(meta, "m", "Abeg how far, wetin be GCB price?")).toBe("pcm");
    expect(create).not.toHaveBeenCalled();
  });

  it("asks Spark about anything else, and trusts only a known code", async () => {
    expect(await detectLanguage(spark("tw").meta, "m", "GCB boɔ yɛ sɛn nnɛ?")).toBe("tw");
    expect(await detectLanguage(spark("ee").meta, "m", "Nukae nye GCB ƒe asi egbea?")).toBe("ee");
    expect(await detectLanguage(spark("other").meta, "m", "Bonjour, quel est le prix?")).toBeNull();
  });

  it("can't tell from very short or code-like messages", async () => {
    const { meta, create } = spark("tw");
    expect(tooShortToTell("ok")).toBe(true);
    expect(tooShortToTell("2")).toBe(true);
    expect(tooShortToTell("/menu")).toBe(true);
    expect(await detectLanguage(meta, "m", "2")).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("knows greetings in the languages Sika speaks", () => {
    for (const g of ["Hi", "Good morning", "Maakye", "Ɛte sɛn", "Wo ho te sɛn?", "Woezɔ", "Sannu", "Desiba", "How far", "Akwaaba"]) expect(isGreeting(g)).toBe(true);
    expect(isGreeting("What is GCB trading at?")).toBe(false);
    expect(isGreeting("Hello, can you tell me which bank stock is best for a long time?")).toBe(false);
  });
});
