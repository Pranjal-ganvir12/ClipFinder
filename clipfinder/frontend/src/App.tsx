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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeVideo, setActiveVideo] = useState<{ filepath: string; filename: string } | null>(null);
  const [activeStartTime, setActiveStartTime] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleResults = useCallback((newResults: SearchResult[]) => {
    setResults(newResults);
    setSelectedIndex(null);
    setHasSearched(true);
  }, []);

  const handleSelect = useCallback((result: SearchResult) => {
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
    <div className="h-screen flex flex-col overflow-hidden bg-canvas">
      {/* Announcement Bar */}
      <div className="bg-primary text-white text-center py-2 px-4">
        <p className="text-[12px] tracking-wide">
          <span className="text-muted">100% local AI</span>
          <span className="mx-2 text-muted">·</span>
          <span className="text-white/90">No cloud APIs. Your videos never leave your machine.</span>
        </p>
      </div>

      {/* Navigation */}
      <header className="border-b border-hairline px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none" />
            </svg>
            <span className="text-[20px] font-semibold tracking-[-0.4px] text-primary">ClipFinder</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-[12px] font-mono text-muted tracking-wider uppercase">Local Engine</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="text-[12px] text-slate">Active</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <aside className="w-[300px] border-r border-hairline flex flex-col overflow-hidden">
          <div className="p-6 border-b border-hairline">
            <h2 className="text-[12px] font-mono text-muted tracking-wider uppercase mb-4">Upload</h2>
            <UploadZone onUploadComplete={handleUploadComplete} />
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-[12px] font-mono text-muted tracking-wider uppercase mb-4">Library</h2>
            <VideoList refreshTrigger={refreshTrigger} onSelectVideo={handleSelectVideo} />
          </div>
        </aside>

        {/* Center */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#fafafa]">
          {/* Search */}
          <div className="p-6 pb-4 bg-canvas border-b border-hairline">
            <SearchBar onResults={handleResults} />
          </div>

          {/* Player */}
          <div className="flex-1 p-6 min-h-0">
            <VideoPlayer
              filepath={activeVideo?.filepath || null}
              startTime={activeStartTime}
              filename={activeVideo?.filename || null}
            />
          </div>
        </main>

        {/* Right Panel - Results */}
        <aside className="w-[340px] border-l border-hairline flex flex-col overflow-hidden bg-canvas">
          <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
            <h2 className="text-[12px] font-mono text-muted tracking-wider uppercase">Results</h2>
            {results.length > 0 && (
              <span className="text-[11px] font-mono text-coral bg-coral/5 border border-coral/20 px-2 py-0.5 rounded-sm">
                {results.length} matches
              </span>
            )}
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
