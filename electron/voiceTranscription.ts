import { env, pipeline } from "@huggingface/transformers";
import type { AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

// Local, offline speech-to-text for voice notes (see VoiceNoteDialog.tsx) -
// deliberately not the browser's SpeechRecognition API, which needs a
// Google-issued key baked into the Chromium build to work at all and
// Electron's Chromium doesn't have one (reliably throws "network"/
// "not-allowed" errors), nor a paid cloud STT API. Runs a small Whisper
// model via @huggingface/transformers (WASM/native ONNX runtime, no GPU or
// account needed) entirely on-device, at the cost of a one-time model
// download (tens of MB) the first time it's used.
const MODEL_ID = "Xenova/whisper-tiny.en";

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

// Loads the pipeline once and reuses it - re-loading the model (which
// involves re-parsing/re-initializing tens of MB of weights) on every
// transcription request would make each voice note pay that cost again.
function getTranscriber(cacheDir: string): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    env.cacheDir = cacheDir;
    transcriberPromise = pipeline("automatic-speech-recognition", MODEL_ID) as Promise<AutomaticSpeechRecognitionPipeline>;
  }
  return transcriberPromise;
}

// `samples` must already be mono PCM at 16kHz (-1..1 range) - the renderer
// is responsible for decoding/resampling whatever MediaRecorder actually
// produced via the Web Audio API before sending it over, since this
// package's own audio loading only understands .wav files/URLs, not
// arbitrary recorded formats, and Node has no built-in audio decoder.
export async function transcribeAudio(samples: Float32Array, cacheDir: string): Promise<string> {
  const transcriber = await getTranscriber(cacheDir);
  const result = await transcriber(samples);
  const output = Array.isArray(result) ? result[0] : result;
  return typeof output?.text === "string" ? output.text.trim() : "";
}
