const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

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
