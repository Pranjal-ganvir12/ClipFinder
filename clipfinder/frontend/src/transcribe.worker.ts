/**
 * Web Worker that runs ALL ML inference off the main thread.
 *
 * Why this exists: running a model on the main thread froze the tab and Chrome
 * showed "Page Unresponsive" during inference. Both the long CPU-bound jobs —
 * Whisper transcription AND MiniLM text embedding — therefore run here. Audio
 * DECODING stays on the main thread because `AudioContext`/`decodeAudioData`
 * are unavailable in a worker; the caller sends us already-decoded 16kHz mono
 * samples.
 *
 * Three request kinds:
 *   - "transcribe": Whisper over decoded audio -> timestamped segments.
 *   - "embed":      MiniLM over N texts        -> N 384-dim vectors (ingest).
 *   - "embed-query": MiniLM over one query     -> one 384-dim vector (search).
 */

import {
  runTranscription,
  runEmbeddings,
  runQueryEmbedding,
  type TranscribeProgress,
  type TranscriptSegment,
} from "./asr";

export interface TranscribeRequest {
  type: "transcribe";
  audio: Float32Array;
  duration: number;
}

export interface EmbedRequest {
  type: "embed";
  texts: string[];
}

export interface EmbedQueryRequest {
  type: "embed-query";
  text: string;
}

export type WorkerRequest = TranscribeRequest | EmbedRequest | EmbedQueryRequest;

export type WorkerResponse =
  | { type: "progress"; payload: TranscribeProgress }
  | { type: "result"; segments: TranscriptSegment[] }
  | { type: "vectors"; vectors: number[][] }
  | { type: "query-vector"; vector: number[] }
  | { type: "error"; message: string };

function post(message: WorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (!data) return;

  try {
    if (data.type === "transcribe") {
      const segments = await runTranscription(data.audio, data.duration, (payload) =>
        post({ type: "progress", payload })
      );
      post({ type: "result", segments });
    } else if (data.type === "embed") {
      const vectors = await runEmbeddings(data.texts, (payload) =>
        post({ type: "progress", payload })
      );
      post({ type: "vectors", vectors });
    } else if (data.type === "embed-query") {
      const vector = await runQueryEmbedding(data.text, (payload) =>
        post({ type: "progress", payload })
      );
      post({ type: "query-vector", vector });
    }
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : "Worker inference failed",
    });
  }
};
