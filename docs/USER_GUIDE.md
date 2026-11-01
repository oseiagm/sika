# Sika user guide

Sika is an investing assistant for the Ghana Stock Exchange (GSE) that you talk to on WhatsApp. You tell it your goals, and together you set up a **plan**: a short set of limits you approve. Sika then helps you invest within that plan.

Sika suggests trades with the exact charges, explains why, and **only acts when you tap Approve**. It can never break your plan, even if you ask it to.

> **Prototype notice.** Sika is a hackathon prototype. Trades are **simulated** on real GSE prices; no real money moves and no real orders are placed. Sika gives information within your own plan; it is not personal investment advice.

---

## 1. Getting started

Send Sika's WhatsApp number any message, for example **"Hi"**. Sika welcomes you and shows two buttons: **Let's start** and **How it works**.

Setup has three short steps, and Sika always shows where you are (*Step 1 of 3 · About you*):

| Step | What happens | How you answer |
|---|---|---|
| **1 · About you** | Five quick questions about you as an investor | Tap one of three answers, or reply in your own words |
| **2 · Your plan** | Your goal, how much a month, and any stocks you like or avoid. Sika then shows a suggested plan | Pick from a list, or type ("about 400 a month") |
| **3 · What you own** | Shares you already have, or "starting fresh" | A short form, or a message or voice note |

Then you're on the **home** screen, with buttons to **invest**, see **your portfolio**, or see **more options**.

Setup takes about three minutes, and your progress is saved after every answer. If you stop halfway, send any message and Sika picks up where you left off.

**You're never stuck:**
- Every message from Sika ends with buttons, or a **Menu** button that opens a list of everything you can do.
- You can always type or send a **voice note** instead of tapping. Sika shows what it heard ("🎙️ …") so you can check.
- Ask a question at any point ("what is a share?"). Sika answers, then shows the step you were on again.
- Send **menu** at any time.

### Your investor profile (step 1)

1. When might you need this money back?
2. Could you handle an emergency, like a hospital bill, without touching it?
3. If GHS 1,000 became GHS 800 in a month, what would you do?
4. Have you bought shares before?
5. Slow and steady, some ups and downs, or go big?

