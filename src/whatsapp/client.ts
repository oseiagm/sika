const GRAPH = "https://graph.facebook.com/v23.0";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
}

async function send(config: WhatsAppConfig, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${GRAPH}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: HTTP ${res.status} ${await res.text()}`);
}

export function sendText(config: WhatsAppConfig, to: string, body: string): Promise<void> {
  return send(config, { to, type: "text", text: { body, preview_url: false } });
}

/** Up to 3 reply buttons; ids come back in the webhook as interactive.button_reply.id. */
export function sendButtons(
  config: WhatsAppConfig,
  to: string,
  body: string,
  buttons: { id: string; title: string }[],
): Promise<void> {
  return send(config, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
    },
  });
}

/** Marks the message read and shows the typing indicator while the agent works. */
export function markReadTyping(config: WhatsAppConfig, messageId: string): Promise<void> {
  return send(config, { status: "read", message_id: messageId, typing_indicator: { type: "text" } });
}

/** Fetches media a user sent (e.g. a voice note): look up its URL, then download with the same token. */
export async function downloadMedia(config: WhatsAppConfig, mediaId: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const auth = { authorization: `Bearer ${config.accessToken}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth });
  if (!meta.ok) throw new Error(`Media lookup failed: HTTP ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: auth });
  if (!file.ok) throw new Error(`Media download failed: HTTP ${file.status}`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: mime_type };
}

export interface ListRow {
  id: string;
  /** Max 24 characters. */
  title: string;
  /** Max 72 characters. */
  description?: string;
}

/** A message with one button that opens a list of up to 10 rows; the tapped row comes back as interactive.list_reply. */
export function sendList(config: WhatsAppConfig, to: string, body: string, button: string, rows: ListRow[]): Promise<void> {
  return send(config, {
    to,
    type: "interactive",
    interactive: { type: "list", body: { text: body }, action: { button, sections: [{ title: "Sika", rows }] } },
  });
}

/**
 * Opens a WhatsApp Flow (a native form). Unpublished flows are sent in draft mode, which works for
 * the test number. The answers come back as interactive.nfm_reply.
 */
export function sendFlow(
  config: WhatsAppConfig,
  to: string,
  flow: { id: string; published: boolean },
  body: string,
  cta: string,
  screen: string,
  data: Record<string, unknown>,
): Promise<void> {
  return send(config, {
    to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: body },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: crypto.randomUUID(),
          flow_id: flow.id,
          flow_cta: cta,
          mode: flow.published ? "published" : "draft",
          flow_action: "navigate",
          flow_action_payload: { screen, data },
        },
      },
    },
  });
}

/** An image by public URL, with an optional caption. */
export function sendImage(config: WhatsAppConfig, to: string, link: string, caption?: string): Promise<void> {
  return send(config, { to, type: "image", image: { link, ...(caption ? { caption } : {}) } });
}
