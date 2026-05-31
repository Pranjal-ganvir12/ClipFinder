import React from "react";

interface SearchResult {
  video_id: string;
  filename: string;
  filepath: string;
  text: string;
  start_time: number;
  end_time: number;
  score: number;
}

interface VideoGalleryProps {
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
  selectedIndex: number | null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

const VideoGallery: React.FC<VideoGalleryProps> = ({
  results,
  onSelect,
  selectedIndex,
}) => {
  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-6">
          <svg
            className="w-12 h-12 text-slate-600 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <p className="text-slate-500 text-sm">
            Search results will appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider px-1">
        Results ({results.length})
      </h3>
      {results.map((result, index) => (
        <button
          key={`${result.video_id}-${result.start_time}-${index}`}
          onClick={() => onSelect(result)}
          className={`w-full text-left p-3 rounded-lg transition-all duration-150 ${
            selectedIndex === index
              ? "bg-indigo-600/20 border border-indigo-500/50"
              : "bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 hover:border-slate-600"
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
              {formatTime(result.start_time)} – {formatTime(result.end_time)}
            </span>
          </div>
          <p className="text-sm text-slate-200 line-clamp-2 mt-1">
            {result.text}
          </p>
          <p className="text-xs text-slate-500 mt-1 truncate">
            {result.filename}
          </p>
        </button>
      ))}
    </div>
  );
};

export default VideoGallery;
