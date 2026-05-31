import React, { useState, useCallback } from "react";
import UploadZone from "./components/UploadZone";
import SearchBar from "./components/SearchBar";
import VideoPlayer from "./components/VideoPlayer";
import VideoGallery from "./components/VideoGallery";

interface SearchResult {
  video_id: string;
  filename: string;
  filepath: string;
  text: string;
  start_time: number;
  end_time: number;
  score: number;
}

const App: React.FC = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleResults = useCallback((newResults: SearchResult[]) => {
    setResults(newResults);
    setSelectedResult(null);
    setSelectedIndex(null);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    setSelectedResult(result);
    setSelectedIndex(results.indexOf(result));
  }, [results]);

  const handleUploadComplete = useCallback(() => {
    // Could refresh video list or notify user
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-slate-100">ClipFinder</h1>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            Local AI
          </span>
        </div>
        <p className="text-xs text-slate-500">
          100% Local • No Cloud APIs • Privacy First
        </p>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Upload & Queue */}
        <aside className="w-72 border-r border-slate-800 p-4 overflow-y-auto flex-shrink-0">
          <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
            Upload Videos
          </h2>
          <UploadZone onUploadComplete={handleUploadComplete} />
        </aside>

        {/* Center - Search & Player */}
        <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          <SearchBar onResults={handleResults} />
          <div className="flex-1 min-h-0">
            <VideoPlayer
              filepath={selectedResult?.filepath || null}
              startTime={selectedResult?.start_time || null}
              filename={selectedResult?.filename || null}
            />
          </div>
        </main>

        {/* Right Sidebar - Results */}
        <aside className="w-80 border-l border-slate-800 p-4 overflow-y-auto flex-shrink-0">
          <VideoGallery
            results={results}
            onSelect={handleSelect}
            selectedIndex={selectedIndex}
          />
        </aside>
      </div>
    </div>
  );
};

export default App;
