# Sika conversation design

This is how Sika talks to people on WhatsApp, and why it works that way.

## Principles
1. **Visible, not remembered.** Every action is a button or a list row. Slash commands and number replies still work as shortcuts, but no flow depends on them. WhatsApp often hides the "/" suggestions on test numbers and older chats.
2. **Always a next step.** Every message from Sika ends with buttons, or with the **Menu** list button. Nobody is left wondering what to type.
3. **Show where you are.** Setup has three labelled steps: *Step 1 of 3 · About you*, *Step 2 of 3 · Your plan*, *Step 3 of 3 · What you own*.
4. **Choose, don't compose.** Amounts, limits and goals are offered as options. Typing or speaking an answer still works at every step ("about 400 a month" is accepted).
5. **Fixed code runs setup; the AI understands words.** The setup steps are a fixed sequence, so they are predictable and resumable. Muse Spark reads free-text answers and answers side questions, but it never decides what step comes next.
6. **Forgiving.** A question asked mid-setup gets a short answer, then the same step is shown again. Tapping an old button just updates that answer. Every plan setting can be changed later from a list.
7. **Safe.** Sika never trades: it suggests, and the investor places orders with their own broker. Deleting everything asks for confirmation.
8. **Resumable.** Progress is saved after every answer. If a message didn't arrive, the next message the user sends shows the current step again.

## Flow
```
first message ─► Welcome  [Let's start] [How it works]
                    │
Step 1 · About you  ─► 5 questions, 3 buttons each ─► profile card [Sounds right] [Retake]
                    │
Step 2 · Your plan  ─► Goal (list) ─► Monthly amount (list) ─► Stocks you like/avoid [No preference] [Tell Sika]
                    │        ─► Plan card [Confirm plan] [Change something]
                    │                             └► list: goal · monthly · max per order · max in one stock ·
                    │                                take profit · stop loss · never sell at a loss · stocks · risk
Step 3 · What you own ─► [Yes, I own some] [No, starting fresh]
                    │        └► [Fill a form] [Type or voice note] ─► list to check [Looks right] [Fix] ─► [Add more] [That's all]
                    ▼
Home  "You're all set" + summary  [Invest now] [My portfolio] [More options]
                    │
Free chat ─► the agent answers, with the Menu list button underneath. Suggestions carry [I bought it] [Why?] [Not now].
```

## The Menu (a list, available any time by sending "menu")
- During setup: **Continue setup** · How Sika works · Start over
- After setup: Invest this month · My portfolio · Check a price · News on my stocks · Update holdings · My plan · My alerts · My investor profile · How Sika works · Start over
