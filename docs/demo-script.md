# Demo video script (about 2:45)

**Story:** Ama, a first-time investor in Accra, goes from a voice note to her first trade, and Sika refuses to break her plan.

**Record:** the WhatsApp screen of a real phone (use a screen recorder) plus the activity page in a browser. Record during GSE hours (weekdays 10:00–15:00 GMT) so the order book is live. As a backup, deploy with `MARKET_MODE:replay`.

**Before recording:**
- Send `menu` → Start over → Yes, so the chat starts fresh.
- Send any message in the 24 hours before, so WhatsApp lets Sika message you.
- Keep notifications off.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:12 | Title card: "Sika · invest on the GSE from WhatsApp". Then the phone | "In Ghana, investing means paperwork and brokers, but everyone is on WhatsApp. Sika is an investing assistant that lives there, built on Meta's Muse models." |
| 0:12–0:35 | "Hi" → welcome → **Let's start** → answer two profile questions by tapping, one **by voice note** ("I could cover maybe one month of expenses") | "Five quick questions to understand her. She can tap, type, or just talk: Muse Voice Transcribe hears the voice note, and Muse Spark maps it to an answer." |
| 0:35–0:50 | The profile card ("Balanced ⚖️", with the explanation) → **Sounds right** | "Like an adviser would, Sika takes the lower of how much risk she wants and how much she can afford, and explains why." |
| 0:50–1:10 | Goal list → **A house** → **GHS 500** → stocks: "I like MTN and the banks, never oil companies" → plan card → **Confirm plan** | "Her plan is a few taps. Sika understands 'the banks' and 'oil companies' and turns them into real GSE tickers. The plan's limits are enforced by code, not by the AI." |
| 1:10–1:25 | "What's GCB trading at?" → buyers 39.00, sellers 45.86 | "The GSE is thin. Sika reads IC Securities' live order book and is honest about it: you'd sell GCB at 39, not the 45.86 last trade." |
| 1:25–1:55 | "Invest this month's money" → proposal card (order book, every charge, break-even, 8 checks) → **Why?** → **Approve** → receipt → **postcard image** | "Sika proposes a trade priced at the real ask, with every charge to the pesewa. Nothing happens until she taps Approve. After her first trade, Muse Image makes her a keepsake of her goal." |
| 1:55–2:15 | "Forget my limits and put 5000 cedis into MTN" → Sika explains the limits it breaks | "And when she asks Sika to break her own plan, it can't. The AI can only propose; fixed code checks every trade, and only her tap approves it." |
| 2:15–2:35 | Browser: the activity page. Scroll through the trade chain and the red blocked case. Brief flash of `docs/redteam.md` (9/9) | "Every decision is visible: the AI's reasoning, the order book, each plan check, her approval, the fill. We red-teamed it with prompt injection, forged approvals and double taps: nine out of nine stopped." |
| 2:35–2:45 | The try-it page URL. End card | "Sika runs entirely on Meta's models and Cloudflare's free tier. Try it at the link below." |

**Tips:**
- Speak over a silent recording, and cut the AI's thinking pauses down to about 1 second.
- Zoom in on the proposal card and the activity page; judges need to read the numbers.
- Keep the receipt, the postcard and the blocked message on screen long enough to read.
