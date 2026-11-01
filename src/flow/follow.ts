import type { Quote } from "../market/quotes";

/** "follow GCB", "/follow gcb", "unfollow MTN" → the action and the stock, or null. */
export function followCommand(text: string, quotes: Map<string, Quote>): { on: boolean; symbol: string | null } | null {
  const m = /^\/?(un)?follow(?:\s+([A-Za-z.]{2,12}))?\s*[.!]?$/i.exec(text.trim());
  if (!m) return null;
  if (!m[2]) return { on: !m[1], symbol: null };
  const word = m[2].replace(/\.+$/, "").toUpperCase();
  const symbol = quotes.has(word) ? word : ([...quotes.values()].find((q) => q.symbol.startsWith(word) || q.name.toUpperCase().split(/\s+/)[0] === word)?.symbol ?? null);
  return { on: !m[1], symbol };
}