Questions 1 and 2 measure your **capacity** for risk (what you can afford). Questions 3 to 5 measure your **willingness** (what you're comfortable with). Your profile, **Cautious 🛡️, Balanced ⚖️ or Adventurous 🚀**, is the *lower* of the two, which is how professional advisers do it. Money you may need within a year is always Cautious.

Sika shows how it read your answers and explains the result. Tap **Sounds right** to go on, or **Retake questions**. Say **skip** if you'd rather set your limits yourself.

The scoring is fixed rules, not AI guesswork, so the same answers always give the same profile.

### Your plan (step 2)

Your profile sets the starting limits:

| Profile | Max in one stock | Take profit | Stop loss |
|---|---|---|---|
| Cautious | 20% | +15% | -10% (and "never sell at a loss" on) |
| Balanced | 30% | +25% | -15% |
| Adventurous | 40% | +50% | -25% |

The most per order starts at twice your monthly amount.

Sika shows the full plan card with two buttons:
- **Confirm plan** saves it.
- **Change something** opens a list of every setting. Tap one, pick a new value from the list, and you're back at the plan card. Nothing is saved until you confirm.

If you choose more risk than your profile suggests, the plan card shows a note, but the choice is yours.

## 2. Your plan: the limits Sika must follow

| Setting | What it means |
|---|---|
| Goal and time frame | What you're investing for. The time frame comes from your profile |
| Risk level | Cautious, balanced or adventurous. Changing it resets the limits to that level's defaults |
| Monthly amount | How much you plan to invest each month. Sika won't propose buys past it in a calendar month |
| Max per order | The most a single order can cost, charges included |
| Max in one stock | The largest share of your portfolio any one stock may be |
| Take profit / stop loss | Levels, measured **after charges**, at which Sika sends you a ready proposal |
| Never sell at a loss | If on, Sika never proposes a sale below what you paid after charges, and the stop loss is off |
| Stocks I like or avoid | Stocks to focus on, and stocks Sika must never propose buying |

**Only you can change it**, from **Menu → My plan → Change something**, or by asking in your own words ("set my take profit to 30%"), followed by a card to confirm. Sika can't loosen your plan for you, even if you ask it to "forget the limits".

## 3. Telling Sika what you own

Just say it the way you'd tell a friend, by text or voice note:

> "I have 200 MTN, bought at about 1.80, some GCB, I paid 3,000 cedis for it, and 50 Ecobank but I don't remember the price."

Sika will:
- match names to GSE tickers, e.g. "MTN" → **MTNGH**. It asks if a name could mean more than one stock, such as Ecobank Ghana (EGH) or Ecobank Transnational (ETI)
- ask only for what's missing, e.g. "How many GCB shares?"
- add IC Securities' buying charges when you give a price per share
- use today's price as an **estimate** if you don't know what you paid, clearly labelled. You can correct it any time

You then get a list to check. Tap **Looks right** to save it, or **Fix something** to correct it.

To update later, just say so: "I sold my Ecobank" or "I bought 100 more MTN at 1.95".

**Prefer step by step?** Tap **Step by step** (in setup, or **Menu → Update holdings**). Sika asks three short questions in the chat:
1. **Which stock?** Pick from today's most-traded stocks, or type any name or ticker. If a name could mean two stocks, such as Ecobank Ghana or Ecobank Transnational, Sika asks which one.
2. **How many shares?** Type the number.
3. **What did you pay?** Tap **Price per share**, **Total I paid** or **I don't know**, then type the amount.

Check the summary and tap **Looks right**. Each pass adds or updates one stock; your other holdings stay as they are.

## 4. Asking questions

Some things you can ask:
- "What's MTN trading at?"
- "How many GCB shares can I buy with 500 cedis, all charges in?"
- "What would it cost to sell 100 MTNGH?"
- "Show my portfolio"
- "Any recent news on MTN Ghana?" Sika searches the web and ends with links to its sources. It only shows links the search actually returned.
- "Compare MTN and GCB for 500 cedis": buyers, sellers, the gap between them, how each fits your plan, and what 500 cedis buys in each. Sika lays out the trade-offs but doesn't pick for you.
- "follow CAL" / "unfollow CAL": Sika messages you when there's important news on a stock (see section 7)

**Sika sticks to GSE investing.** It won't answer questions about other topics or other markets (crypto, forex, foreign stocks), write essays or code, or change its rules because a message asks it to. You'll get a short reply saying what it can help with.

Every price, charge and amount comes from GSE market data and Sika's fee calculator, not from the AI's memory.

**Where prices come from.** Sika uses **IC Securities' market data** (marketdata.ic.africa). It reads two things:
- a snapshot of every GSE stock, which can lag a little
- the **live order book** for any stock where money would move or that you hold: proposals, approvals, simulated fills, your portfolio and alerts

**Three prices, not one.** On the GSE, many stocks trade thinly, so there's often a gap between buyers and sellers. Sika shows all three:

| Price | Meaning |
|---|---|
| **Buyers (bid)** | The best price someone will pay right now: what **you get when you sell** |
| **Sellers (ask)** | The best price someone will sell at right now: what **you pay when you buy** |
| **Last trade** | Where the most recent deal happened |

For example: "MTNGH: buyers at GHS 6.45, sellers at GHS 6.50, last trade GHS 6.60". On a thin stock like GCB, the gap can be over 15%.

This is why:
- **buys** are proposed and simulated at the **ask**, and **sells** at the **bid**
- your **portfolio** is valued at the **bid**, what you'd really get today. When nobody is bidding, Sika uses the last trade and says so
- alerts trigger on the bid, so a take-profit alert means you could actually sell at that price
- if nobody is selling (or buying) a stock, Sika tells you instead of proposing a trade that can't happen
- an order never fills for more shares than are on offer at that price

## 5. Investing: proposals and approval

Say something like **"Invest this month's 500"** or **"Sell half my MTN"**. Sika will:

1. Pick a trade that fits your goal and plan.
2. Check it against **every limit in your plan**. If a rule blocks it, Sika tells you which one and suggests what would fit.
3. Send a **proposal card**:

```
Proposed: Buy 72 MTNGH @ GHS 6.74
Gross: GHS 485.28
  CSD levy: GHS 0.73 · SEC levy: GHS 0.73 · GSE levy: GHS 1.70
  Market development levy: GHS 0.24 · Brokerage: GHS 8.74
Charges: GHS 12.14 (2.50% tier)
Total to pay: GHS 497.42
Break-even sell price: GHS 7.07
✅ Passed 8 plan checks
```

Then tap one of the buttons:
- **Approve:** the trade is executed (simulated) and you get a receipt like a broker's contract note.
- **Why?:** Sika's reasons, the main risk, any news it used, and the list of plan checks that passed.
- **Reject:** nothing happens.

**Safety built in:**
- A proposal is valid for **30 minutes**.
- If the price moves more than **2%** before you approve, Sika cancels it and asks you to request a fresh one.
- Your plan is checked again at the moment you approve.
- Tapping Approve twice never trades twice.
- Each proposal is locked (signed) exactly as you saw it, so nothing can change between your tap and the trade.
- On the GSE, some stocks trade only a few shares a day. Sika never fills more shares than actually traded that day, and tells you if an order filled only partly.

## 6. Understanding the numbers

- **Charges:** IC Securities' published GSE rates. The all-in rate depends on the size of each order:

  | Order size (gross) | All-in rate |
  |---|---|
  | Up to GHS 500 | 2.50% |
  | GHS 500.01 – 5,000 | 2.25% |
  | GHS 5,000.01 – 10,000 | 2.00% |
  | Above GHS 10,000 | 1.75% |

  Each rate is 0.70% in statutory levies (CSD 0.15%, SEC 0.15%, GSE 0.35%, market development 0.05%) plus brokerage. Charges apply on **both** buying and selling.
- **Break-even price:** the lowest price at which selling returns at least what you paid, after both sides' charges.
- **Profit or loss** is always shown **after charges**. A stock back at the price you paid is still a small loss.

## 7. Alerts and reminders

**Take-profit and stop-loss alerts.** While the GSE is open (weekdays 10:00–15:00), Sika checks your holdings every 30 minutes against your plan's levels, measured **after all charges**.
- When a holding reaches your **take-profit** level, Sika sends a ready proposal to sell **half** of it, locking in part of the gain and keeping the rest invested.
- When a holding falls below your **stop-loss** level, Sika proposes selling **all** of it. Stop loss is off if your plan says "never sell at a loss".
- Either way, nothing is sold unless you tap **Approve**. The proposal still goes through every plan check.
- Each alert fires **once per level**. If you reject it, Sika won't nag you again until your holding or plan changes.
- Send **/alerts** to see the exact prices that would trigger each alert.

**News alerts.** Sika checks the news on the stocks you **hold or follow** twice each weekday (08:00 and 13:00). When there's an important story (results, dividends, deals, regulation, management changes, big price moves), it sends a short summary with a link to the source.
- At most one story per stock at a time and two a day in total, and never the same story twice, even when several outlets cover it.
- Under each news message: **More news**, **Unfollow** (for stocks you follow) and **Stop news alerts**. Following a stock again turns news back on.

**Monthly reminder.** In the first week of each month, if you have a monthly amount and haven't invested yet, Sika asks: **Invest now** or **Not this month**.

**One WhatsApp rule:** businesses can only message you within **24 hours of your last message**. If you've been quiet for longer, Sika sends a short notice instead ("There's a new update on MTNGH…") with a **Show me** button. Tapping it shows the news, or, for a price alert, checks the live price again and gives you a fresh proposal if your level is still reached.

## 8. The menu and shortcuts

Send **menu** at any time, or tap the **Menu** button under Sika's messages. During setup it offers **Continue setup**, **How Sika works** and **Start over**. After setup it lists everything:

| Menu item | What it does |
|---|---|
| Invest this month | A trade proposal for your monthly amount |
| My portfolio | Your holdings, profit after charges and break-even prices |
| Check a price | Live GSE prices and the exact charges to trade |
| News & stocks I follow | Recent news on the stocks you hold, follow or like, with links to sources |
| Update holdings | Add or correct a holding, with the form or a message |
| My plan | Your plan, with **Change something** to edit any setting |
| My alerts | The prices that trigger your take-profit and stop-loss alerts |
| My investor profile | Your profile, with **Retake questions** |
| How Sika works | A quick guide |
| Start over | Deletes your profile, plan, holdings and history. **Sika asks you to confirm first** |

**Shortcuts for regular users:** right after the menu appears you can reply with its number (e.g. **2** for your portfolio). You can also type shortcuts like **/portfolio**, **/invest**, **/plan** or **/follow GCB**; some WhatsApp versions show them as a list when you type **/**. You never need these: everything is also a button.

## 9. Privacy

- Sika stores only what it needs: your WhatsApp number and name, your profile, plan, holdings, chat with Sika, proposals and simulated trades.
- Voice notes are turned into text and the audio isn't kept; Sika keeps only the transcript.
- Sika never asks for your broker login, bank details or Mobile Money PIN, and it cannot move real money.
- Messages are processed by Meta's AI models: Muse Spark understands them, and Muse Voice Transcribe turns voice notes into text.
- **Start over** (in the menu) deletes your data.

## 10. Extras

- **Your activity page.** With every trade receipt and portfolio view, Sika sends a private link to a page showing each decision step by step: why Sika suggested the trade, the order book it was priced from, every plan check (or what blocked it), your decision, and the fill. Anyone you share the link with can see it.
- **A first-step postcard.** After your very first investment, Sika sends a picture of your goal (a house, a graduation, your shop…) with your first trade written on it.
- **Your language.** Write to Sika in Twi, Ga, Ewe, Hausa or Pidgin and it answers in the same language. Setup buttons and amounts stay in English.
- **Try it on the web.** The same Sika runs in a browser on Sika's website, for people without WhatsApp access to the test number.

## 11. FAQ

**Is this real trading?** No. It's a prototype on real GSE prices with simulated execution.

**Can Sika trade without me?** No. Every trade needs your Approve tap, and your plan is checked before and at the moment of approval.

**Why did Sika refuse my request?** It would break one of your plan's limits. Sika tells you which rule. You can change your plan if you really want to.

**Why does Sika say a price may be out of date?** The GSE data feed marks some prices as stale, for example when a stock hasn't traded recently. Treat those with care.

**Why did my order only partly fill?** Fewer shares traded that day than you asked for. Many GSE stocks trade thinly.
