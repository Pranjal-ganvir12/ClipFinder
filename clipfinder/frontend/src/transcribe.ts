/**
 * In-browser video transcription using Transformers.js (@huggingface/transformers).
 *
 * Why the backend no longer transcribes
 * --------------------------------------
 * The free Render tier (512MB RAM, ephemeral disk) crashes while running
 * faster-whisper, and the restart wipes the SQLite DB. We therefore run
 * Whisper (`Xenova/whisper-tiny.en`) entirely in the browser and only POST
 * small text segments to the backend.
 *
 * Threading: inference runs in a WEB WORKER
 * -----------------------------------------
 * Running the model on the main thread froze the tab ("Page Unresponsive" in
 * Chrome) and left the progress bar stuck at 0% because React could never
 * repaint. The split is:
 *   - main thread: decode the file's audio to 16kHz mono (requires
 *     `AudioContext`/`decodeAudioData`, which workers do not have). This is
 *     comparatively fast.
 *   - worker: Whisper inference, the long CPU-bound part. Progress is streamed
 *     back by postMessage so the UI stays interactive and repaints.
 * If the worker cannot be constructed we fall back to main-thread inference so
 * transcription still works, just without the responsiveness benefit.
 */

import {
  runTranscription,
  TARGET_SAMPLE_RATE,
  type ProgressCallback,
  type TranscribeProgress,
  type TranscriptSegment,
} from "./asr";
import type { WorkerRequest, WorkerResponse } from "./transcribe.worker";

export type { TranscriptSegment, TranscribeProgress, ProgressCallback };

// --- Audio decoding (main thread only) --------------------------------------

/**
 * Decode a video/audio File into a 16kHz mono Float32Array.
 *
 * `decodeAudioData` reads the audio track out of mp4/webm/mov containers in
 * modern browsers, so a VIDEO file can be fed in directly. We then downmix to
 * mono and resample to 16kHz (Whisper's expected input rate) via an offline
 * render.
 */
async function decodeAudio(
  file: File
): Promise<{ audio: Float32Array; duration: number }> {
  const arrayBuffer = await file.arrayBuffer();

  const AudioCtx: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const decodeCtx = new AudioCtx();

  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch {
    throw new Error(
      "Could not read audio from this file. Make sure the video has an audio track."
    );
  } finally {
    void decodeCtx.close();
  }

  const duration = decoded.duration;

  const frameCount = Math.max(1, Math.ceil(duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  // OfflineAudioContext(1, …) already downmixed to mono.
  const audio = rendered.getChannelData(0);
  return { audio: new Float32Array(audio), duration };
}

// --- Progress estimator -----------------------------------------------------

/**
 * Whisper's `chunk_callback` only fires once per 30s audio chunk, so a short
 * clip can show 0% for the entire run. This advances a best-effort estimate on
 * a timer; any real callback immediately overrides it. Capped below 100% so we
 * never claim completion early.
 */
function createProgressPacer(
  duration: number,
  emit: (p: TranscribeProgress) => void
): { start: () => void; override: (pct: number) => void; stop: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  let shown = 0;
  const startedAt = Date.now();

  // whisper-tiny on WASM runs roughly faster than realtime; assume ~1.5x the
  // media duration as a pessimistic completion estimate, floored at 10s.
  const estimatedMs = Math.max(10000, duration * 1500);

  const tick = () => {
    const elapsed = Date.now() - startedAt;
    const est = Math.round((elapsed / estimatedMs) * 100);
    // Ease off as it approaches the cap so it doesn't stall at a round number.
    const next = Math.min(95, est);
    if (next > shown) {
      shown = next;
      emit({ phase: "transcribe", progress: shown, message: `Transcribing ${shown}%` });
    }
  };

  return {
    start: () => {
      if (!timer) timer = setInterval(tick, 500);
    },
    override: (pct: number) => {
      if (pct > shown) {
        shown = pct;
        emit({ phase: "transcribe", progress: shown, message: `Transcribing ${shown}%` });
      }
    },
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

// --- Worker orchestration ---------------------------------------------------

function createWorker(): Worker | null {
  try {
    return new Worker(new URL("./transcribe.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }
}

function transcribeInWorker(
  worker: Worker,
  audio: Float32Array,
  duration: number,
  onProgress?: ProgressCallback
): Promise<TranscriptSegment[]> {
  return new Promise<TranscriptSegment[]>((resolve, reject) => {
    const pacer = createProgressPacer(duration, (p) => onProgress?.(p));

    const cleanup = () => {
      pacer.stop();
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        if (msg.payload.phase === "transcribe") {
          // Real chunk progress wins over the estimate; begin pacing once
          // inference has actually started.
          pacer.start();
          pacer.override(msg.payload.progress);
        } else {
          onProgress?.(msg.payload);
        }
      } else if (msg.type === "result") {
        cleanup();
        onProgress?.({ phase: "transcribe", progress: 100, message: "Transcribing 100%" });
        resolve(msg.segments);
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Transcription worker failed"));
    };

    const request: WorkerRequest = { type: "transcribe", audio, duration };
    // Transfer the audio buffer so it is moved, not copied.
    worker.postMessage(request, [audio.buffer]);
  });
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
  // 1. Decode audio on the main thread (workers have no AudioContext).
  onProgress?.({ phase: "audio", progress: 0, message: "Reading audio…" });
  const { audio, duration } = await decodeAudio(file);
  onProgress?.({ phase: "audio", progress: 100, message: "Audio ready" });

  // 2. Run inference in a worker so the UI stays responsive.
  const worker = createWorker();
  if (worker) {
    const segments = await transcribeInWorker(worker, audio, duration, onProgress);
    return { segments, duration };
  }

  // Fallback: no worker available — run on the main thread. The tab will be
  // unresponsive during inference, but transcription still succeeds.
  const pacer = createProgressPacer(duration, (p) => onProgress?.(p));
  pacer.start();
  try {
    const segments = await runTranscription(audio, duration, (p) => {
      if (p.phase === "transcribe") pacer.override(p.progress);
      else onProgress?.(p);
    });
    return { segments, duration };
  } finally {
    pacer.stop();
  }
}
