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
      <div className="text-center py-6">
        <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center">
          <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
        </div>
        <p className="text-slate-600 text-xs">Your videos will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {videos.map((video) => (
        <button
          key={video.video_id}
          onClick={() => {
            if (video.status === "completed") {
              onSelectVideo(video.filepath, video.filename);
            }
          }}
          disabled={video.status !== "completed"}
          className={`w-full text-left p-2.5 rounded-xl transition-all duration-200 group ${
            video.status === "completed"
              ? "bg-slate-900/60 border border-slate-800/50 hover:bg-slate-800/60 hover:border-slate-700/50 cursor-pointer"
              : "bg-slate-900/30 border border-slate-800/30 cursor-not-allowed opacity-50"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
              video.status === "completed"
                ? "bg-violet-500/10 group-hover:bg-violet-500/20"
                : "bg-slate-800/50"
            } transition-colors`}>
              <svg className={`w-4 h-4 ${
                video.status === "completed" ? "text-violet-400" : "text-slate-600"
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-300 truncate group-hover:text-white transition-colors">
                {video.filename}
              </p>
              <p className="text-[10px] text-slate-600 mt-0.5">
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
