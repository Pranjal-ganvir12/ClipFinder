/**
 * Whisper inference, shared by the Web Worker and the main-thread fallback.
 *
 * This module contains NO DOM/AudioContext usage so it is safe to import
 * inside a worker. Audio decoding lives in `transcribe.ts` because
 * `AudioContext`/`decodeAudioData` are only available on the main thread.
 */

import {
  pipeline,
  env,
  type AutomaticSpeechRecognitionPipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

// Pull models from the Hugging Face CDN, never a local /models path.
env.allowLocalModels = false;
env.useBrowserCache = true;

export const MODEL_ID = "Xenova/whisper-tiny.en";
/**
 * Sentence-embedding model. Produces 384-dim normalized vectors, matching the
 * LanceDB schema used by the backend. The backend loads NO ML model anymore —
 * all embeddings are computed here in the browser.
 */
export const EMBED_MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIM = 384;
export const TARGET_SAMPLE_RATE = 16000;

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export type TranscribePhase = "model" | "audio" | "transcribe" | "embed";

export interface TranscribeProgress {
  phase: TranscribePhase;
  /** 0-100, best-effort. */
  progress: number;
  message: string;
}

export type ProgressCallback = (p: TranscribeProgress) => void;

// --- Model singleton (cached across calls within one thread) ----------------

let asrPipelinePromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/**
 * Lazily load (and cache) the ASR pipeline. The first call downloads the model
 * weights (~40MB, cached by the browser); later calls resolve instantly.
 */
export async function getPipeline(
  onProgress?: ProgressCallback
): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asrPipelinePromise) {
    onProgress?.({ phase: "model", progress: 100, message: "AI model ready" });
    return asrPipelinePromise;
  }

  asrPipelinePromise = pipeline("automatic-speech-recognition", MODEL_ID, {
    progress_callback: (data: unknown) => {
      if (!onProgress) return;
      const d = data as { status?: string; progress?: number };
      if (d.status === "progress" && typeof d.progress === "number") {
        const pct = Math.max(0, Math.min(100, Math.round(d.progress)));
        onProgress({
          phase: "model",
          progress: pct,
          message: `Loading AI model ${pct}%`,
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

// --- Embedding model singleton ----------------------------------------------

let embedPipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Lazily load (and cache) the feature-extraction pipeline. First call downloads
 * the model (~25MB, cached by the browser); later calls resolve instantly. The
 * same instance is reused for ingest AND search, so after an upload the model
 * is already warm when the user searches.
 */
export async function getEmbedPipeline(
  onProgress?: ProgressCallback
): Promise<FeatureExtractionPipeline> {
  if (embedPipelinePromise) {
    onProgress?.({ phase: "model", progress: 100, message: "Search model ready" });
    return embedPipelinePromise;
  }

  embedPipelinePromise = pipeline("feature-extraction", EMBED_MODEL_ID, {
    progress_callback: (data: unknown) => {
      if (!onProgress) return;
      const d = data as { status?: string; progress?: number };
      if (d.status === "progress" && typeof d.progress === "number") {
        const pct = Math.max(0, Math.min(100, Math.round(d.progress)));
        onProgress({
          phase: "model",
          progress: pct,
          message: `Loading search model ${pct}%`,
        });
      } else if (d.status === "ready" || d.status === "done") {
        onProgress({ phase: "model", progress: 100, message: "Search model ready" });
      } else {
        onProgress({ phase: "model", progress: 0, message: "Loading search model…" });
      }
    },
  }) as Promise<FeatureExtractionPipeline>;

  try {
    return await embedPipelinePromise;
  } catch (err) {
    // Allow a later retry to re-attempt the download.
    embedPipelinePromise = null;
    throw err;
  }
}

/**
 * Embed a single text into a 384-element normalized number array using mean
 * pooling. Throws if the output is not exactly `EMBED_DIM` numbers so a bad
 * vector is never sent to the backend.
 */
export async function embedText(
  extractor: FeatureExtractionPipeline,
  text: string
): Promise<number[]> {
  const output = await extractor(text, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data as Iterable<number>, (v) => Number(v));
  if (vector.length !== EMBED_DIM || vector.some((v) => !Number.isFinite(v))) {
    throw new Error(
      `Embedding produced ${vector.length} values (expected ${EMBED_DIM}).`
    );
  }
  return vector;
}

/**
 * Embed many texts, looping one at a time (all-MiniLM is cheap per-call and a
 * loop keeps peak memory low). Reports best-effort progress via the "embed"
 * phase. Returns one 384-dim vector per input, in order.
 */
export async function runEmbeddings(
  texts: string[],
  onProgress?: ProgressCallback
): Promise<number[][]> {
  const extractor = await getEmbedPipeline(onProgress);

  const vectors: number[][] = [];
  const total = texts.length;
  onProgress?.({ phase: "embed", progress: 0, message: "Indexing 0%" });

  for (let i = 0; i < total; i++) {
    vectors.push(await embedText(extractor, texts[i]));
    const pct = total > 0 ? Math.min(99, Math.round(((i + 1) / total) * 100)) : 100;
    onProgress?.({ phase: "embed", progress: pct, message: `Indexing ${pct}%` });
  }

  onProgress?.({ phase: "embed", progress: 100, message: "Indexing 100%" });
  return vectors;
}

/**
 * Embed a single query string to a 384-dim vector (used by search).
 */
export async function runQueryEmbedding(
  text: string,
  onProgress?: ProgressCallback
): Promise<number[]> {
  const extractor = await getEmbedPipeline(onProgress);
  return embedText(extractor, text);
}

/**
 * Run Whisper over 16kHz mono audio and return timestamped segments.
 * `duration` is used only to turn chunk offsets into a progress percentage.
 */
export async function runTranscription(
  audio: Float32Array,
  duration: number,
  onProgress?: ProgressCallback
): Promise<TranscriptSegment[]> {
  const transcriber = await getPipeline(onProgress);

  onProgress?.({ phase: "transcribe", progress: 0, message: "Transcribing 0%" });

  const output = (await transcriber(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
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

  return buildSegments(output, duration);
}

/**
 * Convert pipeline output into clean segments with sane timestamp fallbacks.
 * Whisper can emit `null` timestamps (especially the final chunk's end); fill
 * those from neighbours or the media duration.
 */
export function buildSegments(
  output: {
    text?: string;
    chunks?: Array<{ text?: string; timestamp?: [number | null, number | null] }>;
  },
  duration: number
): TranscriptSegment[] {
  const chunks = output.chunks ?? [];

  if (chunks.length === 0) {
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
