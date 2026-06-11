"use client";

import { motion } from "framer-motion";

interface ProcessingOverlayProps {
  progress: number;
  stage: string;
}

export function ProcessingOverlay({ progress, stage }: ProcessingOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center gap-6 py-16"
    >
      <div className="relative h-16 w-16">
        <svg className="h-16 w-16 animate-spin" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#2e2e2e" strokeWidth="4" />
          <circle
            cx="32" cy="32" r="28" fill="none" stroke="#fe2c55" strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${Math.PI * 56}`}
            strokeDashoffset={`${Math.PI * 56 * (1 - progress / 100)}`}
            className="transition-all duration-300"
            style={{ filter: "drop-shadow(0 0 6px rgba(254,44,85,0.5))" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-white">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-white/80">{stage}</p>
        <p className="text-xs text-white/30 mt-1">请稍候，正在处理中...</p>
      </div>
      <div className="w-64 h-1 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#fe2c55] to-[#ff6f61]"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </motion.div>
  );
}
