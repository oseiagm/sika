import { describe, expect, it } from "vitest";
import { keepToolLinks } from "../src/agent/loop";
import { newsMessage, pushable, sameStory } from "../src/news/monitor";
import { extractSources, parseNewsItems, replaceLinks, safeUrl, type NewsItem } from "../src/news/search";
import { parseInbound } from "../src/whatsapp/webhook";

describe("safeUrl", () => {
  it("keeps http(s) links and trims trailing punctuation", () => {
    expect(safeUrl("https://www.myjoyonline.com/gcb-results/.")).toBe("https://www.myjoyonline.com/gcb-results/");
    expect(safeUrl("http://citinewsroom.com/a?b=1)")).toBe("http://citinewsroom.com/a?b=1");
  });

  it("rejects other schemes and junk", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,hi")).toBeNull();
    expect(safeUrl("ftp://example.com/x")).toBeNull();
    expect(safeUrl("https://localhost/x")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
});

describe("extractSources", () => {
  it("uses the web_search citations, deduplicated", () => {
    const output = [
      { type: "web_search_call" },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            annotations: [
              { type: "url_citation", url: "https://gse.com.gh/news/1", title: "GSE news" },
              { type: "url_citation", url: "https://gse.com.gh/news/1", title: "GSE news again" },
              { type: "url_citation", url: "javascript:alert(1)", title: "bad" },
              { type: "url_citation", url: "https://thehighstreetjournal.com/x", title: "" },
            ],
          },
        ],
      },
    ];
    expect(extractSources(output, "")).toEqual([
      { title: "GSE news", url: "https://gse.com.gh/news/1" },
      { title: "thehighstreetjournal.com", url: "https://thehighstreetjournal.com/x" },
    ]);
  });

  it("falls back to links written in the text", () => {
    const text = "• GCB posts profit (GhanaWeb, https://www.ghanaweb.com/gcb). • More at https://citinewsroom.com/x.";
    expect(extractSources([], text)).toEqual([
      { title: "ghanaweb.com", url: "https://www.ghanaweb.com/gcb" },
      { title: "citinewsroom.com", url: "https://citinewsroom.com/x" },
    ]);
  });
});

describe("keepToolLinks", () => {
  it("keeps links a tool returned and removes the rest, keeping punctuation", () => {
    const allowed = new Set(["https://gse.com.gh/news/1"]);
    const text = "Read https://gse.com.gh/news/1. Also see https://evil.example.com/phish, and http://made.up/story";
    expect(keepToolLinks(text, allowed)).toBe("Read https://gse.com.gh/news/1. Also see (link removed), and (link removed)");
  });

  it("leaves text without links alone", () => {
    expect(keepToolLinks("GCB: buyers at GHS 7.00", new Set())).toBe("GCB: buyers at GHS 7.00");
  });

  it("replaceLinks passes null for unusable links", () => {
    const seen: (string | null)[] = [];
    replaceLinks("https://ok.com/a and https://x", (u) => (seen.push(u), null));
    expect(seen).toEqual(["https://ok.com/a", null]);
  });
});

describe("parseNewsItems", () => {
  it("reads a JSON array, dropping malformed items and bad links", () => {
    const text = `Here you go:
[
  {"title": "CalBank declares dividend", "url": "https://citinewsroom.com/cal", "date": "2026-10-30", "summary": "GHS 0.05 a share.", "material": true},
  {"title": "No link", "url": "javascript:x", "summary": "x y z", "material": true},
  {"title": "x", "url": "https://a.com", "summary": "too short title"},
  {"title": "Market wrap", "url": "https://gse.com.gh/wrap", "summary": "Quiet day."}
]`;
    const items = parseNewsItems(text);
    expect(items.map((i) => i.title)).toEqual(["CalBank declares dividend", "Market wrap"]);
    expect(items[1]!.material).toBe(false);
  });

  it("returns nothing for empty or broken replies", () => {
    expect(parseNewsItems("[]")).toEqual([]);
    expect(parseNewsItems("I couldn't find anything")).toEqual([]);
    expect(parseNewsItems("[{broken")).toEqual([]);
  });
});

