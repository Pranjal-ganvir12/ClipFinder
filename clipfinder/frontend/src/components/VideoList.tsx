import React, { useEffect, useState } from "react";
import { apiFetch } from "../api";

interface Video {
  video_id: string;
  filename: string;
  filepath: string;
  duration: number | null;
  status: string;
}

interface VideoListProps {
  refreshTrigger: number;
  onSelectVideo: (filepath: string, filename: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const VideoList: React.FC<VideoListProps> = ({ refreshTrigger, onSelectVideo }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/videos");
      if (res.ok) {
        const data = await res.json();
        setVideos(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, [refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this video and all its indexed data?")) return;

    setDeletingId(videoId);
    try {
      const res = await apiFetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (res.ok) {
        setVideos((prev) => prev.filter((v) => v.video_id !== videoId));
      }
    } catch {} finally {
      setDeletingId(null);
    }
  };

  if (videos.length === 0 && !loading) {
    return (
      <div className="text-center py-8">
        <p className="text-[12px] text-muted">No videos yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {videos.map((video) => (
        <div
          key={video.video_id}
          className={`group flex items-center gap-3 px-3 py-2.5 rounded-xs transition-all duration-150 ${
            video.status === "completed"
              ? "hover:bg-soft-stone cursor-pointer"
              : "opacity-50"
          }`}
          onClick={() => {
            if (video.status === "completed") {
              onSelectVideo(video.filepath, video.filename);
            }
          }}
        >
          {/* Play icon */}
          <div className={`w-8 h-8 rounded-xs flex items-center justify-center flex-shrink-0 ${
            video.status === "completed"
              ? "bg-soft-stone group-hover:bg-deep-green/10"
              : "bg-[#f5f5f5]"
          } transition-colors`}>
            <svg className={`w-3.5 h-3.5 ${
              video.status === "completed" ? "text-ink group-hover:text-deep-green" : "text-muted"
            } transition-colors`} viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ink truncate group-hover:text-deep-green transition-colors">
              {video.filename}
            </p>
            <p className="text-[11px] text-muted mt-0.5 font-mono">
              {video.status === "completed" ? formatDuration(video.duration) : video.status}
            </p>
          </div>

          {/* Delete button */}
          <button
            onClick={(e) => handleDelete(e, video.video_id)}
            disabled={deletingId === video.video_id}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-xs hover:bg-red-50 transition-all"
            title="Delete video"
          >
            {deletingId === video.video_id ? (
              <svg className="w-3.5 h-3.5 text-muted animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-muted hover:text-[#b30000] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
};

export default VideoList;
