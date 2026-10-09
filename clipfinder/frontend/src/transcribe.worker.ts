/**
 * Web Worker that runs Whisper inference off the main thread.
 *
 * Why this exists: running the model on the main thread froze the tab and
 * Chrome showed "Page Unresponsive" during transcription. Inference is the
 * long-running CPU work, so it belongs in a worker. Audio DECODING stays on
 * the main thread because `AudioContext`/`decodeAudioData` are unavailable
 * here; the caller sends us the already-decoded 16kHz mono samples.
 */

import { runTranscription, type TranscribeProgress, type TranscriptSegment } from "./asr";

export interface WorkerRequest {
  type: "transcribe";
  audio: Float32Array;
  duration: number;
}

export type WorkerResponse =
  | { type: "progress"; payload: TranscribeProgress }
  | { type: "result"; segments: TranscriptSegment[] }
  | { type: "error"; message: string };

function post(message: WorkerResponse): void {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (!data || data.type !== "transcribe") return;

  try {
    const segments = await runTranscription(data.audio, data.duration, (payload) =>
      post({ type: "progress", payload })
    );
    post({ type: "result", segments });
  } catch (err) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : "Transcription failed in worker",
    });
  }
};
