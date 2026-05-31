import React, { useRef, useEffect } from "react";

interface VideoPlayerProps {
  filepath: string | null;
  startTime: number | null;
  filename: string | null;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  filepath,
  startTime,
  filename,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && filepath && startTime !== null) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked by browser policy; user can click play
      });
    }
  }, [filepath, startTime]);

  if (!filepath) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="text-center p-8">
          <svg
            className="w-16 h-16 text-slate-600 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-slate-500 text-sm">
            Select a search result to play video
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="bg-black rounded-xl overflow-hidden border border-slate-700">
        <video
          ref={videoRef}
          src={filepath}
          controls
          className="w-full aspect-video"
        >
          Your browser does not support the video tag.
        </video>
      </div>
      {filename && (
        <p className="text-sm text-slate-400 truncate px-1">
          Now playing: <span className="text-slate-200">{filename}</span>
        </p>
      )}
    </div>
  );
};

export default VideoPlayer;
