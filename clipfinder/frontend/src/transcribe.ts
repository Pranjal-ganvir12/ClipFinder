/**
 * In-browser video processing using Transformers.js (@huggingface/transformers).
 *
 * Why the backend no longer runs ML
 * ---------------------------------
 * The free Render tier (512MB RAM) OOM-crashed while importing
 * sentence-transformers / PyTorch to embed segment text, and faster-whisper
 * before that. The restart wiped state. We therefore run BOTH models in the
 * browser:
 *   - Whisper (`Xenova/whisper-tiny.en`) for transcription.
 *   - MiniLM (`Xenova/all-MiniLM-L6-v2`) for 384-dim sentence embeddings.
 * The backend only stores the vectors and runs LanceDB similarity search.
 *
 * Threading: ALL inference runs in a WEB WORKER
 * ---------------------------------------------
 * Running a model on the main thread froze the tab ("Page Unresponsive") and
 * left progress stuck at 0% because React could never repaint. The split is:
 *   - main thread: decode the file's audio to 16kHz mono (requires
 *     `AudioContext`/`decodeAudioData`, which workers do not have).
 *   - worker: Whisper inference AND MiniLM embedding — the long CPU-bound work.
 *     Progress is streamed back by postMessage so the UI stays interactive.
 * A single shared worker is reused for transcription, ingest-embedding and
 * query-embedding, so both models stay warm after first use. If a worker
 * cannot be constructed we fall back to main-thread inference so the app still
 * works, just without the responsiveness benefit.
 */

import {
  runTranscription,
  runEmbeddings,
  runQueryEmbedding,
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

// --- Shared worker ----------------------------------------------------------

/**
 * A single long-lived worker is reused across transcription, ingest-embedding
 * and query-embedding so both models are loaded once and stay warm. We do NOT
 * terminate it between jobs. `null` means worker construction failed and the
 * caller should fall back to the main thread.
 */
let sharedWorker: Worker | null = null;
let workerUnavailable = false;

function getWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (sharedWorker) return sharedWorker;
  try {
    sharedWorker = new Worker(new URL("./transcribe.worker.ts", import.meta.url), {
      type: "module",
    });
    return sharedWorker;
  } catch {
    workerUnavailable = true;
    sharedWorker = null;
    return null;
  }
}

/**
 * Run one request against the shared worker, routing progress to `onProgress`
 * and resolving when the matching terminal message arrives. If the worker
 * errors it is torn down so a later call can rebuild it (or fall back).
 */
function runWorkerJob<T>(
  request: WorkerRequest,
  resultType: WorkerResponse["type"],
  extract: (msg: WorkerResponse) => T,
  onProgress?: ProgressCallback,
  transfer?: Transferable[]
): Promise<T> {
  const worker = getWorker();
  if (!worker) return Promise.reject(new Error("worker unavailable"));

  return new Promise<T>((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") {
        onProgress?.(msg.payload);
      } else if (msg.type === resultType) {
        cleanup();
        resolve(extract(msg));
      } else if (msg.type === "error") {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      // A hard worker error poisons the shared instance; rebuild next time.
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
      sharedWorker = null;
      reject(new Error(event.message || "Worker failed"));
    };
    const cleanup = () => {
      worker.removeEventListener("message", onMessage as EventListener);
      worker.removeEventListener("error", onError as EventListener);
    };

    worker.addEventListener("message", onMessage as EventListener);
    worker.addEventListener("error", onError as EventListener);

    if (transfer && transfer.length) {
      worker.postMessage(request, transfer);
    } else {
      worker.postMessage(request);
    }
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

  // 2. Run inference in the shared worker so the UI stays responsive.
  if (getWorker()) {
    const pacer = createProgressPacer(duration, (p) => onProgress?.(p));
    try {
      const segments = await runWorkerJob<TranscriptSegment[]>(
        { type: "transcribe", audio, duration },
        "result",
        (msg) => (msg.type === "result" ? msg.segments : []),
        (p) => {
          if (p.phase === "transcribe") {
            pacer.start();
            pacer.override(p.progress);
          } else {
            onProgress?.(p);
          }
        },
        [audio.buffer]
      );
      onProgress?.({ phase: "transcribe", progress: 100, message: "Transcribing 100%" });
      return { segments, duration };
    } catch {
      // fall through to main-thread fallback below
    } finally {
      pacer.stop();
    }
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

/**
 * Embed segment texts into 384-dim normalized vectors in the worker (MiniLM).
 * Falls back to the main thread if the worker is unavailable. Returns one
 * vector per input text, in order.
 */
export async function embedSegments(
  texts: string[],
  onProgress?: ProgressCallback
): Promise<number[][]> {
  if (getWorker()) {
    try {
      return await runWorkerJob<number[][]>(
        { type: "embed", texts },
        "vectors",
        (msg) => (msg.type === "vectors" ? msg.vectors : []),
        onProgress
      );
    } catch {
      // fall through to main thread
    }
  }
  return runEmbeddings(texts, onProgress);
}

/**
 * Embed a single search query into a 384-dim normalized vector in the worker.
 * Falls back to the main thread if the worker is unavailable.
 */
export async function embedQuery(
  text: string,
  onProgress?: ProgressCallback
): Promise<number[]> {
  if (getWorker()) {
    try {
      return await runWorkerJob<number[]>(
        { type: "embed-query", text },
        "query-vector",
        (msg) => (msg.type === "query-vector" ? msg.vector : []),
        onProgress
      );
    } catch {
      // fall through to main thread
    }
  }
  return runQueryEmbedding(text, onProgress);
}
