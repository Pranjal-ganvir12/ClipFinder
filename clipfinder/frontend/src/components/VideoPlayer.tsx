import React, { useRef, useEffect, useState } from "react";
import { getLocalVideoUrl } from "../videoStore";

/**
 * VideoPlayer accepts EITHER contract:
 *   (a) `videoId` — the player resolves the local object URL itself via the
 *       session video store; or
 *   (b) `url` + `sourceMissing` — the parent has already resolved the URL.
 *
 * Supporting both keeps the component robust to how App wires it up. If
 * `videoId` is given it takes precedence for resolution.
 */
interface VideoPlayerProps {
  videoId?: string | null;
  url?: string | null;
  sourceMissing?: boolean;
  startTime: number | null;
  filename: string | null;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoId = null,
  url: urlProp = null,
  sourceMissing: sourceMissingProp,
  startTime,
  filename,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Resolve the local object URL: prefer an explicit videoId lookup, else the
  // url the parent passed in.
  const resolvedUrl = videoId ? getLocalVideoUrl(videoId) : urlProp;
  const url = resolvedUrl ?? null;

  // Something is selected but its local source is gone (e.g. after refresh).
  const selected = videoId !== null || urlProp !== null || sourceMissingProp === true;
  const sourceMissing =
    typeof sourceMissingProp === "boolean" ? sourceMissingProp : selected && url === null;

  useEffect(() => {
    if (videoRef.current && url && startTime !== null) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play().catch(() => {});
    }
  }, [url, startTime]);

  // Selected, but the local source is gone (e.g. after a page refresh).
  if (sourceMissing && !url) {
    return (
      <div className="h-full flex items-center justify-center rounded-lg border border-hairline bg-white" role="status" aria-live="polite">
        <div className="text-center p-12">
          <div className="w-16 h-16 mx-auto mb-5 rounded-lg bg-soft-stone flex items-center justify-center">
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h3 className="text-[18px] font-medium text-ink tracking-[-0.2px] mb-2">Video source unavailable</h3>
          <p className="text-[14px] text-muted leading-relaxed max-w-[320px] mx-auto">
            {filename ? <span className="text-slate">“{filename}” </span> : null}
            was transcribed in your browser, so its video is only available during the session it was
            uploaded. Re-upload the file to play it again — your transcript and search results are kept.
          </p>
        </div>
      </div>
    );
  }

  // Nothing selected yet.
  if (!url) {
    return (
      <div className="h-full flex items-center justify-center rounded-lg border border-hairline bg-white">
        <div className="text-center p-12">
          <div className="w-16 h-16 mx-auto mb-5 rounded-lg bg-soft-stone flex items-center justify-center">
            <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
          src={url}
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
            <svg className="w-3.5 h-3.5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-[13px] text-slate truncate">{filename}</span>
          </div>
          {isPlaying && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-coral animate-subtle-pulse" aria-hidden="true"></span>
              <span className="text-[11px] font-mono text-coral uppercase tracking-wider">Playing</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
