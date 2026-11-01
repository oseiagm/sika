// One-off WhatsApp setup: slash commands, ice breakers, and the holdings Flow.
// Run with: node --env-file=.env scripts/setup-whatsapp.mjs
import { readFileSync } from "node:fs";

const GRAPH = "https://graph.facebook.com/v23.0";
const { WA_ACCESS_TOKEN: token, WA_PHONE_NUMBER_ID: phone, WA_BUSINESS_ACCOUNT_ID: waba } = process.env;
const auth = { authorization: `Bearer ${token}` };

async function call(method, path, body, form) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method,
    headers: form ? auth : { ...auth, "content-type": "application/json" },
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json)}`);
  return json;
}

// Commands and ice breakers come from src/menu.ts; keep in step.
const commands = [
  ["menu", "Show everything Sika can do"],
  ["portfolio", "See your holdings, profit after charges and break-even prices"],
  ["invest", "Get a trade proposal for this month's amount"],
  ["price", "Check a GSE price and the exact charges to trade"],
  ["news", "News on your stocks, and the stocks you follow"],
  ["follow", "Follow a stock for news, e.g. /follow GCB"],
  ["holdings", "Add or correct a holding"],
  ["plan", "See or change your investing plan"],
  ["alerts", "See the prices that trigger your alerts"],
  ["profile", "See or retake your investor profile (five quick questions)"],
  ["help", "How Sika works"],
  ["reset", "Delete everything and start over (asks first)"],
].map(([command_name, command_description]) => ({ command_name, command_description }));
const prompts = ["Get started", "Show my portfolio", "Invest this month's money", "What is MTN trading at?"];

console.log("conversational automation:", await call("POST", `${phone}/conversational_automation`, { commands, prompts, enable_welcome_message: false }));

const existing = await call("GET", `${waba}/flows?fields=id,name,status`);
let flow = existing.data.find((f) => f.name === "sika_holding");
if (!flow) flow = await call("POST", `${waba}/flows`, { name: "sika_holding", categories: ["OTHER"] });
const form = new FormData();
form.append("name", "flow.json");
form.append("asset_type", "FLOW_JSON");
form.append("file", new Blob([readFileSync(new URL("../flows/holding.json", import.meta.url))], { type: "application/json" }), "flow.json");
const upload = await call("POST", `${flow.id}/assets`, undefined, form);
console.log("flow", flow.id, "validation errors:", JSON.stringify(upload.validation_errors ?? []));
console.log(`Set WA_HOLDING_FLOW_ID=${flow.id} in wrangler.jsonc vars.`);

// The update template: what Sika sends for news or a price alert once the 24-hour window has closed.
// Meta reviews new templates (minutes to a day); it may file it as MARKETING, which is priced higher.
const TEMPLATE = "sika_stock_update";
const templates = await call("GET", `${waba}/message_templates?name=${TEMPLATE}&fields=name,status,category`);
if (templates.data.length === 0) {
  const created = await call("POST", `${waba}/message_templates`, {
    name: TEMPLATE,
    language: "en",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "There's a new update on {{1}}: {{2}}. Tap below to see it.",
        example: { body_text: [["MTNGH", "your take-profit level was reached"]] },
      },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Show me" }] },
    ],
  });
  console.log("template submitted for review:", created);
} else {
  console.log("template:", JSON.stringify(templates.data));
}
console.log(`Set WA_UPDATE_TEMPLATE=${TEMPLATE} in wrangler.jsonc vars once it's APPROVED.`);
