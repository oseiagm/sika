/** Scenes for the "first step" postcard, by goal. Anything else gets the growing-tree scene. */
const SCENES: [RegExp, string][] = [
  [/house|home|land|build/i, "a young family standing in front of a modest modern house in an Accra neighbourhood at golden hour"],
  [/retire/i, "a smiling older couple relaxing on a breezy veranda near the Cape Coast shoreline"],
  [/educat|school|universit|fees|children|kids|daughter|son/i, "a proud graduate in cap and gown with family on a Ghanaian university campus"],
  [/business|shop|trade/i, "a young entrepreneur opening the doors of her own shop on a lively Kumasi street"],
  [/car|vehicle/i, "a happy driver beside a new car on a palm-lined road in Ghana"],
  [/wedding|marri/i, "a joyful couple in matching kente at their wedding celebration"],
];
const GROW = "a young cocoa tree sapling growing strong in rich red soil under a golden West African sunrise";

/** A short, card-friendly version of the goal ("Buy a house in 5 years" → "a house"). */
export function goalLabel(goal: string): string {
  const g = goal.trim().replace(/\.$/, "");
  if (/house|home/i.test(g)) return "a house";
  if (/retire/i.test(g)) return "retirement";
  if (/educat|school|universit|fees/i.test(g)) return "their education";
  if (/business/i.test(g)) return "the business";
  if (/grow|saving/i.test(g)) return "growing your savings";
  return g.length <= 28 ? g.charAt(0).toLowerCase() + g.slice(1) : "your goal";
}

/**
 * Muse Image postcard for an investor's first trade. The exact figures are in the prompt as text to
 * render; the receipt message always carries them too, so the card is a keepsake, not the record.
 */
export async function firstStepCard(apiKey: string, goal: string, line: string): Promise<string | null> {
  const scene = SCENES.find(([re]) => re.test(goal))?.[1] ?? GROW;
  const res = await fetch("https://api.meta.ai/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "muse-image-1.0",
      n: 1,
      size: "1024x1024",
      response_format: "url",
      output_format: "jpeg",
      prompt:
        `A warm, optimistic illustrated postcard in a modern Ghanaian graphic style. Scene: ${scene}. ` +
        `At the top, large clean headline text: "First step to ${goalLabel(goal)}". Below it, a smaller line: "${line}". ` +
        "No other text, no logos, no watermarks.",
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { url?: string }[] };
  return body.data?.[0]?.url ?? null;
}
