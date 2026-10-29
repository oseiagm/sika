# Submission form answers

**Track:** Indie Developer · **Theme:** Build for Your World

**Links**
- **Public GitHub repository:** _(to add after the repo is created)_
- **3-minute demo video:** _(YouTube link after recording)_
- **Live demo:** https://sika.cloudflareos-01eeeb.workers.dev

---

## Project Description

Sika is an investing assistant for the Ghana Stock Exchange that lives in WhatsApp, the app Ghanaians already use every day.

Investing on the GSE today means a broker's form, a statement PDF and a lot of guesswork. The market is also thin: on the day I built this, GCB had buyers at GHS 39.00 and sellers at GHS 45.86, and most apps just show the last trade. Sika makes investing a conversation:

1. **Gets to know you.** Five quick questions build an investor profile. Like an adviser, Sika takes the lower of your willingness and your capacity for risk.
2. **Builds a plan with you.** Your goal, monthly amount and limits, set with a few taps.
3. **Proposes trades.** Each proposal is priced from IC Securities' live order book, with every charge shown to the pesewa and a plain explanation. You can tap, type or send a voice note.
4. **Only acts when you tap Approve.** The AI can only suggest. Fixed code checks every trade against your plan: per-order and monthly limits, max in one stock, never-buy list, never sell at a loss, and that someone is actually on the other side. Each proposal is signed, expires after 30 minutes, and executes exactly once.

Every decision is visible on a private activity page: the AI's reasoning, the order book, each plan check, your decision and the fill.

I red-teamed it with prompt injection, "forget my limits", typing "I approve" instead of tapping, forged approvals and double taps. All 9 attacks were stopped. Execution is simulated on real prices. Connecting a real broker would mean one adapter behind the same approval flow.

Try it in a browser: https://sika.cloudflareos-01eeeb.workers.dev

## Describe your use of Meta products to build the submitted project

- **Muse Spark 1.3 (Meta Model API)** is Sika's brain:
  - **Agent.** A tool-calling loop over live GSE quotes, exact fee previews, the portfolio and trade proposals.
  - **Free text to exact choices.** Structured extraction turns messages like "about 750 a month" or "MTN and the banks, never oil companies" into amounts and tickers.
  - **Questions at any point.** It answers questions mid-setup, with look-up tools only.
  - **News.** `web_search` grounding finds news with cited sources.
  - **Local languages.** It replies in the language the investor writes in (Twi, Ga, Ewe, Hausa or Pidgin).
- **Muse Voice Transcribe** turns WhatsApp voice notes into text. Voice notes arrive as Ogg Opus, so Sika decodes them to 16 kHz WAV inside a Cloudflare Worker with a WebAssembly Opus decoder, and gives the recogniser GSE names as keywords.
- **Muse Image** makes a personalised "first step" postcard after an investor's first trade: their goal in a Ghanaian setting (a house in Accra, a graduation, a shop in Kumasi), with their real first trade written on it.
- **WhatsApp Cloud API** is the channel. Sika uses interactive reply buttons and list menus for a guided, tap-first flow; slash commands and ice breakers; voice note download; image messages; and signed webhooks.

## Why are Meta's models important to your solution?

They let Sika meet people where they are: in WhatsApp, in their own words, by voice or text.

- **Muse Spark turns messy answers into exact choices.** Real investors don't fill in forms. They say "I have some MTN, I think I paid 3,000 cedis", or ask "what is a share?" halfway through setup. Muse Spark turns that into exact tickers, amounts and plan settings. It answers questions with live data and explains each trade in plain language. Its tool calling lets the reasoning use real prices and exact charges, never numbers from memory.
- **Voice matters in Ghana.** Many people prefer voice notes to typing. Muse Voice Transcribe makes those first-class.
- **Muse Image makes the first trade feel like progress.** A postcard of your own goal makes your first investment feel like a step toward it, not a transaction.
- **The design keeps the models where they're strong.** They handle understanding and explanation. Deterministic code makes the decisions about money: pricing, limits, approval and execution. That split is what makes it safe to let an AI help with real investing.

## Provide feedback from your experience using Meta products

What worked well:
- **Easy to plug in.** The Meta Model API's OpenAI-compatible interface worked on the first try. I pointed the OpenAI SDK at api.meta.ai and had a tool-calling agent running in minutes.
- **Tool calling is reliable.** One gap: Spark sometimes sends `"null"` as a string for optional fields, so I made the tool schemas tolerant.
- **`web_search` is genuinely useful.** Cited, dated news with no retrieval setup.
- **Muse Image renders text exactly.** Short text like "75 MTNGH shares · GHS 499.69" came out right every time, which made the postcard possible.

What could be better:
- **Audio formats.** Muse Voice Transcribe only accepts WAV/PCM, and Spark's audio input doesn't accept Ogg either. WhatsApp voice notes are Ogg Opus, so every WhatsApp builder has to transcode, which is hard inside serverless limits. Native Ogg Opus support would remove a whole layer.
- **Default reasoning on trivial replies.** A one-line reply used about 335 reasoning tokens until I set `reasoning_effort` to low. A cheaper default, or guidance in the docs, would help.
- **WhatsApp setup pitfalls:**
  - The new guided setup didn't subscribe the WhatsApp Business Account to my app, so webhooks never arrived, with no error. I had to call `/subscribed_apps` myself.
  - The 24-hour temporary token expired silently in the middle of testing.
  - WhatsApp Flows fail with "#139000 Blocked by Integrity" for unverified businesses, but nothing in the developer setup says so.
  - Slash commands don't show on test numbers.

  A setup checklist that verifies the webhook subscription and flags these limits would save hours.

## Provide feedback from your experience using partner technologies

I didn't use Fireworks, Modal or Baseten. The hosted Meta Model API covered everything Sika needed, so I didn't need to self-host open weights. Hosting runs on Cloudflare's free tier (Workers, Queues, D1, Cron Triggers).

## Most Viral Track (optional)

If you post on X, a 30–45 second clip works well, for example "I asked an AI to break my investing limits. It couldn't.", showing the blocked trade and the activity page, with the live link.