const item = (over: Partial<NewsItem>): NewsItem => ({ title: "CalBank results", url: "https://a.com/1", date: "2026-10-31", summary: "Profit up.", material: true, ...over });

describe("pushable", () => {
  const now = new Date("2026-11-01T08:00:00Z");

  it("pushes nothing the first time a stock is searched (seeding)", () => {
    expect(pushable([item({})], false, [], new Set(), now)).toEqual([]);
  });

  it("then pushes only material, recent, dated news", () => {
    const fresh = [
      item({}),
      item({ url: "https://a.com/2", title: "CalBank names new CEO", material: false }),
      item({ url: "https://a.com/3", title: "CalBank rights issue", date: "2026-09-01" }),
      item({ url: "https://a.com/4", title: "CalBank dividend", date: null }),
    ];
    expect(pushable(fresh, true, [], new Set(), now).map((i) => i.url)).toEqual(["https://a.com/1"]);
  });

  it("skips a story already seen under another outlet's headline, and repeats within the batch", () => {
    const company = new Set(["cal", "calbank", "plc"]);
    const known = ["CalBank posts 9-month profit up 40% on strong lending"];
    const fresh = [
      item({ url: "https://b.com/1", title: "CalBank PLC 9-month profit up 40% on lending growth" }),
      item({ url: "https://b.com/2", title: "CalBank appoints new managing director" }),
      item({ url: "https://b.com/3", title: "New managing director appointed at CalBank" }),
    ];
    expect(pushable(fresh, true, known, company, now).map((i) => i.url)).toEqual(["https://b.com/2"]);
  });
});

describe("sameStory", () => {
  it("matches headlines about the same event, ignoring the company's name", () => {
    const mtn = new Set(["mtngh", "mtn", "scancom"]);
    expect(sameStory("MTN Ghana posts GH¢7.75bn nine-month profit, up 43%", "MTN Ghana nine-month profit up 43% to GH¢7.75bn", mtn)).toBe(true);
    expect(sameStory("MTN Ghana posts nine-month profit", "MTN Ghana wins 5G spectrum licence", mtn)).toBe(false);
  });
});

describe("newsMessage", () => {
  it("shows the source and offers unfollow only for followed stocks", () => {
    const followed = newsMessage("CAL", item({}), true);
    expect(followed.text).toContain("Source: https://a.com/1");
    expect(followed.buttons.map((b) => b.id)).toEqual(["news:more:CAL", "follow:off:CAL", "news:mute"]);
    expect(newsMessage("CAL", item({}), false).buttons.map((b) => b.id)).toEqual(["news:more:CAL", "flow:menu", "news:mute"]);
    for (const b of followed.buttons) expect(b.title.length).toBeLessThanOrEqual(20);
  });
});

describe("template replies", () => {
  it("a template's quick-reply tap arrives as a button with its payload", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [{ id: "m1", from: "233200000000", timestamp: "1", type: "button", button: { payload: "update:show:0b8e3c1e-5a43-4d1f-9a7e-2f4b3c5d6e7f", text: "Show me" } }] } }] }],
    };
    expect(parseInbound(payload)[0]).toMatchObject({ kind: "button", buttonId: "update:show:0b8e3c1e-5a43-4d1f-9a7e-2f4b3c5d6e7f" });
  });
});

describe("WhatsApp formatting", () => {
  it("turns Markdown bold and headings into WhatsApp bold, leaving WhatsApp bold alone", async () => {
    const { whatsappFormat } = await import("../src/agent/loop");
    expect(whatsappFormat("Hi! For **MTNGH**:")).toBe("Hi! For *MTNGH*:");
    expect(whatsappFormat("## Your plan\nok")).toBe("*Your plan*\nok");
    expect(whatsappFormat("Already *bold* here")).toBe("Already *bold* here");
  });
});
