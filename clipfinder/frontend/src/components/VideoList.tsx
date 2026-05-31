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

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  processing: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const VideoList: React.FC<VideoListProps> = ({ refreshTrigger, onSelectVideo }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/videos");
      if (res.ok) {
        const data = await res.json();
        setVideos(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, [refreshTrigger]);

  if (videos.length === 0 && !loading) {
    return (
      <div className="text-center py-4">
        <p className="text-slate-500 text-xs">No videos uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider">
        Library ({videos.length})
      </h3>
      {videos.map((video) => (
        <button
          key={video.video_id}
          onClick={() => {
            if (video.status === "completed") {
              onSelectVideo(video.filepath, video.filename);
            }
          }}
          disabled={video.status !== "completed"}
          className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 ${
            video.status === "completed"
              ? "bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600 cursor-pointer"
              : "bg-slate-800/30 border border-slate-700/30 cursor-not-allowed opacity-60"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-200 truncate max-w-[130px]">
              {video.filename}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[video.status] || ""}`}>
              {video.status}
            </span>
          </div>
          {video.duration ? (
            <p className="text-[10px] text-slate-500 mt-0.5">
              {formatDuration(video.duration)}
            </p>
          ) : null}
        </button>
      ))}
    </div>
  );
};

export default VideoList;
