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
  hasSearched: boolean;
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
  hasSearched,
}) => {
  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-slate-500 text-sm">Search to find moments in your videos</p>
        <p className="text-slate-600 text-xs mt-1">Results will appear here</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-slate-400 text-sm font-medium">No matches found</p>
        <p className="text-slate-600 text-xs mt-1">Try a different search query</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((result, index) => (
        <button
          key={`${result.video_id}-${result.start_time}-${index}`}
          onClick={() => onSelect(result)}
          className={`animate-fade-in w-full text-left p-3.5 rounded-xl transition-all duration-200 group ${
            selectedIndex === index
              ? "bg-violet-500/10 border border-violet-500/30 glow-border"
              : "bg-slate-900/60 border border-slate-800/50 hover:bg-slate-800/60 hover:border-slate-700/50"
          }`}
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {/* Timestamp badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md ${
              selectedIndex === index
                ? "bg-violet-500/20 text-violet-300"
                : "bg-slate-800 text-slate-400 group-hover:text-violet-400 group-hover:bg-violet-500/10"
            } transition-colors`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTime(result.start_time)} – {formatTime(result.end_time)}
            </span>
          </div>

          {/* Text content */}
          <p className={`text-sm leading-relaxed line-clamp-3 ${
            selectedIndex === index ? "text-slate-200" : "text-slate-300"
          }`}>
            "{result.text}"
          </p>

          {/* File info */}
          <div className="flex items-center gap-1.5 mt-2">
            <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[11px] text-slate-600 truncate">{result.filename}</span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default VideoGallery;
