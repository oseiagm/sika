# Sika — an investing agent for the Ghana Stock Exchange that lives in WhatsApp

## Context
The user is in the Meta Global AI Developer Hackathon (Indie Developer track). It runs Oct 26 – **Nov 4, 9:00 PM ET** (about 6 days left), judging Nov 4–8, and finals Nov 9.
- **Stage 1 (pass/fail):** the project must fit a theme and really use the Meta Model API and/or Meta open-weight models.
- **Indie track criteria:** creativity, technical ambition, and **whether it works**. The top 5 go to a live final where judges watch the video demo.
- **Theme fit:** "Build for Your World", meaning bring Meta's models into a domain you know firsthand.
- **Available Meta models:** `muse-spark-1.3` (tool calling, structured output, vision/PDF/audio input, `web_search` grounding, 1M context), `muse-voice-transcribe-1.0`, `muse-image-1.0`, `sam-3.1`, `muse-wonder-1.0`, and the open-weight Muse Glimmer and Spark Open.
- **API:** OpenAI-compatible at `https://api.meta.ai/v1`.
- **Budget:** $150 in credits. Spark 1.3 costs $1.25/M input and $4.25/M output, so credits are not a constraint.

The application promised an AI agent that turns natural-language goals into a structured strategy, proposes trades, explains them, and executes them in a **simulated** environment. It also promised strict guardrails: position and spend limits, stop conditions, previews, and human approval.

The user knows GSE trading costs in detail: the IC Securities fee tiers and statutory levies, and how they are rounded. Sika is a **standalone project built from scratch for the hackathon**. It shares no code, data, accounts or servers with any other product. It uses only public information: the published IC/GSE fee schedule and public GSE price feeds.

**Decisions made:**
- Name: **Sika** (Twi for "money"). The folder is `C:\Users\sosei\Documents\GitHub\sika`.
- Channel: WhatsApp first, plus a small read-only web "trust view".
- Stack: TypeScript/Node.
- Hosting: **free only**, on Cloudflare Workers (see "Hosting" below). No paid servers.

## The pitch (why it wins)
> In Ghana, investors live on WhatsApp, not in trading apps. Sika is an investing agent you talk to there. Send a voice note with your goals and it writes them into a signed **mandate**. Tell it what you own, the way you would tell a friend, and it builds your portfolio. Every month it proposes trades with the exact fees to the pesewa, explains why, and executes only after you tap **Approve**, and only within limits the AI itself cannot override.

How this maps to the rubric:
- **Creativity**
  - A trading agent inside WhatsApp.
  - Voice-note onboarding.
  - "Tell me what you own" onboarding by voice or text, with a native WhatsApp Flow form to confirm and fix.
  - Approve/Reject buttons.
  - A "mandate" acts as a contract between the investor and the agent.
