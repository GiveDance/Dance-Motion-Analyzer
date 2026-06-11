"use client";

import { motion } from "framer-motion";
import type { CoachingTip } from "@/types";

interface FeedbackPanelProps {
  coachingTips?: CoachingTip[];
  onJumpToFrame?: (frame: number) => void;
}

function TipIcon({ category }: { category: CoachingTip["category"] }) {
  const styles: Record<string, string> = {
    praise: "bg-emerald-500/15 text-emerald-400",
    timing: "bg-purple-500/15 text-purple-400",
    pose: "bg-blue-500/15 text-blue-400",
    range: "bg-amber-500/15 text-amber-400",
    general: "bg-white/10 text-white/50",
  };
  const icons: Record<string, string> = {
    praise: "★",
    timing: "♪",
    pose: "◎",
    range: "↗",
    general: "💡",
  };
  return (
    <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${styles[category]}`}>
      {icons[category]}
    </span>
  );
}

export function FeedbackPanel({ coachingTips, onJumpToFrame }: FeedbackPanelProps) {

  return (
    <div className="space-y-6">
      {/* AI Coach Tips */}
      {coachingTips && coachingTips.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-white/12 bg-[#1c1c1c] p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">🤖</span>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">
              AI 教练
            </h3>
          </div>
          <div className="space-y-3">
            {coachingTips.map((tip, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                className="flex items-start gap-3"
              >
                <TipIcon category={tip.category} />
                <div className="flex-1 pt-0.5">
                  <p className="text-sm text-white/70 leading-relaxed">{tip.message}</p>
                  {tip.relatedFrame !== undefined && onJumpToFrame && (
                    <button
                      onClick={() => onJumpToFrame(tip.relatedFrame!)}
                      className="mt-1 text-[11px] text-[#fe2c55] hover:text-[#ff4470] transition-colors"
                    >
                      跳转到该时刻 →
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
