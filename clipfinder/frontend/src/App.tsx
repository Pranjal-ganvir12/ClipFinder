import React, { useState, useCallback } from "react";
import UploadZone from "./components/UploadZone";
import SearchBar from "./components/SearchBar";
import VideoPlayer from "./components/VideoPlayer";
import VideoGallery from "./components/VideoGallery";
import VideoList from "./components/VideoList";

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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeVideo, setActiveVideo] = useState<{ filepath: string; filename: string } | null>(null);
  const [activeStartTime, setActiveStartTime] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleResults = useCallback((newResults: SearchResult[]) => {
    setResults(newResults);
    setSelectedResult(null);
    setSelectedIndex(null);
    setHasSearched(true);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
    setSelectedResult(result);
    setSelectedIndex(results.indexOf(result));
    setActiveVideo({ filepath: result.filepath, filename: result.filename });
    setActiveStartTime(result.start_time);
  }, [results]);

  const handleUploadComplete = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleSelectVideo = useCallback((filepath: string, filename: string) => {
    setActiveVideo({ filepath, filename });
    setActiveStartTime(0);
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-950">
      {/* Header */}
      <header className="glass border-b border-slate-800/50 px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">ClipFinder</h1>
            <p className="text-[10px] text-slate-500 -mt-0.5">AI-Powered Video Search</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Local AI
            </span>
            <span className="bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-700/50">
              Privacy First
            </span>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-[280px] border-r border-slate-800/50 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-4 space-y-5 overflow-y-auto flex-1">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Upload</h2>
              </div>
              <UploadZone onUploadComplete={handleUploadComplete} />
            </div>
            <div className="border-t border-slate-800/50 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Library</h2>
              </div>
              <VideoList refreshTrigger={refreshTrigger} onSelectVideo={handleSelectVideo} />
            </div>
          </div>
        </aside>

        {/* Center - Search & Player */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Search Bar Area */}
          <div className="p-4 pb-3">
            <SearchBar onResults={handleResults} />
          </div>

          {/* Video Player */}
          <div className="flex-1 px-4 pb-4 min-h-0">
            <VideoPlayer
              filepath={activeVideo?.filepath || null}
              startTime={activeStartTime}
              filename={activeVideo?.filename || null}
            />
          </div>
        </main>

        {/* Right Sidebar - Results */}
        <aside className="w-[320px] border-l border-slate-800/50 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-slate-800/50">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Results</h2>
              {results.length > 0 && (
                <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full font-medium">
                  {results.length} found
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <VideoGallery
              results={results}
              onSelect={handleSelect}
              selectedIndex={selectedIndex}
              hasSearched={hasSearched}
            />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;
