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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "Queued", color: "text-amber-400 bg-amber-500/10 border-amber-500/20", icon: "⏳" },
  processing: { label: "Transcribing", color: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: "🎙️" },
  completed: { label: "Ready", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: "✓" },
  failed: { label: "Failed", color: "text-red-400 bg-red-500/10 border-red-500/20", icon: "✗" },
};

const UploadZone: React.FC<UploadZoneProps> = ({ onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    // Simulate progress for UX
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + Math.random() * 15, 90));
    }, 200);

    try {
      const response = await apiFetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

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
      clearInterval(progressInterval);
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
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
          relative overflow-hidden border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-300
          ${isDragging
            ? "border-violet-400 bg-violet-500/10 scale-[1.02]"
            : "border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/30"
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

        {/* Upload progress overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-xl">
            <div className="w-full max-w-[80%] h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-xs text-violet-300">Uploading... {Math.round(uploadProgress)}%</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            isDragging ? "bg-violet-500/20" : "bg-slate-800/80"
          }`}>
            <svg className={`w-5 h-5 transition-colors ${isDragging ? "text-violet-400" : "text-slate-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div>
            <p className="text-slate-300 text-sm font-medium">Drop video here</p>
            <p className="text-slate-600 text-[11px] mt-0.5">MP4, WebM, MOV • Max 100MB</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-red-400 text-xs">
          <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Queue */}
      {uploadedVideos.length > 0 && (
        <div className="space-y-1.5">
          {uploadedVideos.map((video) => {
            const config = STATUS_CONFIG[video.status] || STATUS_CONFIG.pending;
            return (
              <div
                key={video.video_id}
                className={`flex items-center justify-between rounded-lg p-2.5 border ${config.color} animate-fade-in`}
              >
                <span className="text-[11px] text-slate-300 truncate max-w-[130px]">
                  {video.filename}
                </span>
                <span className="text-[10px] font-medium flex items-center gap-1">
                  {video.status === "processing" && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
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
