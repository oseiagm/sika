/** One inbound message, reduced to what Sika uses. */
export interface Inbound {
  id: string;
  from: string;
  name?: string;
  timestamp: number;
  kind: "text" | "button" | "audio" | "form" | "other";
  text?: string;
  buttonId?: string;
  mediaId?: string;
  /** Answers from a WhatsApp Flow form. */
  form?: Record<string, string>;
}

/** Checks Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the app secret). */
export async function verifySignature(rawBody: ArrayBuffer, header: string | undefined, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const given = hexToBytes(header.slice("sha256=".length));
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i]! ^ given[i]!;
  return diff === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseInbound(payload: any): Inbound[] {
  const out: Inbound[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const names = new Map<string, string>((value?.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
      for (const m of value?.messages ?? []) {
        const base = { id: m.id, from: m.from, name: names.get(m.from), timestamp: Number(m.timestamp) };
        if (m.type === "text") out.push({ ...base, kind: "text", text: m.text?.body ?? "" });
        else if (m.type === "interactive" && m.interactive?.type === "button_reply")
          out.push({ ...base, kind: "button", buttonId: m.interactive.button_reply.id, text: m.interactive.button_reply.title });
        else if (m.type === "interactive" && m.interactive?.type === "list_reply")
          out.push({ ...base, kind: "button", buttonId: m.interactive.list_reply.id, text: m.interactive.list_reply.title });
        else if (m.type === "interactive" && m.interactive?.type === "nfm_reply") {
          let form: Record<string, string> = {};
          try {
            form = JSON.parse(m.interactive.nfm_reply?.response_json ?? "{}");
          } catch {
            // left empty; the handler says it couldn't save
          }
          out.push({ ...base, kind: "form", form });
        } else if (m.type === "button") out.push({ ...base, kind: "button", buttonId: m.button?.payload, text: m.button?.text });
        else if (m.type === "audio") out.push({ ...base, kind: "audio", mediaId: m.audio?.id });
        else out.push({ ...base, kind: "other" });
      }
    }
  }
  return out;
}
