import "server-only";
import { transcriptionConfig } from "@/lib/env";

/**
 * Server-side transcription provider abstraction. Audio is forwarded to the
 * configured provider and is NOT stored by ORBIT. Currently supported:
 * Deepgram pre-recorded transcription (TRANSCRIPTION_PROVIDER=deepgram).
 */

export class TranscriptionUnavailableError extends Error {
  constructor() {
    super("Voice transcription is not configured. Type your response instead — it works the same way.");
    this.name = "TranscriptionUnavailableError";
  }
}

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export async function transcribe(audio: ArrayBuffer, mimeType: string): Promise<string> {
  const config = transcriptionConfig();
  if (!config) throw new TranscriptionUnavailableError();
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error("Recording is too long. Keep voice notes under about 10 minutes.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true", {
      method: "POST",
      headers: { authorization: `Token ${config.apiKey}`, "content-type": mimeType || "audio/webm" },
      body: audio,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(res.status === 401 ? "The transcription provider rejected ORBIT's credentials." : `Transcription failed (HTTP ${res.status}).`);
    }
    const json = (await res.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    const transcript = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
    if (!transcript) throw new Error("No speech was detected in the recording.");
    return transcript;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Transcription timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
