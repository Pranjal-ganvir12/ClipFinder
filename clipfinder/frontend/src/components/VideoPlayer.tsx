import React, { useRef, useEffect, useState } from "react";

interface VideoPlayerProps {
  filepath: string | null;
  startTime: number | null;
  filename: string | null;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ filepath, startTime, filename }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (videoRef.current && filepath && startTime !== null) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play().catch(() => {});
    }
  }, [filepath, startTime]);

  if (!filepath) {
    return (
      <div className="h-full flex items-center justify-center rounded-lg border border-hairline bg-white">
        <div className="text-center p-12">
          <div className="w-16 h-16 mx-auto mb-5 rounded-lg bg-soft-stone flex items-center justify-center">
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-[18px] font-medium text-ink tracking-[-0.2px] mb-2">No video selected</h3>
          <p className="text-[14px] text-muted leading-relaxed max-w-[280px] mx-auto">
            Upload a video and search its content, or select one from your library to begin playback.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden bg-primary relative">
        <video
          ref={videoRef}
          src={filepath}
          controls
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          className="w-full h-full object-contain"
        >
          Your browser does not support the video tag.
        </video>
      </div>
      {filename && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[13px] text-slate truncate">{filename}</span>
          </div>
          {isPlaying && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-coral animate-subtle-pulse"></span>
              <span className="text-[11px] font-mono text-coral uppercase tracking-wider">Playing</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
