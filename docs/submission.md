# Submission form answers

**Track:** Indie Developer · **Theme:** Build for Your World

**Links**
- **Public GitHub repository:** https://github.com/oseiagm/sika
- **3-minute demo video:** _(YouTube link after recording)_
- **Live demo:** https://sika.cloudflareos-01eeeb.workers.dev

---

## Project Description

Sika is an investing assistant for the Ghana Stock Exchange that lives in WhatsApp, the app Ghanaians already use every day.

Investing on the GSE today means a broker's form, a statement PDF and a lot of guesswork. The market is also thin: on the day I built this, GCB had buyers at GHS 39.00 and sellers at GHS 45.86, and most apps just show the last trade. Sika makes investing a conversation:

1. **Gets to know you.** Five quick questions build an investor profile. Like an adviser, Sika takes the lower of your willingness and your capacity for risk.
2. **Builds a plan with you.** Your goal, monthly amount and limits, set with a few taps.
3. **Suggests trades that fit your plan.** Each suggestion is priced from IC Securities' live order book, with every charge shown to the pesewa and a plain explanation. You can tap, type or send a voice note.
4. **Leaves the decision to you.** Sika never buys or sells. The AI can only suggest, and fixed code checks every suggestion against your plan before you see it: per-order and monthly limits, max in one stock, never-buy list, never sell at a loss, and that someone is actually on the other side. You place the order with your own broker and tap **I bought it**. Sika then keeps your holdings, profit after charges, monthly budget and price alerts up to date.

Investors can also ask how the market is doing, get a deep dive on one stock, and **compare stocks** side by side. Comparisons cover the price, spread and real liquidity: how often it trades, and whether your amount fills at the best price. They also cover sector, size, dividend yield, P/E, latest results and recent news, plus how each stock fits the plan. Portfolio insights show sector mix, dividends over the last 12 months, and holdings that rarely trade. They get **news with links to the sources**, and can **follow a stock**: Sika messages them when there's important news on it. It sends at most one story at a time and never the same story twice. Voice notes work on the web page too, just like WhatsApp.

Sika **answers the way you ask**. Write or speak in English, Pidgin, Twi, Fante, Ga, Ewe, Hausa or Dagbani and it answers in that language, with nothing to set up first. A first question gets answered before Sika offers to build a plan. A voice note gets a voice note back, plus the text with the exact numbers. Translation never changes an amount or a ticker: a line that would come out different is sent in English instead.

Sika **stays on topic**. It only talks about investing on the GSE. Off-topic requests (other markets, homework, poems) and attempts to change its rules get a fixed reply written in code, so the model never answers them.

Every suggestion is visible on a private activity page: the AI's reasoning, the order book, each plan check, and what you did.

I red-teamed it with prompt injection, "forget my limits", asking it to place the order itself, forged taps and double taps. Sika doesn't hold money or send orders, so the worst a successful attack could do is a bad suggestion or a wrong record. Fixed code stops both. All 14 attacks in the suite were stopped, including off-topic requests and jailbreaks.

Try it in a browser: https://sika.cloudflareos-01eeeb.workers.dev

## Describe your use of Meta products to build the submitted project

- **Muse Spark 1.3 (Meta Model API)** is Sika's brain:
  - **Agent.** A tool-calling loop over live GSE quotes, exact fee previews, the portfolio and trade suggestions.
  - **Free text to exact choices.** Structured extraction turns messages like "about 750 a month" or "MTN and the banks, never oil companies" into amounts and tickers.
  - **Questions at any point.** It answers questions mid-setup, with look-up tools only.
  - **News.** `web_search` grounding finds news, and Sika ends each answer with links taken from its citations. Any link the search didn't return is removed before the message is sent. The same search, with structured JSON output, powers news alerts for the stocks an investor holds or follows. Headlines already seen are passed back in, so the same story from another outlet isn't sent twice.
  - **Comparing stocks and company facts.** `compare_stocks` and `stock_details` give Spark exact trading data from IC (order-book depth, recent sessions) and company facts that Spark itself finds with `web_search`: sector, dividends, results and news, as structured JSON with sources. Sika then computes market cap and dividend yield from the live price instead of trusting a number from the web.
  - **Staying on topic.** A small Spark call classifies any message that isn't clearly about investing as in scope, off topic or a manipulation attempt. Code, not the model, replies to the last two.
  - **Local languages.** Sika thinks in English, and Spark writes every voice reply's spoken script: the gist, never the full card. Spark also translates Pidgin and Hausa. GhanaNLP's Khaya handles Twi, Fante, Ga, Ewe and Dagbani text, plus voice notes and a female voice in the Ghanaian languages. English and Pidgin voice replies use Deepgram Aura-2's natural female voice on Cloudflare Workers AI; Khaya is never used for English.
