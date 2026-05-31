import React, { useState, useCallback, useRef, useEffect } from "react";
import { apiFetch } from "../api";

interface UploadedVideo {
  video_id: string;
  filename: string;
  status: string;
}

interface UploadZoneProps {
  onUploadComplete: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Queued", color: "text-slate bg-soft-stone border-hairline" },
  processing: { label: "Transcribing...", color: "text-action-blue bg-pale-blue border-action-blue/20" },
  completed: { label: "Ready", color: "text-deep-green bg-pale-green border-deep-green/20" },
  failed: { label: "Failed", color: "text-[#b30000] bg-red-50 border-red-200" },
};

const UploadZone: React.FC<UploadZoneProps> = ({ onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const pendingVideos = uploadedVideos.filter(
      (v) => v.status === "pending" || v.status === "processing"
    );

    if (pendingVideos.length === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    if (pollIntervalRef.current) return;

    pollIntervalRef.current = setInterval(async () => {
      const updated = [...uploadedVideos];
      let anyChanged = false;

      for (let i = 0; i < updated.length; i++) {
        if (updated[i].status === "pending" || updated[i].status === "processing") {
          try {
            const res = await apiFetch(`/api/videos/status/${updated[i].video_id}`);
            if (res.ok) {
              const data = await res.json();
              if (data.status !== updated[i].status) {
                updated[i] = { ...updated[i], status: data.status };
                anyChanged = true;
                if (data.status === "completed" || data.status === "failed") {
                  onUploadComplete();
                }
              }
            }
          } catch {}
        }
      }

      if (anyChanged) setUploadedVideos(updated);
    }, 3000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [uploadedVideos, onUploadComplete]);

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await apiFetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || "Upload failed");
      }

      const data = await response.json();
      setUploadedVideos((prev) => [
        { video_id: data.video_id, filename: data.filename, status: data.status },
        ...prev,
      ]);
    } catch (err: any) {
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      handleUpload(file);
    } else {
      setError("Please drop a valid video file.");
    }
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
    if (file) handleUpload(file);
  };

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border border-dashed rounded-sm p-5 text-center cursor-pointer transition-all duration-200
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
        />
        <div className="flex flex-col items-center gap-2">
          {uploading ? (
            <>
              <svg className="w-5 h-5 text-action-blue animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-[13px] text-action-blue font-medium">Uploading...</p>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <div>
                <p className="text-[13px] text-ink font-medium">Drop video or browse</p>
                <p className="text-[11px] text-muted mt-0.5">MP4, WebM, MOV, AVI</p>
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
      {uploadedVideos.length > 0 && (
        <div className="space-y-1.5">
          {uploadedVideos.map((video) => {
            const config = STATUS_CONFIG[video.status] || STATUS_CONFIG.pending;
            return (
              <div
                key={video.video_id}
                className={`flex items-center justify-between rounded-xs px-3 py-2 border ${config.color} animate-fade-up`}
              >
                <span className="text-[12px] text-ink truncate max-w-[140px]">
                  {video.filename}
                </span>
                <span className="text-[11px] font-medium flex items-center gap-1.5">
                  {video.status === "processing" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-action-blue animate-subtle-pulse"></span>
                  )}
                  {config.label}
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
