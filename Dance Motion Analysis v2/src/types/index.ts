// ── Pose & Landmark Types ──────────────────────────────────────────

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface FramePose {
  frame: number;
  timestamp: number;
  landmarks: Landmark[];
}

export interface PoseData {
  fps: number;
  totalFrames: number;
  frames: FramePose[];
}

// ── Video & Upload Types ───────────────────────────────────────────

export type VideoRole = "reference" | "practice";

export interface VideoFile {
  id: string;
  role: VideoRole;
  name: string;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
}

export interface UploadState {
  reference: VideoFile | null;
  practice: VideoFile | null;
}

// ── Analysis Types ─────────────────────────────────────────────────

export interface JointAngle {
  name: string;
  angle: number;
}

export interface FrameComparison {
  frame: number;
  similarity: number;
  jointAngles: {
    name: string;
    referenceAngle: number;
    practiceAngle: number;
    deviation: number;
  }[];
}

export interface Deviation {
  joint: string;
  averageDeviation: number;
  message: string;
  severity: "good" | "warning" | "error";
}

export type IssueType = "timing" | "pose" | "range" | "missing" | "highlight";

export interface TimelineIssue {
  frame: number;
  timestamp: number;
  type: IssueType;
  severity: "good" | "warning" | "error";
  title: string;
  description: string;
}

export interface CoachingTip {
  category: "praise" | "timing" | "pose" | "range" | "general";
  message: string;
  relatedFrame?: number;
}

export interface DimensionScore {
  label: string;
  score: number;
  description: string;
}

export interface AnalysisResult {
  overallScore: number;
  dimensions: DimensionScore[];
  frameComparisons: FrameComparison[];
  deviations: Deviation[];
  topErrors: Deviation[];
  timelineIssues: TimelineIssue[];
  coachingTips: CoachingTip[];
  alignmentOffset: number; // frames offset applied (positive = practice starts later)
  syncMethod: "audio" | "motion"; // which alignment method was used
}

// ── App State ──────────────────────────────────────────────────────

export type AppStage = "upload" | "processing" | "results";

export interface AppState {
  stage: AppStage;
  videos: UploadState;
  referencePose: PoseData | null;
  practicePose: PoseData | null;
  analysis: AnalysisResult | null;
  currentFrame: number;
  isPlaying: boolean;
}
