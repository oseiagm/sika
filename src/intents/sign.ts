export interface SignedFields {
  id: string;
  waId: string;
  side: string;
  symbol: string;
  shares: bigint;
  price: bigint;
  net: bigint;
  expiresAt: string;
}

function canonical(f: SignedFields): string {
  return [f.id, f.waId, f.side, f.symbol, f.shares, f.price, f.net, f.expiresAt].join("|");
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Signs exactly what the investor saw, so nothing can change the order between Approve and execution. */
export async function sign(f: SignedFields, secret: string): Promise<string> {
  return hex(await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(canonical(f))));
}

export async function verify(f: SignedFields, signature: string, secret: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const bytes = new Uint8Array(signature.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", await key(secret), bytes, new TextEncoder().encode(canonical(f)));
}

/** Stable JSON: object keys sorted, so the same content always gives the same text. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Short fingerprint of a draft (plan or holdings), put in its Confirm button's id so a tap confirms
 * exactly what that card showed, never a draft that changed after it was sent.
 */
export async function fingerprint(value: unknown): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(value)))).slice(0, 12);
}
