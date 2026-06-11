"use client";

import { useCallback, useState } from "react";
import type { TimelineIssue } from "@/types";

interface TimelineProps {
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  onFrameChange: (frame: number) => void;
  onPlayPause: () => void;
  similarities?: number[];
  issues?: TimelineIssue[];
  playbackSpeed?: number;
  onSpeedChange?: (speed: number) => void;
  alignmentOffset?: number;
  onAlignmentOffsetChange?: (offset: number) => void;
  fps?: number;
  syncMethod?: "audio" | "motion";
}

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1] as const;

const issueColors: Record<string, string> = {
  timing: "bg-purple-400",
  pose: "bg-blue-400",
  range: "bg-amber-400",
  missing: "bg-red-400",
  highlight: "bg-emerald-400",
};

const issueDotBorder: Record<string, string> = {
  timing: "ring-purple-400/30",
  pose: "ring-blue-400/30",
  range: "ring-amber-400/30",
  missing: "ring-red-400/30",
  highlight: "ring-emerald-400/30",
};

export function Timeline({
  currentFrame,
  totalFrames,
  isPlaying,
  onFrameChange,
  onPlayPause,
  similarities,
  issues,
  playbackSpeed = 1,
  onSpeedChange,
  alignmentOffset = 0,
  onAlignmentOffsetChange,
  fps = 10,
  syncMethod,
}: TimelineProps) {
  const progress = totalFrames > 0 ? (currentFrame / (totalFrames - 1)) * 100 : 0;
  const [hoveredIssue, setHoveredIssue] = useState<TimelineIssue | null>(null);

  const handleScrub = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFrameChange(parseInt(e.target.value, 10));
    },
    [onFrameChange]
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/12 bg-[#1c1c1c] p-5">
      {/* Similarity heatmap */}
      {similarities && similarities.length > 0 && (
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
          {similarities.map((score, i) => {
            const hue = (score / 100) * 120;
            return (
              <div key={i} className="flex-1" style={{ backgroundColor: `hsl(${hue}, 70%, 45%)` }} />
            );
          })}
        </div>
      )}

      {/* Issue markers row */}
      {issues && issues.length > 0 && totalFrames > 0 && (
        <div className="relative h-5 w-full">
          {issues.map((issue, i) => {
            const leftPct = (issue.frame / (totalFrames - 1)) * 100;
            return (
              <button
                key={i}
                className={`absolute top-0.5 -translate-x-1/2 h-4 w-4 rounded-full ring-2 ${issueColors[issue.type]} ${issueDotBorder[issue.type]} cursor-pointer transition-transform hover:scale-150 z-10`}
                style={{ left: `${leftPct}%` }}
                onClick={() => onFrameChange(issue.frame)}
                onMouseEnter={() => setHoveredIssue(issue)}
                onMouseLeave={() => setHoveredIssue(null)}
                title={issue.title}
              />
            );
          })}
          {/* Tooltip */}
          {hoveredIssue && (
            <div
              className="absolute -top-14 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-[#2e2e2e] border border-white/12 text-[11px] text-white/80 whitespace-nowrap z-20 shadow-lg pointer-events-none"
              style={{ left: `${(hoveredIssue.frame / (totalFrames - 1)) * 100}%` }}
            >
              <span className="font-medium">{hoveredIssue.title}</span>
              <span className="text-white/40 ml-1.5">{hoveredIssue.description.slice(0, 60)}</span>
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={onPlayPause}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors shrink-0"
        >
          {isPlaying ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Speed selector */}
        {onSpeedChange && (
          <div className="flex items-center gap-1 shrink-0">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium tabular-nums transition-all ${
                  playbackSpeed === speed
                    ? "bg-[#fe2c55] text-white shadow-sm shadow-[#fe2c55]/30"
                    : "text-white/40 hover:text-white/70 hover:bg-white/5"
                }`}
              >
                {speed === 1 ? "1x" : `${speed}x`}
              </button>
            ))}
          </div>
        )}

        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={currentFrame}
          onChange={handleScrub}
          className="flex-1 h-1.5 appearance-none rounded-full bg-white/10 cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[#fe2c55]
            [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(254,44,85,0.5)]
          "
        />

        <span className="text-xs tabular-nums text-white/30 min-w-[60px] text-right">
          {currentFrame + 1} / {totalFrames}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full bg-[#fe2c55] transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Manual alignment offset */}
      {onAlignmentOffsetChange && (
        <div className="flex items-center gap-3 pt-1 border-t border-white/5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-white/40">对齐微调</span>
            {syncMethod && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                syncMethod === "audio"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  : "bg-blue-500/15 text-blue-400 border border-blue-500/20"
              }`}>
                {syncMethod === "audio" ? "♪ 音乐对齐" : "◎ 动作对齐"}
              </span>
            )}
          </div>
          <button
            onClick={() => onAlignmentOffsetChange(alignmentOffset - 5)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white text-xs transition-colors"
            title="向前调5帧"
          >
            ⟪
          </button>
          <button
            onClick={() => onAlignmentOffsetChange(alignmentOffset - 1)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white text-xs transition-colors"
            title="向前调1帧"
          >
            ◀
          </button>
          <span className="text-[11px] tabular-nums text-white/60 min-w-[80px] text-center">
            {alignmentOffset >= 0 ? "+" : ""}{alignmentOffset} 帧
            <span className="text-white/30 ml-1">
              ({alignmentOffset >= 0 ? "+" : ""}{(alignmentOffset / fps).toFixed(1)}s)
            </span>
          </span>
          <button
            onClick={() => onAlignmentOffsetChange(alignmentOffset + 1)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white text-xs transition-colors"
            title="向后调1帧"
          >
            ▶
          </button>
          <button
            onClick={() => onAlignmentOffsetChange(alignmentOffset + 5)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white text-xs transition-colors"
            title="向后调5帧"
          >
            ⟫
          </button>
          {alignmentOffset !== 0 && (
            <button
              onClick={() => onAlignmentOffsetChange(0)}
              className="text-[10px] text-[#fe2c55]/70 hover:text-[#fe2c55] transition-colors ml-1"
            >
              重置
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      {issues && issues.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-1">
          {[
            { type: "highlight", label: "表现优秀" },
            { type: "timing", label: "节奏" },
            { type: "pose", label: "体态" },
            { type: "range", label: "幅度" },
          ].map(({ type, label }) => {
            const count = issues.filter((i) => i.type === type).length;
            if (count === 0) return null;
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${issueColors[type]}`} />
                <span className="text-[10px] text-white/30">
                  {label} ({count})
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
