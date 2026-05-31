import React, { useState, useCallback, useRef, useEffect } from "react";

interface UploadedVideo {
  video_id: string;
  filename: string;
  status: string;
}

interface UploadZoneProps {
  onUploadComplete: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Queued...",
  processing: "Analyzing Audio...",
  completed: "Ready",
  failed: "Failed",
};

const UploadZone: React.FC<UploadZoneProps> = ({ onUploadComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll status for videos that are still processing
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
        if (
          updated[i].status === "pending" ||
          updated[i].status === "processing"
        ) {
          try {
            const res = await fetch(
              `/api/videos/status/${updated[i].video_id}`
            );
            if (res.ok) {
              const data = await res.json();
              if (data.status !== updated[i].status) {
                updated[i] = { ...updated[i], status: data.status };
                anyChanged = true;
                if (
                  data.status === "completed" ||
                  data.status === "failed"
                ) {
                  onUploadComplete();
                }
              }
            }
          } catch {
            // Silently continue polling
          }
        }
      }

      if (anyChanged) {
        setUploadedVideos(updated);
      }
    }, 2000);

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
      const response = await fetch("/api/upload", {
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("video/")) {
        handleUpload(file);
      } else {
        setError("Please drop a valid video file.");
      }
    },
    []
  );

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
    if (file) {
      handleUpload(file);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
          ${
            isDragging
              ? "border-indigo-400 bg-indigo-500/10"
              : "border-slate-600 hover:border-slate-500 hover:bg-slate-800/50"
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
        <div className="flex flex-col items-center gap-3">
          <svg
            className="w-10 h-10 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          {uploading ? (
            <p className="text-indigo-400 font-medium">Uploading...</p>
          ) : (
            <>
              <p className="text-slate-300 font-medium">
                Drop video here or click to browse
              </p>
              <p className="text-slate-500 text-sm">
                Supports MP4, WebM, MOV, AVI
              </p>
            </>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Processing Queue */}
      {uploadedVideos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
            Processing Queue
          </h3>
          {uploadedVideos.map((video) => (
            <div
              key={video.video_id}
              className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3"
            >
              <span className="text-sm text-slate-300 truncate max-w-[160px]">
                {video.filename}
              </span>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  video.status === "completed"
                    ? "bg-green-500/20 text-green-400"
                    : video.status === "failed"
                    ? "bg-red-500/20 text-red-400"
                    : "bg-indigo-500/20 text-indigo-400"
                }`}
              >
                {STATUS_LABELS[video.status] || video.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UploadZone;
