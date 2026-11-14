import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { MAX_AUDIO_BYTES, transcribe, TranscriptionUnavailableError } from "@/lib/transcription";

/** Accepts a recorded audio blob and returns its transcript. Audio is not stored. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Recording is too large." }, { status: 413 });

  const contentType = request.headers.get("content-type") ?? "audio/webm";
  if (!contentType.startsWith("audio/")) return NextResponse.json({ error: "Expected an audio recording." }, { status: 415 });

  try {
    const audio = await request.arrayBuffer();
    if (audio.byteLength === 0) return NextResponse.json({ error: "The recording is empty." }, { status: 400 });
    const transcript = await transcribe(audio, contentType.split(";")[0]);
    return NextResponse.json({ transcript });
  } catch (error) {
    if (error instanceof TranscriptionUnavailableError) return NextResponse.json({ error: error.message, code: "not_configured" }, { status: 503 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Transcription failed." }, { status: 502 });
  }
}
