/**
 * In-browser audio transcription using Transformers.js (@huggingface/transformers).
 *
 * Why the backend no longer transcribes
 * --------------------------------------
 * The free Render tier (512MB RAM, ephemeral disk) crashes while running
 * faster-whisper, and the restart wipes the SQLite DB. We therefore run
 * Whisper (`Xenova/whisper-tiny.en`) entirely in the browser and only POST
 * small text segments to the backend.
 *
 * Threading choice: MAIN THREAD (documented)
 * ------------------------------------------
 * Transformers.js supports Web Workers, but wiring a worker through Vite's
 * bundler (model asset URLs, WASM backends, cross-origin isolation for
 * SharedArrayBuffer) adds real build fragility. The whisper-tiny.en model is
 * small and runs via WASM, and the heavy work happens inside the pipeline's
 * own async loop, so we run on the main thread and keep the UI responsive by:
 *   - streaming genuine progress through the `onProgress` callback (model
 *     download % and transcription %), driven by Transformers.js callbacks;
 *   - yielding to the event loop between phases.
 * If this ever needs to move off the main thread, `transcribeFile` is a pure
 * function of `File` and can be dropped into a worker without API changes.
 */

import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

// Pull models from the Hugging Face Hub (CDN), never from a local /models path.
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "Xenova/whisper-tiny.en";
const TARGET_SAMPLE_RATE = 16000;

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export type TranscribePhase = "model" | "audio" | "transcribe";

export interface TranscribeProgress {
  phase: TranscribePhase;
  /** 0-100, best-effort. */
  progress: number;
  message: string;
}

export type ProgressCallback = (p: TranscribeProgress) => void;

// --- Model singleton (cached across calls) ---------------------------------

let asrPipelinePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/**
 * Lazily load (and cache) the ASR pipeline. The first call downloads the model
 * weights; subsequent calls resolve instantly from the in-memory singleton.
 */
async function getPipeline(
  onProgress?: ProgressCallback
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asrPipelinePromise) {
    onProgress?.({ phase: "model", progress: 100, message: "AI model ready" });
    return asrPipelinePromise;
  }

  asrPipelinePromise = pipeline("automatic-speech-recognition", MODEL_ID, {
    // Transformers.js reports per-file download progress here.
    progress_callback: (data: unknown) => {
      if (!onProgress) return;
      const d = data as {
        status?: string;
        progress?: number;
        file?: string;
      };
      if (d.status === "progress" && typeof d.progress === "number") {
        onProgress({
          phase: "model",
          progress: Math.max(0, Math.min(100, Math.round(d.progress))),
          message: `Loading AI model ${Math.round(d.progress)}%`,
        });
      } else if (d.status === "ready" || d.status === "done") {
        onProgress({ phase: "model", progress: 100, message: "AI model ready" });
      } else {
        onProgress({ phase: "model", progress: 0, message: "Loading AI model…" });
      }
    },
  }) as Promise<AutomaticSpeechRecognitionPipeline>;

  try {
    return await asrPipelinePromise;
  } catch (err) {
    // Allow a later retry to re-attempt the download.
    asrPipelinePromise = null;
    throw err;
  }
}

// --- Audio decoding ---------------------------------------------------------

/**
 * Decode a video/audio File into a 16kHz mono Float32Array.
 *
 * `decodeAudioData` reads the audio track out of mp4/webm/mov containers in
 * modern browsers, so we can feed a VIDEO file directly. We then downmix to
 * mono and resample to 16kHz via an OfflineAudioContext (whisper's expected
 * input rate).
 */
async function decodeAudio(file: File): Promise<{ audio: Float32Array; duration: number }> {
  const arrayBuffer = await file.arrayBuffer();

  // A short-lived AudioContext is only used to decode the compressed audio.
  const AudioCtx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();

  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    // Release the hardware context promptly.
    void decodeCtx.close();
  }

  const duration = decoded.duration;

  // Resample + downmix to 16kHz mono using an offline render.
  const frameCount = Math.max(1, Math.ceil(duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  // Mono channel (OfflineAudioContext(1, …) already downmixed).
  const audio = rendered.getChannelData(0);
  // Return a copy decoupled from the AudioBuffer's backing store.
  return { audio: new Float32Array(audio), duration };
}

// --- Public API --------------------------------------------------------------

/**
 * Transcribe a video File entirely in the browser.
 * Returns timestamped segments plus the detected media duration (seconds).
 */
export async function transcribeFile(
  file: File,
  onProgress?: ProgressCallback
): Promise<{ segments: TranscriptSegment[]; duration: number }> {
  // 1. Load the model (cached across calls).
  const transcriber = await getPipeline(onProgress);

  // 2. Decode audio to 16kHz mono.
  onProgress?.({ phase: "audio", progress: 0, message: "Reading audio…" });
  const { audio, duration } = await decodeAudio(file);
  onProgress?.({ phase: "audio", progress: 100, message: "Audio ready" });

  // 3. Transcribe with chunking suitable for long audio.
  onProgress?.({ phase: "transcribe", progress: 0, message: "Transcribing 0%" });

  const output = (await transcriber(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    // Streamed chunk-level progress → map onto 0-100 by audio position.
    chunk_callback: (chunk: unknown) => {
      if (!onProgress) return;
      const c = chunk as { offset?: number; tstamps?: [number, number] };
      let frac = 0;
      if (duration > 0 && typeof c.offset === "number") {
        frac = c.offset / duration;
      } else if (duration > 0 && c.tstamps && typeof c.tstamps[1] === "number") {
        frac = c.tstamps[1] / duration;
      }
      const pct = Math.max(0, Math.min(99, Math.round(frac * 100)));
      onProgress({ phase: "transcribe", progress: pct, message: `Transcribing ${pct}%` });
    },
  } as Record<string, unknown>)) as {
    text?: string;
    chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] }>;
  };

  onProgress?.({ phase: "transcribe", progress: 100, message: "Transcribing 100%" });

  const segments = buildSegments(output, duration);
  return { segments, duration };
}

/**
 * Convert the pipeline output into clean segments with sane timestamp
 * fallbacks. Whisper can emit `null` timestamps (especially the final chunk's
 * end); we fill those from neighbours or the media duration.
 */
function buildSegments(
  output: {
    text?: string;
    chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] }>;
  },
  duration: number
): TranscriptSegment[] {
  const chunks = output.chunks ?? [];

  if (chunks.length === 0) {
    // No per-chunk timestamps — fall back to one segment spanning the media.
    const text = (output.text ?? "").trim();
    if (!text) return [];
    return [{ text, start: 0, end: duration > 0 ? duration : 0 }];
  }

  const segments: TranscriptSegment[] = [];
  let prevEnd = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const text = (chunk.text ?? "").trim();
    if (!text) continue;

    const ts = chunk.timestamp ?? [null, null];
    let start = typeof ts[0] === "number" && !Number.isNaN(ts[0]) ? ts[0] : prevEnd;

    let end: number;
    if (typeof ts[1] === "number" && !Number.isNaN(ts[1])) {
      end = ts[1];
    } else {
      // Borrow the next chunk's start, else the media duration, else +2s.
      const nextStart = chunks[i + 1]?.timestamp?.[0];
      if (typeof nextStart === "number" && !Number.isNaN(nextStart)) {
        end = nextStart;
      } else if (duration > 0) {
        end = duration;
      } else {
        end = start + 2;
      }
    }

    if (end < start) end = start;
    if (start < 0) start = 0;

    segments.push({ text, start, end });
    prevEnd = end;
  }

  return segments;
}
