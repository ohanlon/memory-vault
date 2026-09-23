import { useEffect, useRef, useState } from "react";
import { downmixToMono } from "../editor/audioDecode";

interface Props {
  onInsert: (text: string) => void;
  onCancel: () => void;
}

type DialogState =
  | { kind: "idle" }
  | { kind: "recording"; seconds: number }
  | { kind: "transcribing" }
  | { kind: "reviewing"; text: string }
  | { kind: "error"; message: string };

// Local, offline speech-to-text (see electron/voiceTranscription.ts) -
// record here, decode/resample here (Node has no audio decoder of its
// own), then hand the finished PCM off to the main process to run the
// actual model. Not live dictation: there's a short pause between
// stopping and seeing text, since transcription only starts once the full
// recording is available.
export function VoiceNoteDialog({ onInsert, onCancel }: Props) {
  const [state, setState] = useState<DialogState>({ kind: "idle" });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => transcribe();
      mediaRecorderRef.current = recorder;
      recorder.start();
      setState({ kind: "recording", seconds: 0 });
      timerRef.current = setInterval(() => {
        setState((current) => (current.kind === "recording" ? { kind: "recording", seconds: current.seconds + 1 } : current));
      }, 1000);
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error && err.name === "NotAllowedError"
            ? "Microphone access was denied. Allow it and try again."
            : "Couldn't access the microphone.",
      });
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState({ kind: "transcribing" });
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }

  async function transcribe() {
    try {
      const blob = new Blob(chunksRef.current, { type: mediaRecorderRef.current?.mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      // 16kHz to match what the transcription model expects - forcing the
      // AudioContext's own rate makes decodeAudioData resample into it,
      // rather than resampling by hand.
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const samples = downmixToMono(audioBuffer);
      await audioContext.close();

      const text = await window.memoryStack.transcribeAudio(samples);
      if (!text) {
        setState({ kind: "error", message: "Didn't catch any speech in that recording." });
        return;
      }
      setState({ kind: "reviewing", text });
    } catch {
      setState({ kind: "error", message: "Transcription failed." });
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>Voice Note</h3>

        {state.kind === "idle" && (
          <>
            <p className="modal-message">
              Record a voice note and it'll be transcribed locally on this device — no account or internet
              required once the speech model's been downloaded (a one-time download the first time you use
              this).
            </p>
            <div className="modal-actions">
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" onClick={startRecording}>
                Record
              </button>
            </div>
          </>
        )}

        {state.kind === "recording" && (
          <>
            <p className="modal-message" role="status">
              Recording… {state.seconds}s
            </p>
            <div className="modal-actions">
              <button type="button" onClick={stopRecording}>
                Stop
              </button>
            </div>
          </>
        )}

        {state.kind === "transcribing" && (
          <p className="modal-message" role="status">
            Transcribing… the first time may take a while (downloading the speech model).
          </p>
        )}

        {state.kind === "reviewing" && (
          <>
            <textarea
              className="voice-note-review"
              value={state.text}
              onChange={(e) => setState({ kind: "reviewing", text: e.target.value })}
              rows={6}
              autoFocus
            />
            <div className="modal-actions">
              <button type="button" onClick={onCancel}>
                Discard
              </button>
              <button type="button" onClick={() => onInsert(state.text)}>
                Insert
              </button>
            </div>
          </>
        )}

        {state.kind === "error" && (
          <>
            <p className="modal-message">{state.message}</p>
            <div className="modal-actions">
              <button type="button" onClick={onCancel}>
                Close
              </button>
              <button type="button" onClick={() => setState({ kind: "idle" })}>
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
