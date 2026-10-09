import React, { useState } from "react";
import { searchVideos, type SearchResult } from "../api";
import { embedQuery, type TranscribeProgress } from "../transcribe";

interface SearchBarProps {
  onResults: (results: SearchResult[]) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ onResults }) => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setStatus("Preparing search…");

    try {
      // Embed the query IN THE BROWSER. The model is shared with ingest, so it
      // is usually already warm; if this is the first use it downloads here and
      // we surface a clear "Loading search model" status.
      const vector = await embedQuery(q, (p: TranscribeProgress) => {
        if (p.phase === "model") {
          setStatus(p.message);
        } else {
          setStatus("Searching…");
        }
      });

      setStatus("Searching…");
      const results = await searchVideos(q, vector);
      onResults(results);
    } catch (err: any) {
      setError(err?.message || "Search failed. Please try again.");
      onResults([]);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSearch}>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your videos... e.g. 'explains the algorithm' or 'talks about design'"
              className="w-full pl-11 pr-4 py-3 bg-white border border-hairline rounded-xs text-ink text-[15px] placeholder-muted focus:outline-none focus:border-[#9b60aa] focus:ring-1 focus:ring-[#9b60aa]/20 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            aria-busy={loading}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
          >
            {loading ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
            Search
          </button>
        </div>
      </form>
      {status && !error && (
        <p className="mt-3 text-[13px] text-action-blue" aria-live="polite">
          {status}
        </p>
      )}
      {error && (
        <p className="mt-3 text-[13px] text-[#b30000]" aria-live="assertive">
          {error}
        </p>
      )}
    </div>
  );
};

export default SearchBar;
