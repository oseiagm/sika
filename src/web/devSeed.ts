/** Local design review only (DEV_CHAT=1): preloads a sample conversation into the try page. */
export function devSeedPage(): string {
  const t = Date.now() - 600_000;
  const sample = [
    { from: "me", text: "Hi", at: t },
    {
      from: "them",
      at: t + 2e3,
      text: "Hi 👋 I'm *Sika*, your investing assistant for the Ghana Stock Exchange.\n\nI'll help you set up a plan, then suggest trades with the exact charges. *I never buy or sell for you*: you decide, and you place orders with your own broker.",
      buttons: [
        { id: "flow:start", title: "Let's start" },
        { id: "flow:how", title: "How it works" },
      ],
    },
    { from: "me", text: "What's GCB trading at?", at: t + 60e3 },
    {
      from: "them",
      at: t + 64e3,
      text: "*GCB* right now:\n• buyers at GHS 39.00\n• sellers at GHS 41.70\n• last trade GHS 45.86\n\nThin trading today, so there's a big gap between buyers and sellers.",
      list: { button: "Menu", rows: [{ id: "menu:invest", title: "Invest this month" }, { id: "menu:portfolio", title: "My portfolio" }] },
    },
    { from: "me", text: "Invest this month's money", at: t + 120e3 },
    {
      from: "them",
      at: t + 126e3,
      text: "*Suggestion: buy 75 MTNGH* at about GHS 6.50\n_MTN Ghana Limited_\nBuyers GHS 6.45 · Sellers GHS 6.50 · Last trade GHS 6.60 (live)\n\nGross: GHS 487.50\nCharges: GHS 12.19 (2.50% tier)\n*Total to pay: GHS 499.69*\nBreak-even sell price: GHS 6.83\n\n✅ Fits your plan (8 checks)",
      buttons: [
        { id: "x1", title: "I bought it" },
        { id: "x2", title: "Why?" },
        { id: "x3", title: "Not now" },
      ],
    },
  ];
  const json = JSON.stringify(JSON.stringify(sample)).replace(/</g, "\\u003c");
  return `<script>localStorage.setItem("sika.session","0123456789abcdef0123");localStorage.setItem("sika.transcript",${json});location.replace("/"+location.search);</script>`;
}
