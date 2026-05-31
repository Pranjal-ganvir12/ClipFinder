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
      <div className="h-full flex items-center justify-center rounded-2xl border border-slate-800/50 bg-slate-900/40 overflow-hidden relative">
        {/* Decorative background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-violet-500/5 rounded-full blur-3xl"></div>
        </div>
        <div className="text-center p-8 relative z-10">
          <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center">
            <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-slate-400 font-medium mb-1">No video selected</h3>
          <p className="text-slate-600 text-sm max-w-[250px]">
            Upload a video and search to find specific moments, or select from your library
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-slate-800/50 bg-black shadow-2xl shadow-black/50 relative group">
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
        {/* Playing indicator */}
        {isPlaying && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-[10px] text-white font-medium">PLAYING</span>
          </div>
        )}
      </div>
      {filename && (
        <div className="flex items-center gap-2 px-1">
          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="text-xs text-slate-400 truncate">{filename}</span>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
