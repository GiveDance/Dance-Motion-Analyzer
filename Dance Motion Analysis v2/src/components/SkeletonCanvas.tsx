"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { Landmark } from "@/types";
import { SKELETON_CONNECTIONS, POSE_LANDMARKS } from "@/lib/pose-constants";

// Landmark indices to draw: NOSE (head) + body (11+), skip face details (1-10)
const DRAWABLE_LANDMARKS = new Set([
  POSE_LANDMARKS.NOSE,
  ...Object.values(POSE_LANDMARKS).filter((i) => i >= 11),
]);

interface SkeletonCanvasProps {
  landmarks: Landmark[] | null;
  label: string;
  color?: string;
  videoUrl?: string;
  currentTime?: number; // seconds to seek to
}

export function SkeletonCanvas({
  landmarks,
  label,
  color = "#3b82f6",
  videoUrl,
  currentTime = 0,
}: SkeletonCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDimensions, setVideoDimensions] = useState({ width: 640, height: 480 });

  // Seek video to the current frame time
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (Math.abs(video.currentTime - currentTime) > 0.01) {
      video.currentTime = currentTime;
    }
  }, [currentTime, videoUrl]);

  // Track video native dimensions
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
  }, []);

  // Draw skeleton overlay on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!landmarks || landmarks.length === 0) return;

    // MediaPipe normalized landmarks map directly to pixel coords
    const scaledLandmarks = landmarks.map((lm) => ({
      x: lm.x * w,
      y: lm.y * h,
      visibility: lm.visibility,
    }));

    // Draw connections
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 4;

    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const start = scaledLandmarks[startIdx];
      const end = scaledLandmarks[endIdx];
      if (start.visibility < 0.5 || end.visibility < 0.5) continue;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    // Draw joints (skip face landmarks)
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    for (let i = 0; i < scaledLandmarks.length; i++) {
      if (!DRAWABLE_LANDMARKS.has(i)) continue;
      const lm = scaledLandmarks[i];
      if (lm.visibility < 0.5) continue;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [landmarks, color, videoDimensions]);

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/30">
        {label}
      </span>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-white/12 bg-black"
        style={{ aspectRatio: `${videoDimensions.width} / ${videoDimensions.height * 0.8}` }}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={handleLoadedMetadata}
            className="absolute inset-0 h-full w-full object-contain opacity-65"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1c1c1c]">
            <span className="text-sm text-white/20">暂无视频</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={videoDimensions.width}
          height={videoDimensions.height}
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}