- **Technical ambition**
  - Uses several Meta models together: a Spark 1.3 tool-calling agent, Voice Transcribe, Spark structured output to turn casual speech into exact holdings, a WhatsApp Flow (Meta's in-chat forms), `web_search` grounding for GSE news, and Muse Image for shareable portfolio cards.
  - A deterministic policy engine sits between the LLM and execution.
  - Trade intents are hash-signed.
  - Paper fills account for liquidity, because GSE volumes are thin.
  - A proactive monitoring loop watches prices.
  - Every step is audit-logged.
- **Works:** a live end-to-end run on a real WhatsApp number with real GSE prices from the IC feed.

## Architecture
```
WhatsApp Cloud API ──webhook──► Cloudflare Worker (Hono) ──► Queue ──► consumer Worker
                                  ├─ inbound: text | voice (→ Muse Voice Transcribe) | Flow replies (holdings form)
                                  ├─ agent (Spark 1.3, Responses API, tool loop)
                                  │    tools: get_portfolio, get_quotes, fee_preview, search_news(web_search),
                                  │           propose_trade, update_mandate_draft, explain
                                  ├─ policy engine (pure, deterministic; LLM can't bypass)
                                  ├─ approval: interactive buttons → signed TradeIntent (hash, expiry)
                                  ├─ execution: Broker interface → PaperBroker (real last price, volume cap)
                                  ├─ monitor (cron): prices, targets, stop conditions, monthly DCA → proactive proposals
                                  └─ audit log (every LLM call, tool call, policy verdict, approval, fill)
web trust view (server-rendered): mandate · portfolio · proposals · audit timeline
D1 (drizzle) · market data: IC feed marketdata.ic.africa (+ kwayisi fallback, + recorded fixture for demo)
```
The LLM only ever *proposes*. A trade happens only after all three steps pass, in order: the policy engine, then the human's Approve tap, then the execution layer.

## Repo layout (`sika/`)
- `src/fees/`: a new fee engine written from scratch. It works in whole pesewas (bigint) and uses the published IC Securities tiers (2.50% up to GHS 500, 2.25% up to 5,000, 2.00% up to 10,000, 1.75% above; 0.70% of each is statutory levies). Each charge line is rounded on its own, half up, to 2 decimal places. Fee rules are data, not hard-coded. Tests cover tier edges (500.00 vs 500.01, 5,000.00 vs 5,001.00) and the fact that net sale proceeds can drop just above a tier edge.
- `src/mandate/`: a zod `Mandate` schema covering:
  - monthly budget
  - max % per stock
  - allowed and blocked tickers
  - max single order
  - per-day spend cap
  - stop-loss and take-profit after fees
  - "never sell below break-even" flag
  - approval required, which is always true

  It also holds the `compileMandate(text)` function, which calls Spark structured output.
- `src/policy/`: `check(proposal, portfolio, mandate, quotes) → {ok, violations[]}`. It is pure and fully unit-tested.
- `src/market/`: an IC feed client, a kwayisi fallback, and a fixture replay mode.
- `src/broker/`: the `Broker` interface and `PaperBroker`. Fills use the last price, are capped at a share of the day's volume, and charge fees from `src/fees`.
- `src/agent/`: Meta client (OpenAI SDK, `baseURL https://api.meta.ai/v1`, `MODEL_API_KEY`), tool definitions, loop, and prompts.
- `src/ingest/`: voice (`/v1/asr/transcribe`) and `parseHoldings(text)`. Spark structured output turns "200 MTN at about 1.80, and some GCB I bought last year for 3,000 cedis" into holdings rows. Each row is quantity plus either the price per share or the total paid, and is marked as given by the user or estimated. Tickers are matched to the IC feed list, so "MTN" becomes MTNGH.
- `src/flows/`: a WhatsApp Flow (static JSON, no endpoint needed) titled "Your holdings". It has a stock dropdown with every GSE ticker, plus quantity and price-or-total fields, pre-filled from what the user said. It is used to confirm, fix or add holdings.
- `src/whatsapp/`: webhook verification, the signature check (`X-Hub-Signature-256`), and sending text, interactive buttons, images, and media download.
- `src/cards/`: a Muse Image portfolio/contract-note card. Exact figures always go in the message text.
- `src/web/`: the trust view pages.
- `src/monitor/`: scheduled jobs.
- `README.md` covers the pitch, architecture, Meta models used, safety design, the not-advice disclaimer, and setup.

## Build order (Oct 29 → Nov 4)
1. **Day 1:**
   - Scaffold the project.
   - Port the fee engine and its tests.
   - Build the market-data client.
   - Deploy a Worker to workers.dev and get the WhatsApp webhook echoing.
   - Make a Meta API "hello" call.
2. **Day 2:** the agent loop with tools, the mandate compiler, and the onboarding flow (text → mandate card → Confirm).
3. **Day 3:** the policy engine, proposals that show a fee preview, Approve/Reject buttons, the PaperBroker, and a contract-note-style confirmation.
4. **Day 4:** voice-note input, "tell me what you own" onboarding plus the holdings Flow, and the monitor (target or stop reached → proactive proposal; monthly DCA nudge).
5. **Day 5:**
   - The trust view web page.
   - Muse Image cards.
   - `web_search` news grounding with citations.
   - Red-team guardrails: an "all-in" request, prompt injection in news, and limits exceeded.
6. **Day 6:**
   - Deploy with `wrangler deploy`.
   - Write the seeded demo script.
   - Record the video (about 3 minutes), write the README, and submit.

## Demo script (video)
1. A voice note in WhatsApp: "GH₵500 a month, long term, I like banks and MTN, max 30% in one stock, never sell at a loss after fees." Sika replies with a mandate card and [Confirm].
2. A voice note: "I have 200 MTN, bought at about 1.80, and some GCB, I think 3,000 cedis worth." Sika reads it back and asks only what is missing ("How many GCB shares?"). It then shows the list with [Looks right] [Fix in form]. The form is a WhatsApp Flow, pre-filled. Then it shows the break-even prices after fees, with estimates labelled.
3. "Invest this month's 500." Sika proposes, for example, "Buy 150 MTNGH @ 3.25, fees GH₵12.19 (2.50% tier)", with its reasoning and news citations, plus [Approve][Why?][Reject]. Approve → fill → confirmation card.
4. "Put everything into one stock now." The policy engine blocks it, Sika explains which limit applies, and it offers a version that fits the mandate.
5. A proactive alert: "GCB hit your +20% after-fees target." Sika proposes a sale, the user approves, and the trade fills.
6. The trust view shows the audit trail: model reasoning → tool calls → policy verdict → approval → fill.

## What I need from you (dev.meta.ai / Meta)
- A **Meta Model API key** from dev.meta.ai. The launch docs said "US developers only", so confirm a call works from Ghana with your hackathon credits.
- A **Meta for Developers app with the WhatsApp product**: test phone number ID, WABA ID, a permanent (system user) token, the app secret, and your phone added as a test recipient.
- A Cloudflare account (you already have one). The free `*.workers.dev` URL is enough; no domain needed.

## Verification
- `npm test`: the fee engine tests match to the pesewa, the policy engine has a test for each rule, and mandate schema round-trips are checked.
- An agent eval script runs about 15 scripted prompts (onboarding, proposals, all-in request, injection, over-budget). It asserts that no trade intent is created without a policy pass plus approval.
- Manual end-to-end run on a real phone on the deployed workers.dev URL: the full demo script runs twice, cleanly.
- A cost check: log tokens per call and keep the total well under $150.

## Positioning
Sika is a prototype. Execution is simulated, and the copy says it is not investment advice. In real use it would act only within the client's own mandate, through a licensed broker.

## Hosting (free): Cloudflare Workers
One Worker, all on the Workers Free plan:
- **Hono** handles the WhatsApp webhook and serves the trust view (server-rendered JSX). No separate Next.js app.
- **Webhook → Queue.** The webhook checks the signature, de-duplicates by WhatsApp message id, puts the message on a **Queue** and returns 200 at once. A queue consumer runs the agent. Consumers get 15 minutes of wall-clock time, so slow model calls are fine.
- **D1** stores the mandate, portfolio, intents, fills and audit log (5 GB, 5M reads and 100k writes a day).
- **Cron Triggers** run the monitor: intraday price checks and a monthly DCA nudge. 2–3 of the 5 free triggers are used.
- **Free `sika-<you>.workers.dev` URL** for the webhook. For development, `wrangler dev` plus a free `cloudflared` quick tunnel, or just deploy, since it takes seconds.

Free-plan limits to design around:
- **10 ms CPU per invocation.** Waiting on network calls doesn't count, so most of the work is cheap I/O. The CPU-heavy parts are big base64 media and image rendering.
  - Drop the satori/resvg card. Send exact numbers as WhatsApp text, plus a Muse Image card where it adds flair.
  - If converting voice notes breaks the CPU limit, run that one step during the demo through the free tunnel from the laptop.
- **100k requests a day, 10k queue operations a day, 50 subrequests per invocation.** All far above demo needs.
- **Queue messages last 24h.** Fine.

Not chosen: Vercel Hobby (Next.js). It's also free, but cron runs at most once a day, which breaks the price monitor.

## Getting holdings in: "tell me what you own"
This replaces the statement photo import.
1. **Just say it** (voice or text). For example: "200 MTN at about 1.80, some GCB, and 50 Ecobank I got last year." Spark turns this into rows and matches each name to a GSE ticker.
2. **Sika asks only for what is missing,** one short question at a time: how many shares, and the price paid or the total paid. "I don't know" is a valid answer.
3. **Unknown cost.** If the user doesn't know what they paid, Sika uses today's price plus buy charges as the starting cost and labels it "estimate, from today". Break-even is then measured from now, and the user can fix it later.
4. **Confirm with buttons:** [Looks right] [Fix in form]. The form is a **WhatsApp Flow**: a native form inside the chat, pre-filled, with a dropdown for every GSE stock. It's quicker than typing for corrections and adds a second Meta platform feature for the judges.
5. **New investors** say "I don't own any yet." Sika starts with an empty portfolio, and the first monthly contribution becomes the first proposal.
6. **Later updates come from chat too:** "I sold my Ecobank" or "bought 100 more MTN at 1.95". Trades Sika executes are recorded automatically.

Why this is better:
- It's faster than finding a statement and works for any broker, not just IC.
- It works by voice.
- It removes the PDF/vision step, which was the biggest risk to the 10 ms CPU limit on Workers.
- It shows off the language model doing what it's best at.

