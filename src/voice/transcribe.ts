/** GSE names the recogniser should favour. */
const KEYWORDS = ["MTN", "MTNGH", "GCB", "Ecobank", "Stanbic", "CalBank", "Enterprise", "Fan Milk", "Total", "GOIL", "cedis", "pesewas", "GSE"];

/** Muse Voice Transcribe: WAV in, transcript out. */
export async function transcribe(apiKey: string, wav: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append(
    "request",
    new Blob([JSON.stringify({ model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK", keywords: KEYWORDS })], {
      type: "application/json",
    }),
  );
  form.append("audio", new Blob([wav], { type: "audio/wav" }), "voice.wav");
  const res = await fetch("https://api.meta.ai/v1/asr/transcribe", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcribe failed: HTTP ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { transcript?: string };
  return body.transcript?.trim() ?? "";
}
