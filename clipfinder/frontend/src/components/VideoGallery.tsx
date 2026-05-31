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
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="w-12 h-12 rounded-lg bg-soft-stone flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <p className="text-[14px] text-slate">Search to find moments</p>
        <p className="text-[12px] text-muted mt-1">Results appear here with timestamps</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="w-12 h-12 rounded-lg bg-soft-stone flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-[14px] text-ink font-medium">No matches found</p>
        <p className="text-[12px] text-muted mt-1">Try a different search query</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {results.map((result, index) => (
        <button
          key={`${result.video_id}-${result.start_time}-${index}`}
          onClick={() => onSelect(result)}
          className={`animate-fade-up w-full text-left p-4 rounded-sm transition-all duration-150 border ${
            selectedIndex === index
              ? "bg-pale-green border-deep-green/20"
              : "bg-white border-hairline hover:border-border-light hover:bg-[#fafafa]"
          }`}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          {/* Timestamp */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1.5 text-[12px] font-mono tracking-wide px-2 py-0.5 rounded-xs ${
              selectedIndex === index
                ? "bg-deep-green/10 text-deep-green"
                : "bg-soft-stone text-slate"
            }`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatTime(result.start_time)} – {formatTime(result.end_time)}
            </span>
          </div>

          {/* Transcript text */}
          <p className="text-[14px] text-ink leading-[1.5] line-clamp-3">
            {result.text}
          </p>

          {/* File info */}
          <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-hairline/50">
            <svg className="w-3 h-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[11px] text-muted truncate">{result.filename}</span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default VideoGallery;
