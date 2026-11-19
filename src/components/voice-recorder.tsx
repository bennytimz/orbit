"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Square, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type State = "idle" | "recording" | "recorded" | "transcribing";

const noopSubscribe = () => () => {};
const recordingSupported = () => typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
const serverSnapshot = () => false;

/**
 * MediaRecorder-based voice capture: record, stop, play back, delete, and
 * transcribe. Audio stays in the browser until the user chooses to transcribe;
 * it is then sent to the configured transcription provider and not stored.
 */
export function VoiceRecorder({ available, onTranscript }: { available: boolean; onTranscript: (text: string) => void }) {
  const [state, setState] = useState<State>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const blob = useRef<Blob | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  // Read browser support after hydration: the server snapshot matches the server-rendered HTML.
  const supported = useSyncExternalStore(noopSubscribe, recordingSupported, serverSnapshot);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        blob.current = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setUrl(URL.createObjectURL(blob.current));
        setState("recorded");
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => (s >= 600 ? s : s + 1)), 1000);
      setState("recording");
    } catch {
      toast.error("Microphone access was denied or is unavailable. You can type your response instead.");
    }
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    recorder.current?.stop();
  };

  const discard = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    blob.current = null;
    setState("idle");
  };

  const transcribe = async () => {
    if (!blob.current) return;
    setState("transcribing");
    try {
      const res = await fetch("/api/transcription", { method: "POST", headers: { "content-type": blob.current.type || "audio/webm" }, body: blob.current });
      const json = (await res.json()) as { transcript?: string; error?: string };
      if (!res.ok || !json.transcript) throw new Error(json.error ?? "Transcription failed.");
      onTranscript(json.transcript);
      discard();
      toast.success("Transcribed. Review and edit the text before saving.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed.");
      setState("recorded");
    }
  };

  if (!supported) return <p className="text-xs text-muted-foreground">Voice recording isn&apos;t supported in this browser. Type your response instead.</p>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {state === "idle" ? (
          <Button type="button" variant="outline" size="sm" onClick={start}>
            <Mic /> Record
          </Button>
        ) : null}
        {state === "recording" ? (
          <Button type="button" variant="destructive" size="sm" onClick={stop}>
            <Square /> Stop · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </Button>
        ) : null}
        {(state === "recorded" || state === "transcribing") && url ? (
          <>
            <audio src={url} controls className="h-8 max-w-full" />
            <Button type="button" size="sm" onClick={transcribe} disabled={!available || state === "transcribing"}>
              {state === "transcribing" ? <Loader2 className="animate-spin" /> : <Wand2 />} Transcribe
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete recording" onClick={discard} disabled={state === "transcribing"}>
              <Trash2 />
            </Button>
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {available
          ? "Recordings stay in your browser until you choose Transcribe; the audio is then sent to the transcription provider and is not stored by ORBIT."
          : "Transcription is not configured on this server, so recordings can be played back but not transcribed. Type your response instead."}
      </p>
    </div>
  );
}
