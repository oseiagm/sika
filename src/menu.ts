import type { ListRow } from "./whatsapp/client";

export type MenuAction =
  | "invest"
  | "portfolio"
  | "price"
  | "news"
  | "holdings"
  | "mandate"
  | "alerts"
  | "profile"
  | "help"
  | "reset"
  | "continue";

interface MenuItem extends ListRow {
  action: MenuAction;
  /** Slash command (a shortcut; WhatsApp shows these when "/" is typed, where supported). */
  command: string;
  commandHint: string;
}

const item = (action: MenuAction, title: string, description: string, commandHint: string, command: string = action): MenuItem => ({
  id: `menu:${action}`,
  title,
  description,
  action,
  command,
  commandHint,
});

/** The menu once setup is done (max 10 rows). */
export const MENU: MenuItem[] = [
  item("invest", "Invest this month", "Get a proposal for your monthly amount", "Get a trade proposal for this month's amount"),
  item("portfolio", "My portfolio", "Value and profit after charges", "See your holdings, profit after charges and break-even prices"),
  item("price", "Check a price", "Live GSE prices and exact charges", "Check a GSE price and the exact charges to trade"),
  item("news", "News & stocks I follow", "Recent news with sources; say follow GCB", "News on your stocks, and the stocks you follow"),
  item("holdings", "Update holdings", "Add what you bought or sold", "Add or correct a holding"),
  item("mandate", "My plan", "See or change your limits", "See or change your investing plan", "plan"),
  item("alerts", "My alerts", "Take-profit and stop-loss prices", "See the prices that trigger your alerts"),
  item("profile", "My investor profile", "See it or retake the 5 questions", "See or retake your investor profile"),
  item("help", "How Sika works", "A quick guide", "How Sika works"),
  item("reset", "Start over", "Delete everything and begin again", "Delete everything Sika knows about you and start over"),
];

/** The menu during setup: keep it short and point back to the step. */
export const SETUP_MENU: MenuItem[] = [
  item("continue", "Continue setup", "Pick up where you left off", "Continue setup"),
  item("help", "How Sika works", "A quick guide", "How Sika works"),
  item("reset", "Start over", "Delete everything and begin again", "Delete everything and start over"),
];

/** Stored as the assistant's message when the menu is sent, so a bare number reply can be read as a choice. */
export const MENU_MARKER = "[menu]";

export const COMMANDS = [
  { command_name: "menu", command_description: "Show everything Sika can do" },
  ...MENU.map((m) => ({ command_name: m.command, command_description: m.commandHint })),
  { command_name: "follow", command_description: "Follow a stock for news, e.g. /follow GCB" },
];

export const ICE_BREAKERS = ["Get started", "Show my portfolio", "Invest this month's money", "What is MTN trading at?"];

/** A menu tap, "menu"/"home", a slash shortcut, or a number right after the menu → what to do. */
export function menuAction(input: { text?: string; buttonId?: string }, menuJustShown: boolean, ready: boolean): MenuAction | "menu" | null {
  const items = ready ? MENU : SETUP_MENU;
  if (input.buttonId?.startsWith("menu:")) return [...MENU, ...SETUP_MENU].find((m) => m.id === input.buttonId)?.action ?? null;
  const text = input.text?.trim().toLowerCase().replace(/[.!]+$/, "") ?? "";
  if (["menu", "/menu", "home", "options", "help me", "main menu"].includes(text)) return "menu";
  if (text === "/mandate") return "mandate";
  if (text.startsWith("/")) return [...MENU, ...SETUP_MENU].find((m) => `/${m.command}` === text)?.action ?? null;
  if (menuJustShown && /^\d{1,2}$/.test(text)) return items[Number(text) - 1]?.action ?? null;
  return null;
}
