"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { VideoFile, PoseData, AnalysisResult, AppStage } from "@/types";
import { VideoUploadCard } from "@/components/VideoUploadCard";
import { ScoreCard } from "@/components/ScoreCard";
import { SkeletonCanvas } from "@/components/SkeletonCanvas";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { Timeline } from "@/components/Timeline";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { extractPoseFromVideo } from "@/lib/pose-extractor";
import { analyzeMotion } from "@/lib/analysis";
import { syncViaAudio } from "@/lib/audio-sync";
import type { AudioSyncResult } from "@/lib/audio-sync";

export default function Home() {
  const [stage, setStage] = useState<AppStage>("upload");
  const [referenceVideo, setReferenceVideo] = useState<VideoFile | null>(null);
  const [practiceVideo, setPracticeVideo] = useState<VideoFile | null>(null);
  const [referencePose, setReferencePose] = useState<PoseData | null>(null);
  const [practicePose, setPracticePose] = useState<PoseData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [alignmentOffset, setAlignmentOffset] = useState(0);
  const [audioSync, setAudioSync] = useState<AudioSyncResult | null>(null);

  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying || !referencePose || !practicePose) return;
    const totalFrames = Math.min(referencePose.frames.length, practicePose.frames.length);
    const fps = referencePose.fps * playbackSpeed;

    const animate = (time: number) => {
      if (time - lastTimeRef.current > 1000 / fps) {
        lastTimeRef.current = time;
        setCurrentFrame((prev) => {
          if (prev >= totalFrames - 1) { setIsPlaying(false); return 0; }
          return prev + 1;
        });
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, referencePose, practicePose, playbackSpeed]);

  const handleAnalyze = useCallback(async () => {
    if (!referenceVideo || !practiceVideo) return;
    setStage("processing");
    setError(null);

    try {
      // Step 1: Audio sync (try first, non-blocking)
      setProcessingStage("正在分析音乐节拍，对齐视频...");
      setProcessingProgress(5);
      let syncResult: AudioSyncResult | null = null;
      try {
        syncResult = await syncViaAudio(
          referenceVideo.url,
          practiceVideo.url,
          (stage) => setProcessingStage(stage)
        );
      } catch {
        // Audio sync failed, will fall back to motion-based
      }
      setAudioSync(syncResult);
      setProcessingProgress(15);

      // Step 2: Extract poses
      setProcessingStage("正在提取标准视频姿态...");
      const refPose = await extractPoseFromVideo(referenceVideo.url, (p) =>
        setProcessingProgress(15 + p * 0.35)
      );
      setReferencePose(refPose);

      setProcessingStage("正在提取练习视频姿态...");
      const pracPose = await extractPoseFromVideo(practiceVideo.url, (p) =>
        setProcessingProgress(50 + p * 0.35)
      );
      setPracticePose(pracPose);

      // Step 3: Analyze with alignment
      setProcessingStage(
        syncResult && syncResult.confidence >= 0.15
          ? "音乐对齐成功，正在分析动作..."
          : "使用动作模式对齐，正在分析..."
      );
      setProcessingProgress(90);
      const result = analyzeMotion(
        refPose.frames,
        pracPose.frames,
        refPose.fps,
        0,
        syncResult?.offsetSeconds,
        syncResult?.confidence
      );
      setAnalysis(result);
      setAlignmentOffset(0);
      setProcessingProgress(100);
      setCurrentFrame(0);

      await new Promise((r) => setTimeout(r, 500));
      setStage("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setStage("upload");
    }
  }, [referenceVideo, practiceVideo]);

  const handleReset = useCallback(() => {
    if (referenceVideo) URL.revokeObjectURL(referenceVideo.url);
    if (practiceVideo) URL.revokeObjectURL(practiceVideo.url);
    setStage("upload");
    setReferenceVideo(null);
    setPracticeVideo(null);
    setReferencePose(null);
    setPracticePose(null);
    setAnalysis(null);
    setCurrentFrame(0);
    setIsPlaying(false);
    setProcessingProgress(0);
    setError(null);
    setAlignmentOffset(0);
    setAudioSync(null);
  }, [referenceVideo, practiceVideo]);

  const canAnalyze = referenceVideo && practiceVideo;

  const handleAlignmentChange = useCallback((newOffset: number) => {
    if (!referencePose || !practicePose) return;
    setAlignmentOffset(newOffset);
    const result = analyzeMotion(
      referencePose.frames,
      practicePose.frames,
      referencePose.fps,
      newOffset,
      audioSync?.offsetSeconds,
      audioSync?.confidence
    );
    setAnalysis(result);
    setCurrentFrame(0);
  }, [referencePose, practicePose, audioSync]);

  const totalFrames = referencePose && practicePose
    ? Math.min(referencePose.frames.length, practicePose.frames.length) : 0;
  const currentRefLandmarks = referencePose?.frames[currentFrame]?.landmarks ?? null;
  const currentPracLandmarks = practicePose?.frames[currentFrame]?.landmarks ?? null;
  const similarities = analysis?.frameComparisons.map((fc) => fc.similarity);

  return (
    <div className="min-h-screen bg-[#121212]">
      <header className="border-b border-white/8 backdrop-blur-xl bg-[#121212]/80 sticky top-0 z-50">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#fe2c55] to-[#ff6f61]">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              舞蹈动作分析
            </h1>
          </div>
          {stage === "results" && (
            <button onClick={handleReset} className="text-sm text-white/50 hover:text-white transition-colors px-4 py-1.5 rounded-full border border-white/10 hover:border-white/20 hover:bg-white/5">
              重新分析
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <AnimatePresence mode="wait">
          {stage === "upload" && (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
              <div className="text-center space-y-3">
                <h2 className="text-3xl font-bold text-white tracking-tight">对比你的舞蹈</h2>
                <p className="text-sm text-white/60">上传标准视频和你的练习视频，获取即时动作反馈</p>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </motion.div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <VideoUploadCard role="reference" video={referenceVideo} onUpload={setReferenceVideo}
                  onRemove={() => { if (referenceVideo) URL.revokeObjectURL(referenceVideo.url); setReferenceVideo(null); }} />
                <VideoUploadCard role="practice" video={practiceVideo} onUpload={setPracticeVideo}
                  onRemove={() => { if (practiceVideo) URL.revokeObjectURL(practiceVideo.url); setPracticeVideo(null); }} />
              </div>

              <div className="flex justify-center">
                <motion.button onClick={handleAnalyze} disabled={!canAnalyze}
                  whileHover={canAnalyze ? { scale: 1.02 } : undefined}
                  whileTap={canAnalyze ? { scale: 0.98 } : undefined}
                  className={`px-8 py-3 rounded-full text-sm font-semibold transition-all ${
                    canAnalyze
                      ? "bg-gradient-to-r from-[#fe2c55] to-[#ff6f61] text-white shadow-lg shadow-[#fe2c55]/25 hover:shadow-[#fe2c55]/40"
                      : "bg-white/5 text-white/30 cursor-not-allowed"
                  }`}>
                  开始分析
                </motion.button>
              </div>
            </motion.div>
          )}

          {stage === "processing" && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ProcessingOverlay progress={processingProgress} stage={processingStage} />
            </motion.div>
          )}

          {stage === "results" && analysis && (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
              <ScoreCard analysis={analysis} />
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-white/30">骨骼对比</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <SkeletonCanvas
                    landmarks={currentRefLandmarks}
                    label="标准动作"
                    color="#00f2ea"
                    videoUrl={referenceVideo?.url}
                    currentTime={referencePose ? currentFrame / referencePose.fps : 0}
                  />
                  <SkeletonCanvas
                    landmarks={currentPracLandmarks}
                    label="练习动作"
                    color="#fe2c55"
                    videoUrl={practiceVideo?.url}
                    currentTime={practicePose ? currentFrame / practicePose.fps : 0}
                  />
                </div>
              </div>
              <Timeline currentFrame={currentFrame} totalFrames={totalFrames} isPlaying={isPlaying}
                onFrameChange={setCurrentFrame} onPlayPause={() => setIsPlaying((p) => !p)} similarities={similarities}
                issues={analysis.timelineIssues}
                playbackSpeed={playbackSpeed} onSpeedChange={setPlaybackSpeed}
                alignmentOffset={alignmentOffset} onAlignmentOffsetChange={handleAlignmentChange}
                fps={referencePose?.fps ?? 10} syncMethod={analysis.syncMethod} />
              <FeedbackPanel
                coachingTips={analysis.coachingTips} onJumpToFrame={(frame) => { setCurrentFrame(frame); setIsPlaying(false); }} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-white/5 mt-20">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <p className="text-xs text-white/20 text-center">舞蹈动作分析 · 基于 MediaPipe</p>
        </div>
      </footer>
    </div>
  );
}
