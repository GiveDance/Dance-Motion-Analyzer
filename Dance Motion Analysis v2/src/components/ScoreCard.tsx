"use client";

import { motion } from "framer-motion";
import type { AnalysisResult } from "@/types";

interface ScoreCardProps {
  analysis: AnalysisResult;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

function getScoreGradient(score: number): [string, string] {
  if (score >= 80) return ["#34d399", "#10b981"];
  if (score >= 60) return ["#fbbf24", "#f59e0b"];
  return ["#fe2c55", "#ef4444"];
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "非常出色";
  if (score >= 80) return "表现优秀";
  if (score >= 70) return "还不错";
  if (score >= 60) return "有待提高";
  return "需要加练";
}

function getBarColor(score: number): string {
  if (score >= 80) return "from-emerald-500 to-emerald-400";
  if (score >= 60) return "from-amber-500 to-amber-400";
  return "from-red-500 to-[#fe2c55]";
}

function getDimIcon(label: string): string {
  if (label.includes("节奏")) return "♪";
  if (label.includes("体态")) return "◎";
  if (label.includes("完成")) return "↗";
  return "≡";
}

export function ScoreCard({ analysis }: ScoreCardProps) {
  const { overallScore, dimensions } = analysis;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (overallScore / 100) * circumference;
  const [gradStart, gradEnd] = getScoreGradient(overallScore);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="rounded-2xl border border-white/12 bg-[#1c1c1c] p-8"
    >
      <div className="flex flex-col md:flex-row items-center gap-8">
        {/* Overall score ring */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">
            综合得分
          </h3>
          <div className="relative flex items-center justify-center">
            <svg width="140" height="140" className="-rotate-90">
              <defs>
                <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={gradStart} />
                  <stop offset="100%" stopColor={gradEnd} />
                </linearGradient>
              </defs>
              <circle cx="70" cy="70" r="54" fill="none" stroke="#2e2e2e" strokeWidth="8" />
              <motion.circle
                cx="70" cy="70" r="54" fill="none"
                stroke="url(#scoreGrad)"
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <motion.span
                className={`text-4xl font-bold tabular-nums ${getScoreColor(overallScore)}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {overallScore}
              </motion.span>
              <span className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">
                / 100
              </span>
            </div>
          </div>
          <p className="text-sm font-medium text-white/50">
            {getScoreLabel(overallScore)}
          </p>
        </div>

        {/* Dimension breakdown */}
        <div className="flex-1 w-full space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">
            分项评分
          </h3>
          {dimensions.map((dim, i) => (
            <motion.div
              key={dim.label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{getDimIcon(dim.label)}</span>
                  <span className="text-sm text-white/70">{dim.label}</span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${getScoreColor(dim.score)}`}>
                  {dim.score}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${getBarColor(dim.score)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${dim.score}%` }}
                  transition={{ duration: 0.8, delay: 0.6 + i * 0.1, ease: "easeOut" }}
                />
              </div>
              <p className="text-[11px] text-white/25">{dim.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
