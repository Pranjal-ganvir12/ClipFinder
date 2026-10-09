import React, { useState, useCallback, useRef } from "react";
import { ingestVideo, EMBED_DIM, type IngestSegment } from "../api";
import { transcribeFile, embedSegments, type TranscribeProgress } from "../transcribe";
import { registerLocalVideo } from "../videoStore";

interface ProcessedVideo {
  video_id: string;
  filename: string;
  status: "transcribing" | "indexing" | "completed" | "failed";
  detail?: string;
}

interface UploadZoneProps {
  onUploadComplete: (video?: { video_id: string; filename: string }) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  transcribing: { label: "Transcribing…", color: "text-action-blue bg-pale-blue border-action-blue/20" },
  indexing: { label: "Indexing…", color: "text-action-blue bg-pale-blue border-action-blue/20" },
  completed: { label: "Ready", color: "text-deep-green bg-pale-green border-deep-green/20" },
  failed: { label: "Failed", color: "text-[#b30000] bg-red-50 border-red-200" },
};

const UploadZone: React.FC<UploadZoneProps> = ({ onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TranscribeProgress | null>(null);
  const [processed, setProcessed] = useState<ProcessedVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    setProgress({ phase: "model", progress: 0, message: "Preparing…" });

    // Keep the video playable this session via a client-side object URL.
    const objectUrl = URL.createObjectURL(file);

    try {
      // 1. Transcribe entirely in the browser.
      const { segments, duration } = await transcribeFile(file, (p) => setProgress(p));

      // 2. Keep only non-empty segments; embed each one IN THE BROWSER.
      const cleanSegments = segments
        .map((s) => ({ text: s.text.trim(), start: s.start, end: s.end }))
        .filter((s) => s.text.length > 0);

      if (cleanSegments.length === 0) {
        // Backend requires >=1 segment; a silent video has no speech to index.
        throw new Error("No speech detected in this video — nothing to index.");
      }

      // 3. Embed every segment in the browser (shared worker + model). This
      //    reports an "embed" phase so the UI never looks stuck ("Indexing N%").
      setProgress({ phase: "embed", progress: 0, message: "Indexing 0%" });
      const vectors = await embedSegments(
        cleanSegments.map((s) => s.text),
        (p) => setProgress(p)
      );

      // 4. Pair each segment with its 384-dim vector; guard the length so a
      //    bad vector is never sent (api.ts also validates before POST).
      const ingestSegments: IngestSegment[] = cleanSegments.map((s, i) => {
        const vector = vectors[i];
        if (!vector || vector.length !== EMBED_DIM) {
          throw new Error(
            `Segment ${i} produced ${vector ? vector.length : 0} values ` +
              `(expected ${EMBED_DIM}).`
          );
        }
        return { text: s.text, start: s.start, end: s.end, vector };
      });

      setProgress({ phase: "embed", progress: 100, message: "Uploading index…" });
      const result = await ingestVideo(file.name, duration, ingestSegments);

      // 3. Bind the local object URL to the server-assigned video_id so
      //    search results and the library can play it back this session.
      registerLocalVideo(result.video_id, objectUrl);

      setProcessed((prev) => [
        {
          video_id: result.video_id,
          filename: result.filename,
          status: "completed",
          detail: `${result.segment_count} segments`,
        },
        ...prev,
      ]);
      onUploadComplete({ video_id: result.video_id, filename: result.filename });
    } catch (err: any) {
      URL.revokeObjectURL(objectUrl);
      setError(err?.message || "Could not process this video. Please try again.");
      setProcessed((prev) => [
        { video_id: crypto.randomUUID(), filename: file.name, status: "failed" },
        ...prev,
      ]);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      void handleFile(file);
    } else {
      setError("Please drop a valid video file.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // reset so selecting the same file again re-triggers change
    e.target.value = "";
  };

  const progressPct = progress ? progress.progress : 0;

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !busy && fileInputRef.current?.click()}
        aria-busy={busy}
        className={`
          border border-dashed rounded-sm p-5 text-center transition-all duration-200
          ${busy ? "cursor-default" : "cursor-pointer"}
          ${isDragging
            ? "border-deep-green bg-pale-green"
            : "border-hairline hover:border-muted hover:bg-[#fafafa]"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
          disabled={busy}
        />
        <div className="flex flex-col items-center gap-2">
          {busy ? (
            <>
              <svg className="w-5 h-5 text-action-blue animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-[13px] text-action-blue font-medium" aria-live="polite">
                {progress?.message || "Working…"}
              </p>
              <div
                className="w-full h-1 bg-soft-stone rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPct}
                aria-label={progress?.message || "Processing"}
              >
                <div
                  className="h-full bg-action-blue transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <div>
                <p className="text-[13px] text-ink font-medium">Drop video or browse</p>
                <p className="text-[11px] text-muted mt-0.5">Transcribed in your browser · MP4, WebM, MOV</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-[12px] text-[#b30000] bg-red-50 border border-red-200 rounded-xs px-3 py-2">
          {error}
        </p>
      )}

      {/* Queue */}
      {processed.length > 0 && (
        <div className="space-y-1.5">
          {processed.map((video) => {
            const config = STATUS_CONFIG[video.status] || STATUS_CONFIG.indexing;
            return (
              <div
                key={video.video_id}
                className={`flex items-center justify-between rounded-xs px-3 py-2 border ${config.color} animate-fade-up`}
              >
                <span className="text-[12px] text-ink truncate max-w-[140px]">
                  {video.filename}
                </span>
                <span className="text-[11px] font-medium flex items-center gap-1.5">
                  {config.label}
                  {video.detail && video.status === "completed" && (
                    <span className="text-muted">· {video.detail}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UploadZone;
