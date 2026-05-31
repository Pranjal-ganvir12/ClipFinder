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
        <button
          key={video.video_id}
          onClick={() => {
            if (video.status === "completed") {
              onSelectVideo(video.filepath, video.filename);
            }
          }}
          disabled={video.status !== "completed"}
          className={`w-full text-left px-3 py-2.5 rounded-xs transition-all duration-150 group ${
            video.status === "completed"
              ? "hover:bg-soft-stone cursor-pointer"
              : "opacity-50 cursor-not-allowed"
          }`}
        >
          <div className="flex items-center gap-3">
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
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-ink truncate group-hover:text-deep-green transition-colors">
                {video.filename}
              </p>
              <p className="text-[11px] text-muted mt-0.5 font-mono">
                {video.status === "completed" ? formatDuration(video.duration) : video.status}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default VideoList;