- **Muse Voice Transcribe** turns voice notes into text. WhatsApp voice notes arrive as Ogg Opus, so Sika decodes them to 16 kHz WAV inside a Cloudflare Worker with a WebAssembly Opus decoder, and gives the recogniser GSE names as keywords. It handles English and Pidgin voice notes; Ghanaian-language notes go to Khaya. On the web page, the browser records the note and converts it to the same 16 kHz WAV before sending it, so both channels share one transcription path.
- **Muse Image** makes a personalised "first step" postcard when an investor records their first purchase: their goal in a Ghanaian setting (a house in Accra, a graduation, a shop in Kumasi), with that purchase written on it.
- **WhatsApp Cloud API** is the channel. Sika uses interactive reply buttons and list menus for a guided, tap-first flow; slash commands and ice breakers; voice-note download and **voice-note replies**; image messages; and signed webhooks. The replies are encoded to mono Ogg Opus in the Worker, so WhatsApp shows them as real voice notes. A message template with a quick-reply button reaches investors outside the 24-hour window with news and price alerts. Tapping *Show me* shows the update, and a price alert is re-checked against the live order book before Sika says anything.

## Why are Meta's models important to your solution?

They let Sika meet people where they are: in WhatsApp, in their own words, by voice or text.

- **Muse Spark turns messy answers into exact choices.** Real investors don't fill in forms. They say "I have some MTN, I think I paid 3,000 cedis", or ask "what is a share?" halfway through setup. Muse Spark turns that into exact tickers, amounts and plan settings. It answers questions with live data and explains each suggestion in plain language. Its tool calling lets the reasoning use real prices and exact charges, never numbers from memory.
- **Voice matters in Ghana.** Many people prefer voice notes to typing. Muse Voice Transcribe makes those first-class.
- **Muse Image makes the first purchase feel like progress.** A postcard of your own goal makes your first investment feel like a step toward it, not a transaction.
- **The design keeps the models where they're strong.** They handle understanding and explanation. Deterministic code handles everything about money: pricing, charges, plan limits and the records of what you bought. And the investor, not the AI, places every order. That split is what makes it safe to let an AI help with real investing.

## Provide feedback from your experience using Meta products

What worked well:
- **Easy to plug in.** The Meta Model API's OpenAI-compatible interface worked on the first try. I pointed the OpenAI SDK at api.meta.ai and had a tool-calling agent running in minutes.
- **Tool calling is reliable.** One gap: Spark sometimes sends `"null"` as a string for optional fields, so I made the tool schemas tolerant.
- **`web_search` is genuinely useful.** Cited, dated news with no retrieval setup. The Responses API's `url_citation` annotations come with real titles, so Sika can show sources without parsing the answer text.
- **Muse Image renders text exactly.** Short text like "75 MTNGH shares · GHS 499.69" came out right every time, which made the postcard possible.

What could be better:
- **Audio formats.** Muse Voice Transcribe only accepts WAV/PCM, and Spark's audio input doesn't accept Ogg either. WhatsApp voice notes are Ogg Opus, so every WhatsApp builder has to transcode, which is hard inside serverless limits. Native Ogg Opus support would remove a whole layer.
- **No speech output, and no Ghanaian languages for speech.** The Meta Model API has no text-to-speech, and Muse Voice Transcribe isn't validated for Twi, Ga, Ewe or Hausa. For a WhatsApp product in West Africa, voice in and voice out in local languages matter most. Meta's MMS research models cover Akan and Ewe, so hosted MMS speech in the Model API would let builders keep the whole voice loop on Meta.
- **Repeated search results.** The same news search a few hours apart returns the same story at different outlets and URLs, so deduplicating by URL isn't enough for alerts. I pass the headlines Sika has already seen back into the prompt. A way to exclude known URLs or story IDs in `web_search` would make this simpler.
- **Default reasoning on trivial replies.** A one-line reply used about 335 reasoning tokens until I set `reasoning_effort` to low. A cheaper default, or guidance in the docs, would help.
- **WhatsApp setup pitfalls:**
  - The new guided setup didn't subscribe the WhatsApp Business Account to my app, so webhooks never arrived, with no error. I had to call `/subscribed_apps` myself.
  - The 24-hour temporary token expired silently in the middle of testing.
  - WhatsApp Flows fail with "#139000 Blocked by Integrity" for unverified businesses, but nothing in the developer setup says so.
  - Slash commands don't show on test numbers.

  A setup checklist that verifies the webhook subscription and flags these limits would save hours.

## Provide feedback from your experience using partner technologies

I didn't use Fireworks, Modal or Baseten. For Ghanaian-language translation and speech I used GhanaNLP's Khaya API, which is built for these languages. The hosted Meta Model API covered everything Sika needed, so I didn't need to self-host open weights. Hosting runs on Cloudflare's free tier (Workers, Queues, D1, Cron Triggers).

## Most Viral Track (optional)

If you post on X, a 30–45 second clip works well, for example "I asked an AI to break my investing limits. It couldn't.", showing the blocked suggestion and the activity page, with the live link.
