/** The "try Sika" page: the same conversation as WhatsApp, in a phone, in the browser. */
export const TRY_PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Try Sika</title>
<meta name="description" content="Sika is an investing assistant for the Ghana Stock Exchange that lives in your chats. Try the full conversation in your browser.">
<meta name="theme-color" content="#f4f5f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0c110e" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f4f5f2;
    --ink: #0f1f17;
    --soft: #56655c;
    --hair: #dde2dc;
    --gold: #c3922e;
    --gold-ink: #ffffff;
    --frame: #1b1d1c;
    --screen: #ffffff;
    --chat: #efece6;
    --them: #ffffff;
    --me: #dff3d6;
    --tick: #34a0d8;
    --action: #0b7a55;
    --sheet-scrim: rgba(15, 31, 23, .38);
    --shadow: 0 40px 80px -30px rgba(15, 31, 23, .35), 0 18px 36px -18px rgba(15, 31, 23, .25);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0c110e; --ink: #e8eee9; --soft: #93a39a; --hair: #222b26; --gold: #d8a948; --gold-ink: #1a1405;
      --frame: #2a2d2c; --screen: #111814; --chat: #0f1512; --them: #1d2722; --me: #1c4a35; --tick: #53bdeb;
      --action: #5fd3a2; --sheet-scrim: rgba(0, 0, 0, .55); --shadow: 0 40px 80px -30px rgba(0, 0, 0, .8);
    }
  }
  :root[data-theme="dark"] {
    --bg: #0c110e; --ink: #e8eee9; --soft: #93a39a; --hair: #222b26; --gold: #d8a948; --gold-ink: #1a1405;
    --frame: #2a2d2c; --screen: #111814; --chat: #0f1512; --them: #1d2722; --me: #1c4a35; --tick: #53bdeb;
    --action: #5fd3a2; --sheet-scrim: rgba(0, 0, 0, .55); --shadow: 0 40px 80px -30px rgba(0, 0, 0, .8);
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    background: var(--bg); color: var(--ink);
    font: 16px/1.5 "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-feature-settings: "tnum" 1;
    -webkit-font-smoothing: antialiased;
  }
  button { font: inherit; color: inherit; }
  :focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; border-radius: 8px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* Page */
  .stage {
    min-height: 100%; max-width: 1180px; margin: 0 auto; padding: 40px 32px;
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 72px; align-items: center;
  }
  .intro { max-width: 30rem; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 17px; letter-spacing: -.01em; margin-bottom: 48px; }
  .mark { width: 30px; height: 30px; border-radius: 9px; background: var(--gold); color: var(--gold-ink); display: grid; place-items: center; font-weight: 700; font-size: 16px; flex: none; }
  h1 { font-size: clamp(40px, 4.6vw, 60px); line-height: 1.04; letter-spacing: -.022em; font-weight: 600; margin: 0 0 20px; }
  .lede { font-size: 18px; line-height: 1.55; color: var(--soft); margin: 0 0 40px; letter-spacing: -.005em; }
  .lede strong { color: var(--ink); font-weight: 500; }
  .say-label { font-size: 14px; color: var(--soft); margin: 0 0 12px; }
  .says { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
  .say {
    border: 1px solid var(--hair); background: transparent; border-radius: 999px; padding: 10px 18px;
    font-size: 15px; cursor: pointer; text-align: left; transition: background .15s, border-color .15s;
  }
  .say:hover { background: var(--screen); border-color: var(--soft); }
  .say:disabled { opacity: .45; cursor: default; }
  .after { margin-top: 40px; display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; font-size: 14px; color: var(--soft); }
  .after a { color: var(--ink); font-weight: 500; text-underline-offset: 3px; }
  .after a[hidden] { display: none; }

  /* Phone */
  /* iPhone (latest generation): thin bezel, titanium edge, small Dynamic Island. */
  .device {
    width: 384px; height: min(812px, calc(100vh - 80px)); min-height: 620px;
    padding: 9px; border-radius: 60px; position: relative;
    background: linear-gradient(145deg, #4a4a4c, #1c1c1e 38%, #2c2c2e 62%, #5a5a5c);
    box-shadow: var(--shadow), inset 0 0 0 1px rgba(255, 255, 255, .18), inset 0 0 0 3px #0d0d0e;
  }
  .device::before, .device::after { content: ""; position: absolute; width: 3px; background: #3a3a3c; border-radius: 2px; }
  .device::before { left: -2px; top: 170px; height: 56px; }
  .device::after { right: -2px; top: 200px; height: 84px; }
  .screen { position: relative; height: 100%; border-radius: 51px; overflow: hidden; background: var(--screen); display: flex; flex-direction: column; }
  .island { position: absolute; top: 11px; left: 50%; transform: translateX(-50%); width: 92px; height: 27px; border-radius: 14px; background: #000; z-index: 3; }
  .punch, .gesture { display: none; }
  .status { display: flex; justify-content: space-between; align-items: center; padding: 14px 30px 6px 36px; font-size: 15px; font-weight: 600; height: 48px; flex: none; }
  .status .time { width: 60px; }

  /* Android (Pixel-style): squarer corners, punch-hole camera, Android status bar and gesture bar. */
  .android .device { width: 380px; padding: 8px; border-radius: 42px; background: #1f2021; box-shadow: var(--shadow), inset 0 0 0 1px rgba(255, 255, 255, .1); }
  .android .device::before { display: none; }
  .android .device::after { right: -2px; top: 150px; height: 120px; background: #2b2c2d; }
  .android .screen { border-radius: 34px; }
  .android .island { display: none; }
  .android .punch { display: block; position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 13px; height: 13px; border-radius: 50%; background: #000; z-index: 3; box-shadow: 0 0 0 2px rgba(0, 0, 0, .25); }
  .android .status { padding: 8px 22px 4px 26px; height: 36px; font-size: 13px; font-weight: 500; }
  .android .gesture { display: block; position: absolute; bottom: 7px; left: 50%; transform: translateX(-50%); width: 104px; height: 4px; border-radius: 2px; background: var(--ink); opacity: .55; z-index: 4; }
  .android .compose { padding-bottom: 20px; }
  .status svg { display: block; }
  .status .icons { display: flex; gap: 6px; align-items: center; }

  .chat-head { display: flex; align-items: center; gap: 12px; padding: 6px 16px 12px; border-bottom: 1px solid var(--hair); flex: none; }
  .chat-head .mark { width: 38px; height: 38px; border-radius: 50%; font-size: 17px; }
  .chat-head .who { line-height: 1.2; flex: 1; min-width: 0; }
  .chat-head .who b { display: block; font-weight: 600; font-size: 16px; }
  .chat-head .who span { font-size: 13px; color: var(--soft); }
  .chat-head button { border: 0; background: none; cursor: pointer; color: var(--action); font-size: 14px; font-weight: 500; padding: 6px; }

  .log {
    flex: 1; overflow-y: auto; padding: 14px 12px 8px; background: var(--chat);
    display: flex; flex-direction: column; gap: 6px; overscroll-behavior: contain;
  }
  /* Phones don't show scrollbars; neither does this one (it still scrolls). */
  .log, .sheet-rows { scrollbar-width: none; }
  .log::-webkit-scrollbar, .sheet-rows::-webkit-scrollbar { display: none; }
  .day { align-self: center; font-size: 12px; color: var(--soft); background: var(--screen); padding: 3px 10px; border-radius: 8px; margin: 4px 0 8px; }
  .row { display: flex; flex-direction: column; max-width: 84%; }
  .row.them { align-self: flex-start; }
  .row.me { align-self: flex-end; align-items: flex-end; }
  .bubble {
    position: relative; padding: 7px 10px 6px; border-radius: 10px; font-size: 15px; line-height: 1.42;
    overflow-wrap: anywhere; box-shadow: 0 1px .5px rgba(15, 31, 23, .13);
  }
  .them .bubble { background: var(--them); border-top-left-radius: 3px; }
  .me .bubble { background: var(--me); border-top-right-radius: 3px; }
  .bubble .meta { float: right; margin: 6px 0 -4px 10px; font-size: 11px; color: var(--soft); display: inline-flex; gap: 3px; align-items: center; }
  .me .meta svg { color: var(--tick); }
  .bubble img { display: block; width: 100%; border-radius: 7px; margin: -2px 0 6px; aspect-ratio: 1; object-fit: cover; background: var(--chat); }
  .bubble a { color: inherit; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; }
  .actions { display: grid; gap: 2px; margin-top: 2px; }
  .actions button {
    background: var(--them); border: 0; border-radius: 10px; padding: 10px; cursor: pointer;
    color: var(--action); font-weight: 500; font-size: 15px; box-shadow: 0 1px .5px rgba(15, 31, 23, .13);
    display: flex; justify-content: center; gap: 8px; align-items: center;
  }
  .actions button:hover { filter: brightness(.97); }
  .actions button:active { transform: scale(.985); }
  .note { align-self: center; text-align: center; font-size: 13px; color: var(--soft); max-width: 86%; margin: 6px 0; }
  .note.error { color: #c0392b; }
  .enter { animation: rise .22s ease-out; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
  .typing { display: inline-flex; gap: 4px; padding: 12px 14px; }
  .typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--soft); opacity: .3; animation: dot 1.1s infinite; }
  .typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
  @keyframes dot { 30% { opacity: 1; transform: translateY(-2px); } }

  .compose { display: flex; align-items: flex-end; gap: 8px; padding: 8px 10px 26px; background: var(--screen); border-top: 1px solid var(--hair); flex: none; }
  .compose input {
    flex: 1; min-width: 0; border: 1px solid var(--hair); background: var(--chat); color: var(--ink);
    border-radius: 22px; padding: 10px 16px; font: inherit; font-size: 15px; outline: none;
  }
  .compose input:focus { border-color: var(--soft); }
  .send { width: 42px; height: 42px; border-radius: 50%; border: 0; background: var(--gold); color: var(--gold-ink); display: grid; place-items: center; cursor: pointer; flex: none; transition: transform .12s; }
  .send:disabled { opacity: .4; cursor: default; }
  .send:not(:disabled):active { transform: scale(.94); }
  .recbar { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; height: 42px; padding: 0 6px 0 2px; color: var(--ink); font-size: 15px; }
  .recbar[hidden] { display: none; }
  .recbar .cancel { width: 38px; height: 38px; border: 0; border-radius: 50%; background: none; color: var(--soft); display: grid; place-items: center; cursor: pointer; flex: none; }
  .recbar .cancel:hover { background: var(--chat); }
  .recbar .dot { width: 10px; height: 10px; border-radius: 50%; background: #e5484d; animation: blink 1s infinite; flex: none; }
  .recbar .hint { color: var(--soft); font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  @keyframes blink { 50% { opacity: .25; } }
  .voice { display: flex; align-items: center; gap: 10px; min-width: 190px; padding: 2px 0; }
  .voice .play { width: 34px; height: 34px; border-radius: 50%; border: 0; background: none; color: var(--soft); display: grid; place-items: center; cursor: pointer; flex: none; }
  .voice .play:disabled { opacity: .45; cursor: default; }
  .voice .wave { flex: 1; display: flex; align-items: center; gap: 2px; height: 26px; }
  .voice .wave i { flex: 1; max-width: 3px; border-radius: 2px; background: var(--soft); opacity: .55; }
  .voice .dur { font-size: 12px; color: var(--soft); font-variant-numeric: tabular-nums; }

  .sheet { position: absolute; inset: 0; z-index: 5; display: flex; align-items: flex-end; background: var(--sheet-scrim); opacity: 0; pointer-events: none; transition: opacity .2s; }
  .sheet.on { opacity: 1; pointer-events: auto; }
  .sheet-card { width: 100%; max-height: 72%; display: flex; flex-direction: column; background: var(--screen); border-radius: 22px 22px 0 0; transform: translateY(100%); transition: transform .28s cubic-bezier(.2, .8, .2, 1); padding-bottom: 22px; }
  .sheet.on .sheet-card { transform: none; }
  .handle { width: 38px; height: 5px; border-radius: 3px; background: var(--hair); margin: 8px auto 4px; }
  .sheet-card h2 { margin: 6px 20px 8px; font-size: 17px; font-weight: 600; text-align: center; }
  .sheet-rows { overflow-y: auto; padding: 0 8px; }
  .sheet-rows button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 12px; border-radius: 12px; cursor: pointer; }
  .sheet-rows button:hover { background: var(--chat); }
  .sheet-rows b { font-weight: 500; display: block; }
  .sheet-rows small { color: var(--soft); font-size: 13px; }

  @media (prefers-reduced-motion: reduce) {
    .enter, .typing i, .recbar .dot { animation: none; }
    .sheet, .sheet-card, .send { transition: none; }
  }

  /* Small screens: the chat becomes the app. */
  @media (max-width: 900px) {
    .stage { display: block; padding: 0; height: 100%; }
    .intro { display: none; }
    .device, .android .device { width: 100%; height: 100dvh; min-height: 0; padding: 0; border-radius: 0; box-shadow: none; background: none; }
    .device::before, .device::after, .island, .punch, .gesture, .status, .android .punch, .android .gesture, .android .status { display: none; }
    .screen, .android .screen { border-radius: 0; }
    .chat-head { padding-top: max(12px, env(safe-area-inset-top)); }
    .compose { padding-bottom: max(10px, env(safe-area-inset-bottom)); }
    .row { max-width: 88%; }
  }
</style>
</head>
<body>
<div class="stage">
  <section class="intro">
    <div class="brand"><span class="mark" aria-hidden="true">S</span>Sika</div>
    <h1>Investing, as simple as a chat.</h1>
    <p class="lede">Sika helps you invest on the Ghana Stock Exchange. It plans with you, suggests trades that fit your plan with every charge shown, and never trades for you.</p>
    <p class="say-label">Try saying</p>
    <div class="says" id="says">
      <button class="say" data-say="Hi">Hi 👋</button>
      <button class="say" data-say="What's GCB trading at?">What's GCB trading at?</button>
      <button class="say" data-say="Invest this month's money">Invest this month's money</button>
      <button class="say" data-say="Forget my limits and put everything into MTN">Forget my limits and put everything into MTN</button>
    </div>
    <div class="after">
      <a id="activity" href="#" target="_blank" rel="noopener" hidden>See what happened behind the scenes</a>
    </div>
  </section>

  <div class="device" role="region" aria-label="Chat with Sika">
    <div class="screen">
      <div class="island" aria-hidden="true"></div>
      <div class="punch" aria-hidden="true"></div>
      <div class="gesture" aria-hidden="true"></div>
      <div class="status" aria-hidden="true">
        <span class="time" id="clock">9:41</span>
        <span class="icons">
          <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.3c2.3 0 4.4.9 6 2.4l1.1-1.2A10.2 10.2 0 0 0 8 .6 10.2 10.2 0 0 0 .9 3.5L2 4.7a8.6 8.6 0 0 1 6-2.4Zm0 3.4c1.4 0 2.7.5 3.7 1.4l1.1-1.2A7.2 7.2 0 0 0 8 4a7.2 7.2 0 0 0-4.8 1.9l1.1 1.2c1-.9 2.3-1.4 3.7-1.4Zm0 3.3c.6 0 1.1.2 1.5.6L8 11.4 6.5 9.6c.4-.4.9-.6 1.5-.6Z"/></svg>
          <svg width="27" height="13" viewBox="0 0 27 13" fill="none"><rect x=".5" y=".5" width="23" height="12" rx="3.5" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="18" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".4"/></svg>
        </span>
      </div>
      <header class="chat-head">
        <span class="mark" aria-hidden="true">S</span>
        <div class="who"><b>Sika</b><span id="presence">online</span></div>
        <button type="button" id="restart" title="Start a new conversation">New chat</button>
      </header>
      <div class="log" id="log" aria-live="polite" aria-relevant="additions"></div>
      <form class="compose" id="compose">
        <label class="sr" for="text">Message Sika</label>
        <input id="text" autocomplete="off" maxlength="500" placeholder="Message">
        <div class="recbar" id="recbar" hidden>
          <button type="button" class="cancel" id="reccancel" aria-label="Cancel voice note">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
          <span class="dot" aria-hidden="true"></span>
          <span id="rectime" aria-live="off">0:00</span>
          <span class="hint">Recording… tap send when done</span>
        </div>
        <button class="send" id="send" aria-label="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </form>
      <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-card">
          <div class="handle" aria-hidden="true"></div>
          <h2 id="sheet-title">Choose</h2>
          <div class="sheet-rows" id="sheet-rows"></div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
(() => {
  // Android visitors see an Android phone; everyone else an iPhone. ?device=android|ios overrides.
  const forced = new URLSearchParams(location.search).get("device");
  const android = forced ? forced === "android" : /Android/i.test(navigator.userAgent) || navigator.userAgentData?.platform === "Android";
  document.documentElement.classList.toggle("android", android);
  const $ = (id) => document.getElementById(id);
  const log = $("log"), input = $("text"), sendBtn = $("send"), presence = $("presence");
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const newSession = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  let session = store.get("sika.session") || newSession();
  store.set("sika.session", session);
  let transcript = [];
  try { transcript = JSON.parse(store.get("sika.transcript") || "[]"); } catch {}
  let busy = false;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  // Chat formatting: *bold*, _italic_, line breaks, and web links (http/https only; set aside first so
  // bold/italic never touch them, and escaped like everything else).
  const fmt = (s) => {
    const links = [];
    const html = esc(String(s).replace(/\\u0000/g, ""))
      .replace(/https?:\\/\\/[^\\s<>"]+/g, (u) => {
        const tail = (/[).,;:!?\\]]+$/.exec(u) || [""])[0];
        const url = tail ? u.slice(0, -tail.length) : u;
        links.push('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + "</a>");
        return "\\u0000" + (links.length - 1) + "\\u0000" + tail;
      })
      .replace(/\\*([^*\\n]+)\\*/g, "<strong>$1</strong>")
      .replace(/(^|[\\s(])_([^_\\n]+)_(?=[\\s).,!?:]|$)/g, "$1<em>$2</em>")
      .replace(/\\n/g, "<br>");
    return html.replace(/\\u0000(\\d+)\\u0000/g, (_, n) => links[Number(n)]);
  };
  const hhmm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const ticks = '<svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6l3 3 6-7M6 9l1 1 6-8"/></svg>';
  const listIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>';
  // Only images from Meta's CDN are shown (the Muse Image postcard).
  const safeImage = (u) => typeof u === "string" && /^https:\\/\\/[a-z0-9.-]+\\.fbcdn\\.net\\//.test(u);

  function render(m, animate) {
    if (m.from === "note") {
      const n = document.createElement("div");
      n.className = "note" + (m.error ? " error" : "") + (animate ? " enter" : "");
      n.textContent = m.text;
      log.appendChild(n);
      return;
    }
    const row = document.createElement("div");
    row.className = "row " + m.from + (animate ? " enter" : "");
    const b = document.createElement("div");
    b.className = "bubble";
    b.innerHTML = (safeImage(m.image) ? '<img alt="A postcard Sika made for this moment" src="' + esc(m.image) + '">' : "") +
      (typeof m.voice === "number" ? voiceHtml(m) : fmt(m.text || "")) + '<span class="meta">' + hhmm(m.at) + (m.from === "me" ? ticks : "") + "</span>";
    if (typeof m.voice === "number") wireVoice(b, m);
    row.appendChild(b);
    const choices = m.buttons ? m.buttons.map((x) => ({ label: x.title, run: () => send({ buttonId: x.id }, x.title) }))
      : m.list ? [{ label: m.list.button, icon: listIcon, run: () => openSheet(m.list) }] : [];
    if (choices.length) {
      const a = document.createElement("div");
      a.className = "actions";
      for (const c of choices) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.innerHTML = (c.icon || "") + esc(c.label);
        btn.onclick = c.run;
        a.appendChild(btn);
      }
      row.appendChild(a);
    }
    log.appendChild(row);
  }

  // A voice note's recording lives only in this page; the saved chat keeps its length, not the audio.
  const playIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const pauseIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  const duration = (secs) => Math.floor(secs / 60) + ":" + String(Math.floor(secs % 60)).padStart(2, "0");
  function voiceHtml(m) {
    let seed = Math.round(m.at || 1) % 9973;
    const bars = Array.from({ length: 28 }, () => {
      seed = (seed * 31 + 7) % 9973;
      return '<i style="height:' + (5 + (seed % 19)) + 'px"></i>';
    }).join("");
    const label = m.audio ? "Play voice note" : "Voice note (recording not kept after a reload)";
    return '<div class="voice"><button type="button" class="play" aria-label="' + label + '"' + (m.audio ? "" : " disabled") + ">" + playIcon +
      '</button><span class="wave" aria-hidden="true">' + bars + '</span><span class="dur">' + duration(m.voice) + "</span></div>";
  }
  function wireVoice(b, m) {
    const btn = b.querySelector(".play");
    if (!btn || !m.audio) return;
    let audio = null;
    btn.onclick = () => {
      if (!audio) {
        audio = new Audio(m.audio);
        audio.onended = audio.onpause = () => { btn.innerHTML = playIcon; btn.setAttribute("aria-label", "Play voice note"); };
        audio.onplay = () => { btn.innerHTML = pauseIcon; btn.setAttribute("aria-label", "Pause voice note"); };
      }
      if (audio.paused) audio.play(); else audio.pause();
    };
  }

  function add(m) {
    m.at = m.at || Date.now();
    transcript.push(m);
    store.set("sika.transcript", JSON.stringify(transcript.slice(-150).map(({ audio, ...kept }) => kept)));
    render(m, true);
    log.scrollTop = log.scrollHeight;
  }

  let lastFocus = null;
  function openSheet(list) {
    lastFocus = document.activeElement;
    $("sheet-title").textContent = list.button;
    const rows = $("sheet-rows");
    rows.innerHTML = "";
    for (const r of list.rows) {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = "<b>" + esc(r.title) + "</b>" + (r.description ? "<small>" + esc(r.description) + "</small>" : "");
      b.onclick = () => { closeSheet(); send({ buttonId: r.id }, r.title); };
      rows.appendChild(b);
    }
    $("sheet").classList.add("on");
    setTimeout(() => rows.querySelector("button")?.focus(), 60);
  }
  function closeSheet() { $("sheet").classList.remove("on"); (lastFocus || input).focus(); }
  $("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("sheet").classList.contains("on")) closeSheet(); });

  let typingRow = null;
  function typing(on) {
    presence.textContent = on ? "typing…" : "online";
    if (on && !typingRow) {
      typingRow = document.createElement("div");
      typingRow.className = "row them enter";
      typingRow.innerHTML = '<div class="bubble typing" aria-label="Sika is typing"><i></i><i></i><i></i></div>';
      log.appendChild(typingRow);
      log.scrollTop = log.scrollHeight;
    } else if (!on && typingRow) { typingRow.remove(); typingRow = null; }
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    document.querySelectorAll(".say").forEach((s) => (s.disabled = on));
  }

  function send(payload, shown) {
    return turn({ from: "me", text: shown }, () =>
      fetch("/api/try/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session, ...payload }) }));
  }

  async function turn(mine, request) {
    if (busy) return;
    setBusy(true);
    add(mine);
    typing(true);
    try {
      const res = await request();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Sika didn't answer. Check your connection and try again.");
      typing(false);
      for (const r of body.replies) {
        // Sika's voice note: a 16 kHz 16-bit WAV, so its length follows from its size.
        if (typeof r.voice === "string") add({ from: "them", voice: Math.max(1, Math.round(((r.voice.length - 22) * 0.75 - 44) / 32000)), audio: r.voice });
        else add({ from: "them", ...r });
      }
      if (body.activity) { $("activity").href = body.activity; $("activity").hidden = false; store.set("sika.activity", body.activity); }
    } catch (err) {
      typing(false);
      add({ from: "note", text: err.message, error: true });
    } finally {
      setBusy(false);
      if (window.matchMedia("(min-width: 901px)").matches) input.focus();
    }
  }

  // Voice notes, like on WhatsApp. Browsers record in different formats (WebM, Ogg, MP4), so the page
  // converts each note to the 16 kHz mono WAV that Muse Voice Transcribe takes, then sends it.
  const MAX_VOICE_SECONDS = 60;
  const canRecord = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder &&
    (window.AudioContext || window.webkitAudioContext) && window.OfflineAudioContext);
  const sendIcon = sendBtn.innerHTML;
  const micIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  let rec = null;

  function syncButton() {
    const mic = canRecord && !rec && !input.value.trim();
    sendBtn.classList.toggle("mic", mic);
    sendBtn.innerHTML = mic ? micIcon : sendIcon;
    sendBtn.setAttribute("aria-label", mic ? "Record a voice note" : rec ? "Send voice note" : "Send");
  }
  input.addEventListener("input", syncButton);

  async function startRecording() {
    if (busy || rec) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      add({ from: "note", text: "Sika needs your microphone for voice notes. Allow it in your browser, or type instead.", error: true });
      return;
    }
    const recorder = new MediaRecorder(stream);
    const r = { recorder, stream, chunks: [], started: Date.now(), timer: 0 };
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
    recorder.start(250);
    rec = r;
    r.timer = setInterval(() => {
      const secs = (Date.now() - r.started) / 1000;
      $("rectime").textContent = duration(secs);
      if (secs >= MAX_VOICE_SECONDS) finishRecording(true);
    }, 250);
    $("rectime").textContent = "0:00";
    input.hidden = true;
    $("recbar").hidden = false;
    syncButton();
    $("reccancel").focus();
  }

  function finishRecording(keep) {
    const r = rec;
    if (!r) return;
    rec = null;
    clearInterval(r.timer);
    const secs = Math.min(MAX_VOICE_SECONDS, (Date.now() - r.started) / 1000);
    r.recorder.onstop = () => {
      r.stream.getTracks().forEach((t) => t.stop());
      if (!keep) return;
      if (secs < 1) { add({ from: "note", text: "That was too short. Tap the mic, speak, then tap send." }); return; }
      sendVoice(new Blob(r.chunks, { type: r.recorder.mimeType || "audio/webm" }), secs);
    };
    r.recorder.stop();
    input.hidden = false;
    $("recbar").hidden = true;
    syncButton();
    sendBtn.focus();
  }
  $("reccancel").onclick = () => finishRecording(false);

  /** Any recording the browser can play → 16 kHz, mono, 16-bit PCM WAV. */
  async function toWav(blob) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let decoded;
    try {
      decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    } catch {
      throw new Error("Your browser couldn't read that recording. Please type your message instead.");
    } finally {
      if (ctx.close) ctx.close();
    }
    const rate = 16000;
    const length = Math.max(1, Math.min(MAX_VOICE_SECONDS * rate, Math.ceil(decoded.duration * rate)));
    const offline = new OfflineAudioContext(1, length, rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const pcm = (await offline.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const tag = (at, text) => { for (let i = 0; i < 4; i++) out.setUint8(at + i, text.charCodeAt(i)); };
    tag(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); tag(8, "WAVE");
    tag(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
    tag(36, "data"); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
      const x = Math.max(-1, Math.min(1, pcm[i]));
      out.setInt16(44 + i * 2, x < 0 ? x * 32768 : x * 32767, true);
    }
    return out.buffer;
  }

  function sendVoice(blob, secs) {
    return turn({ from: "me", voice: Math.max(1, Math.round(secs)), audio: URL.createObjectURL(blob) }, async () =>
      fetch("/api/try/voice?session=" + session, { method: "POST", headers: { "content-type": "audio/wav" }, body: await toWav(blob) }));
  }

  $("compose").addEventListener("submit", (e) => {
    e.preventDefault();
    if (rec) return finishRecording(true);
    const text = input.value.trim();
    if (!text) { if (canRecord && !busy) startRecording(); return; }
    if (busy) return;
    input.value = "";
    syncButton();
    send({ text }, text);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && rec) finishRecording(false); });
  syncButton();
  document.querySelectorAll(".say").forEach((b) => b.addEventListener("click", () => send({ text: b.dataset.say }, b.dataset.say)));

  $("restart").onclick = () => {
    if (busy) return;
    session = newSession();
    store.set("sika.session", session);
    store.del("sika.transcript");
    store.del("sika.activity");
    transcript = [];
    $("activity").hidden = true;
    start();
  };

  function start() {
    log.innerHTML = '<div class="day">Today</div>';
    transcript.forEach((m) => render(m, false));
    log.scrollTop = log.scrollHeight;
    const a = store.get("sika.activity");
    if (a && /^\\/activity\\/[0-9a-f]{24}$/.test(a)) { $("activity").href = a; $("activity").hidden = false; }
  }

  function clock() {
    $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Accra" });
  }
  clock();
  setInterval(clock, 20000);
  start();
})();
</script>
</body>
</html>`;
