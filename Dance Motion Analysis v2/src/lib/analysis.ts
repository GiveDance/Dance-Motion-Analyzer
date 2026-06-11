import type { Landmark } from "@/types";
import { JOINT_ANGLES } from "./pose-constants";
import type {
  FrameComparison,
  AnalysisResult,
  Deviation,
  TimelineIssue,
  CoachingTip,
  DimensionScore,
} from "@/types";

export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };

  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2 + ab.z ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2 + cb.z ** 2);

  if (magAB === 0 || magCB === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

export function calculateJointAngles(
  landmarks: Landmark[]
): { name: string; angle: number }[] {
  return JOINT_ANGLES.map(([aIdx, bIdx, cIdx, name]) => ({
    name,
    angle: calculateAngle(landmarks[aIdx], landmarks[bIdx], landmarks[cIdx]),
  }));
}

export function compareFrame(
  referenceLandmarks: Landmark[],
  practiceLandmarks: Landmark[]
): FrameComparison {
  const refAngles = calculateJointAngles(referenceLandmarks);
  const pracAngles = calculateJointAngles(practiceLandmarks);

  const jointAngles = refAngles.map((ref, i) => {
    const prac = pracAngles[i];
    return {
      name: ref.name,
      referenceAngle: ref.angle,
      practiceAngle: prac.angle,
      deviation: Math.abs(ref.angle - prac.angle),
    };
  });

  // Cosine similarity on body landmark positions (indices 11-32, body only)
  const bodyIndices: number[] = [];
  for (let k = 11; k < Math.min(referenceLandmarks.length, 33); k++) {
    if (referenceLandmarks[k].visibility >= 0.3 && practiceLandmarks[k].visibility >= 0.3) {
      bodyIndices.push(k);
    }
  }

  let poseSimilarity = 80; // default if not enough visible joints
  if (bodyIndices.length >= 6) {
    // Normalize poses to be translation-invariant (center on midpoint of hips)
    const refCenter = {
      x: (referenceLandmarks[23].x + referenceLandmarks[24].x) / 2,
      y: (referenceLandmarks[23].y + referenceLandmarks[24].y) / 2,
    };
    const pracCenter = {
      x: (practiceLandmarks[23].x + practiceLandmarks[24].x) / 2,
      y: (practiceLandmarks[23].y + practiceLandmarks[24].y) / 2,
    };

    const refVec: number[] = [];
    const pracVec: number[] = [];
    for (const k of bodyIndices) {
      refVec.push(referenceLandmarks[k].x - refCenter.x, referenceLandmarks[k].y - refCenter.y);
      pracVec.push(practiceLandmarks[k].x - pracCenter.x, practiceLandmarks[k].y - pracCenter.y);
    }

    let dot = 0, magR = 0, magP = 0;
    for (let i = 0; i < refVec.length; i++) {
      dot += refVec[i] * pracVec[i];
      magR += refVec[i] ** 2;
      magP += pracVec[i] ** 2;
    }
    magR = Math.sqrt(magR);
    magP = Math.sqrt(magP);
    const cosineSim = (magR > 0 && magP > 0) ? dot / (magR * magP) : 0;
    // Map cosine similarity [-1, 1] to score [0, 100] with generous curve
    // cos >= 0.95 → ~95+, cos >= 0.85 → ~80+, cos >= 0.7 → ~65+
    poseSimilarity = Math.round(Math.max(0, Math.min(100, (cosineSim + 1) / 2 * 100)));
    // Apply generous curve: sqrt mapping so small differences don't drop score hard
    poseSimilarity = Math.round(Math.sqrt(poseSimilarity / 100) * 100);
  }

  // Blend: 60% pose cosine similarity, 40% angle-based (gentler)
  const avgDeviation =
    jointAngles.reduce((sum, j) => sum + j.deviation, 0) / jointAngles.length;
  const angleSimilarity = Math.max(0, Math.min(100, 100 - (avgDeviation / 60) * 100)); // was /45, now /60 = gentler
  const similarity = Math.round(poseSimilarity * 0.6 + angleSimilarity * 0.4);

  return { frame: 0, similarity, jointAngles };
}

// ── Helpers ───────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function bodyPartLabel(joint: string): string {
  return joint.toLowerCase().replace("left ", "left ").replace("right ", "right ");
}

function jointNameCN(name: string): string {
  const map: Record<string, string> = {
    "Left Elbow": "左肘",
    "Right Elbow": "右肘",
    "Left Shoulder": "左肩",
    "Right Shoulder": "右肩",
    "Left Hip": "左胯",
    "Right Hip": "右胯",
    "Left Knee": "左膝",
    "Right Knee": "右膝",
  };
  return map[name] ?? name;
}

function poseIssueDanceDesc(jointName: string, direction: string, time: string): string {
  const cn = jointNameCN(jointName);
  const part = jointName.toLowerCase();
  const isLow = direction === "伸展不足";

  if (part.includes("elbow")) {
    return isLow
      ? `${time} 这里${cn}对应的手臂没有完全打开，看起来有点拘谨，试着把手臂伸展到位。`
      : `${time} 这里手臂伸得有点过了，注意和标准动作对比一下幅度。`;
  }
  if (part.includes("shoulder")) {
    return isLow
      ? `${time} 附近肩膀有些耸起/内收，让动作看起来不够舒展。放松肩膀，感受手臂从肩部自然延伸。`
      : `${time} 附近肩膀打开得太大了，整体线条看起来不太协调，稍微收一点会更好看。`;
  }
  if (part.includes("knee")) {
    return isLow
      ? `${time} 这里腿部弯曲不够，重心偏高了。试着蹲低一些，让动作更稳、更有力量感。`
      : `${time} 这里膝盖弯得太深了，显得有些沉。稍微直一点，保持动作的轻盈感。`;
  }
  if (part.includes("hip")) {
    return isLow
      ? `${time} 附近胯部动作幅度不够，影响了整体的动感。放松胯部，让律动更自然。`
      : `${time} 附近胯部送得有点过了，注意控制幅度，和标准保持一致。`;
  }
  return `${time} 附近${cn}的位置需要调整，对照标准视频仔细看看。`;
}

function computeMovementMagnitude(landmarks: Landmark[]): number {
  let sum = 0;
  for (const lm of landmarks) {
    if (lm.visibility < 0.5) continue;
    sum += Math.sqrt(lm.x ** 2 + lm.y ** 2);
  }
  return sum;
}

// ── Auto-alignment: detect choreography start and align videos ──

function computeFrameEnergy(landmarks: Landmark[]): number {
  // Sum of body landmark positions (movement energy)
  let energy = 0;
  for (let k = 11; k < Math.min(landmarks.length, 33); k++) {
    if (landmarks[k].visibility < 0.3) continue;
    energy += Math.abs(landmarks[k].x) + Math.abs(landmarks[k].y);
  }
  return energy;
}

function computeFrameDeltas(frames: { landmarks: Landmark[] }[]): number[] {
  const deltas: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    let delta = 0;
    const a = frames[i - 1].landmarks;
    const b = frames[i].landmarks;
    for (let k = 11; k < Math.min(a.length, b.length, 33); k++) {
      if (a[k].visibility < 0.3 || b[k].visibility < 0.3) continue;
      const dx = b[k].x - a[k].x;
      const dy = b[k].y - a[k].y;
      delta += Math.sqrt(dx * dx + dy * dy);
    }
    deltas.push(delta);
  }
  return deltas;
}

function detectChoreographyStart(deltas: number[], fps: number): number {
  // Find first frame where sustained movement begins
  // Use a threshold: movement exceeding 2x the median baseline for 3+ consecutive frames
  const sorted = [...deltas].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length * 0.3)] || 0.001;
  const threshold = baseline * 3;
  const minConsecutive = Math.max(2, Math.floor(fps * 0.3));

  let consecutive = 0;
  for (let i = 0; i < deltas.length; i++) {
    if (deltas[i] > threshold) {
      consecutive++;
      if (consecutive >= minConsecutive) {
        return Math.max(0, i - minConsecutive + 1);
      }
    } else {
      consecutive = 0;
    }
  }
  return 0; // no distinct start detected, start from beginning
}

function autoAlignFrames(
  refFrames: { landmarks: Landmark[] }[],
  pracFrames: { landmarks: Landmark[] }[],
  fps: number
): { refStart: number; pracStart: number; bestLag: number } {
  const refDeltas = computeFrameDeltas(refFrames);
  const pracDeltas = computeFrameDeltas(pracFrames);

  // Detect choreography start in each video
  const refStart = detectChoreographyStart(refDeltas, fps);
  const pracStart = detectChoreographyStart(pracDeltas, fps);

  // Fine-tune alignment via cross-correlation on movement deltas
  const refD = refDeltas.slice(refStart);
  const pracD = pracDeltas.slice(pracStart);
  const len = Math.min(refD.length, pracD.length);
  const maxLag = Math.min(Math.floor(fps * 3), Math.floor(len / 3)); // up to 3 seconds

  let bestCorr = -Infinity;
  let bestLag = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < refD.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= pracD.length) continue;
      corr += refD[i] * pracD[j];
      count++;
    }
    if (count > 0) corr /= count;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  return { refStart, pracStart, bestLag };
}

function detectTimingOffset(
  refFrames: { landmarks: Landmark[] }[],
  pracFrames: { landmarks: Landmark[] }[],
  fps: number
): { offsetFrames: number; timingScore: number } {
  const len = Math.min(refFrames.length, pracFrames.length);
  // Compute per-frame movement delta
  const refDeltas: number[] = [];
  const pracDeltas: number[] = [];
  for (let i = 1; i < len; i++) {
    const refMag0 = computeMovementMagnitude(refFrames[i - 1].landmarks);
    const refMag1 = computeMovementMagnitude(refFrames[i].landmarks);
    refDeltas.push(Math.abs(refMag1 - refMag0));
    const pracMag0 = computeMovementMagnitude(pracFrames[i - 1].landmarks);
    const pracMag1 = computeMovementMagnitude(pracFrames[i].landmarks);
    pracDeltas.push(Math.abs(pracMag1 - pracMag0));
  }

  // Cross-correlation within a small lag window
  const maxLag = Math.min(Math.floor(fps * 2), Math.floor(len / 4)); // up to 2 seconds
  let bestCorr = -Infinity;
  let bestLag = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < refDeltas.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= pracDeltas.length) continue;
      corr += refDeltas[i] * pracDeltas[j];
      count++;
    }
    if (count > 0) corr /= count;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  // Timing score: penalize based on how many frames off (gentler: -25 per sec instead of -50)
  const lagSeconds = Math.abs(bestLag) / fps;
  const timingScore = Math.max(0, Math.round(100 - lagSeconds * 25));

  return { offsetFrames: bestLag, timingScore };
}

// ── Per-frame timing issues: detect where practice leads/lags ────

function detectFrameTimingIssues(
  frameComparisons: FrameComparison[],
  fps: number
): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  const windowSize = Math.max(3, Math.floor(fps * 0.5));

  // Find sudden drops in similarity (potential timing mismatches)
  for (let i = windowSize; i < frameComparisons.length - windowSize; i++) {
    const before = frameComparisons
      .slice(i - windowSize, i)
      .reduce((s, f) => s + f.similarity, 0) / windowSize;
    const current = frameComparisons[i].similarity;
    const after = frameComparisons
      .slice(i + 1, i + 1 + windowSize)
      .reduce((s, f) => s + f.similarity, 0) / windowSize;

    // A dip: current is significantly lower than surrounding averages
    if (current < before - 15 && current < after - 15 && current < 70) {
      const ts = i / fps;
      issues.push({
        frame: i,
        timestamp: ts,
        type: "timing",
        severity: current < 40 ? "error" : "warning",
        title: "节奏偏差",
        description: `${formatTime(ts)} 这里慢了半拍，试着跟紧音乐的重拍。`,
      });
      i += windowSize; // skip to avoid duplicates
    }
  }
  return issues;
}

// ── Pose issues: sustained bad joint angles ─────────────────────

function detectPoseIssues(
  frameComparisons: FrameComparison[],
  fps: number
): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  const windowSize = Math.max(3, Math.floor(fps * 0.8));

  for (let i = 0; i < frameComparisons.length - windowSize; i++) {
    const window = frameComparisons.slice(i, i + windowSize);

    for (const jointName of window[0].jointAngles.map((j) => j.name)) {
      const avgDev =
        window.reduce((s, fc) => {
          const ja = fc.jointAngles.find((j) => j.name === jointName);
          return s + (ja?.deviation ?? 0);
        }, 0) / windowSize;

      if (avgDev > 35) {
        const ts = i / fps;
        const sample = window[0].jointAngles.find((j) => j.name === jointName);
        const direction =
          sample && sample.practiceAngle < sample.referenceAngle
            ? "伸展不足"
            : "过度伸展";

        const danceDesc = poseIssueDanceDesc(jointName, direction, formatTime(ts));

        issues.push({
          frame: i,
          timestamp: ts,
          type: "pose",
          severity: avgDev > 50 ? "error" : "warning",
          title: `${jointNameCN(jointName)}需要调整`,
          description: danceDesc,
        });
        i += windowSize; // skip ahead
        break; // one issue per window
      }
    }
  }
  return issues;
}

// ── Range / completeness: detect insufficient movement ──────────

function detectRangeIssues(
  refFrames: { landmarks: Landmark[] }[],
  pracFrames: { landmarks: Landmark[] }[],
  fps: number
): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  const len = Math.min(refFrames.length, pracFrames.length);
  const windowSize = Math.max(3, Math.floor(fps));

  for (let i = 0; i < len - windowSize; i += windowSize) {
    let refRange = 0;
    let pracRange = 0;

    for (let j = i; j < i + windowSize && j < len - 1; j++) {
      for (let k = 0; k < Math.min(refFrames[j].landmarks.length, 33); k++) {
        const rDx = refFrames[j + 1].landmarks[k].x - refFrames[j].landmarks[k].x;
        const rDy = refFrames[j + 1].landmarks[k].y - refFrames[j].landmarks[k].y;
        refRange += Math.sqrt(rDx * rDx + rDy * rDy);
        const pDx = pracFrames[j + 1].landmarks[k].x - pracFrames[j].landmarks[k].x;
        const pDy = pracFrames[j + 1].landmarks[k].y - pracFrames[j].landmarks[k].y;
        pracRange += Math.sqrt(pDx * pDx + pDy * pDy);
      }
    }

    if (refRange > 0.01 && pracRange / refRange < 0.5) {
      const ts = i / fps;
      issues.push({
        frame: i,
        timestamp: ts,
        type: "range",
        severity: pracRange / refRange < 0.3 ? "error" : "warning",
        title: "动作放不开",
        description: `${formatTime(ts)} 这段动作幅度偏小，感觉有些拘谨，试着把动作做得更舒展。`,
      });
    }
  }
  return issues;
}

// ── Highlight good sections ─────────────────────────────────────

function detectHighlights(
  frameComparisons: FrameComparison[],
  fps: number
): TimelineIssue[] {
  const issues: TimelineIssue[] = [];
  const windowSize = Math.max(5, Math.floor(fps * 1.5));

  for (let i = 0; i < frameComparisons.length - windowSize; i += windowSize) {
    const window = frameComparisons.slice(i, i + windowSize);
    const avgSim = window.reduce((s, f) => s + f.similarity, 0) / windowSize;

    if (avgSim >= 75) {
      const ts = i / fps;
      const endTs = (i + windowSize) / fps;
      issues.push({
        frame: i,
        timestamp: ts,
        type: "highlight",
        severity: "good",
        title: "这段很棒！",
        description: `${formatTime(ts)} 到 ${formatTime(endTs)} 这段跳得非常到位，节奏感和动作都很棒！`,
      });
    }
  }
  return issues;
}

// ── Generate coaching tips ──────────────────────────────────────

function generateCoachingTips(
  overallScore: number,
  deviations: Deviation[],
  timelineIssues: TimelineIssue[],
  frameComparisons: FrameComparison[],
  fps: number
): CoachingTip[] {
  const tips: CoachingTip[] = [];

  // General praise
  if (overallScore >= 85) {
    tips.push({
      category: "praise",
      message: "跳得太棒了！整体动作流畅自然，和标准几乎同步，继续保持这个状态！",
    });
  } else if (overallScore >= 70) {
    tips.push({
      category: "praise",
      message: "整体节奏感不错，基本功挺扎实的！有几个地方稍微打磨一下会更完美。",
    });
  } else {
    tips.push({
      category: "general",
      message: "别灰心，每个舞者都是这样一步步练出来的！先把标记出来的重点段落反复看几遍，慢慢跟着练。",
    });
  }

  // Best section praise
  const highlights = timelineIssues.filter((i) => i.type === "highlight");
  if (highlights.length > 0) {
    const best = highlights[0];
    tips.push({
      category: "praise",
      message: `${formatTime(best.timestamp)} 这段节奏卡得很准，身体控制也很到位，就是这个感觉！`,
      relatedFrame: best.frame,
    });
  }

  // Timing tips
  const timingIssues = timelineIssues.filter((i) => i.type === "timing");
  if (timingIssues.length > 0) {
    const worst = timingIssues.sort(
      (a, b) =>
        (frameComparisons[a.frame]?.similarity ?? 100) -
        (frameComparisons[b.frame]?.similarity ?? 100)
    )[0];
    tips.push({
      category: "timing",
      message: `${formatTime(worst.timestamp)} 这里动作晚了，感觉像是在追拍子。试着提前感受音乐的节奏，让身体自然跟上。`,
      relatedFrame: worst.frame,
    });
  }
  if (timingIssues.length >= 3) {
    tips.push({
      category: "timing",
      message: "好几个地方节奏都不太稳。建议先放慢速度，把每个动作的起止点和音乐对准，熟练了再恢复原速。",
    });
  }

  // Pose tips from deviations
  const errorJoints = deviations
    .filter((d) => d.severity === "error")
    .sort((a, b) => b.averageDeviation - a.averageDeviation);

  for (const ej of errorJoints.slice(0, 2)) {
    const part = bodyPartLabel(ej.joint);
    const poseIssue = timelineIssues.find(
      (i) => i.type === "pose" && i.title.includes(ej.joint)
    );
    if (part.includes("elbow") || part.includes("shoulder")) {
      const side = part.includes("left") ? "左" : "右";
      const isArm = part.includes("elbow");
      tips.push({
        category: "pose",
        message: isArm
          ? `${side}手臂的线条和标准有差距——注意看标准动作中手臂抬到什么高度、伸出去多远，对着镜子调整一下。`
          : `${side}边肩膀的位置不太对，看起来有点紧。试着放松肩膀，让手臂的发力从肩膀自然带出来。`,
        relatedFrame: poseIssue?.frame,
      });
    } else if (part.includes("knee")) {
      const side = part.includes("left") ? "左" : "右";
      tips.push({
        category: "pose",
        message: `${side}腿在做动作的时候膝盖弯曲度和标准不一样，影响了整体的身体线条。慢动作回看一下标准视频里腿部的变化。`,
        relatedFrame: poseIssue?.frame,
      });
    } else if (part.includes("hip")) {
      tips.push({
        category: "pose",
        message: `胯部的位置有些偏，这会让整个身体的重心看起来不太稳。试着收紧核心，感受重心在双脚之间的平衡。`,
        relatedFrame: poseIssue?.frame,
      });
    }
  }

  // Range tips
  const rangeIssues = timelineIssues.filter((i) => i.type === "range");
  if (rangeIssues.length > 0) {
    tips.push({
      category: "range",
      message: `有些动作做得比较收，看起来不够舒展。舞蹈讲究"放得开"，手脚都尽量延伸到位，整个动作会更有感染力。`,
      relatedFrame: rangeIssues[0].frame,
    });
  }

  return tips;
}

// ── Dimension scores ────────────────────────────────────────────

function computeDimensions(
  frameComparisons: FrameComparison[],
  refFrames: { landmarks: Landmark[] }[],
  pracFrames: { landmarks: Landmark[] }[],
  timingScore: number,
  fps: number
): DimensionScore[] {
  const len = frameComparisons.length;

  // Pose accuracy: average similarity with generous curve (sqrt for gentler drops)
  const rawPose =
    frameComparisons.reduce((s, f) => s + f.similarity, 0) / len;
  // Apply sqrt curve so that raw 70 → 84, raw 80 → 89, raw 60 → 77
  const poseScore = Math.round(Math.min(100, Math.sqrt(rawPose / 100) * 100));

  // Movement completeness: compare total movement magnitude
  let refTotal = 0;
  let pracTotal = 0;
  for (let i = 1; i < Math.min(refFrames.length, pracFrames.length); i++) {
    for (let k = 11; k < 33; k++) {
      if (k >= refFrames[i].landmarks.length) break;
      const rdx = refFrames[i].landmarks[k].x - refFrames[i - 1].landmarks[k].x;
      const rdy = refFrames[i].landmarks[k].y - refFrames[i - 1].landmarks[k].y;
      refTotal += Math.sqrt(rdx * rdx + rdy * rdy);
      const pdx = pracFrames[i].landmarks[k].x - pracFrames[i - 1].landmarks[k].x;
      const pdy = pracFrames[i].landmarks[k].y - pracFrames[i - 1].landmarks[k].y;
      pracTotal += Math.sqrt(pdx * pdx + pdy * pdy);
    }
  }
  const completenessRatio = refTotal > 0 ? Math.min(1.3, pracTotal / refTotal) : 1;
  // More generous: ratio 0.7 → 80, ratio 0.8 → 87, ratio 1.0 → 95
  const completenessScore = Math.round(
    Math.min(100, Math.sqrt(completenessRatio) * 95)
  );

  // Consistency: standard deviation of similarity (lower = more consistent)
  // Gentler: reduce stddev penalty factor from 2.5 to 1.5
  const mean = frameComparisons.reduce((s, f) => s + f.similarity, 0) / len;
  const variance =
    frameComparisons.reduce((s, f) => s + (f.similarity - mean) ** 2, 0) / len;
  const stddev = Math.sqrt(variance);
  const consistencyScore = Math.round(Math.max(0, Math.min(100, 100 - stddev * 1.5)));

  return [
    {
      label: "节奏准确度",
      score: timingScore,
      description: timingScore >= 80
        ? "节奏卡得很准，身体和音乐融为一体"
        : timingScore >= 60
          ? "大部分节拍跟上了，个别地方慢了半拍"
          : "节奏感需要加强，多听音乐找感觉",
    },
    {
      label: "体态准确度",
      score: poseScore,
      description: poseScore >= 80
        ? "身体线条漂亮，动作到位"
        : poseScore >= 60
          ? "整体还行，部分动作的身体位置需要微调"
          : "身体姿态和标准差距较大，多对照练习",
    },
    {
      label: "动作完成度",
      score: completenessScore,
      description: completenessScore >= 80
        ? "动作舒展有力，表现力很强"
        : completenessScore >= 60
          ? "动作基本到位，但还可以更放得开"
          : "动作偏小偏收，需要更大胆地伸展",
    },
    {
      label: "稳定性",
      score: consistencyScore,
      description: consistencyScore >= 80
        ? "全程发挥稳定，没有明显波动"
        : consistencyScore >= 60
          ? "有的段落跳得好，有的段落掉了状态"
          : "状态起伏比较大，需要提高整体稳定性",
    },
  ];
}

// ── Main analysis entry point ───────────────────────────────────

export function analyzeMotion(
  referenceFrames: { landmarks: Landmark[] }[],
  practiceFrames: { landmarks: Landmark[] }[],
  fps: number = 10,
  manualOffset: number = 0, // user manual adjustment in frames
  audioOffsetSeconds?: number, // from audio sync (if available)
  audioConfidence?: number // confidence of audio sync (0-1)
): AnalysisResult {
  const useAudioSync = audioOffsetSeconds !== undefined && (audioConfidence ?? 0) >= 0.15;

  let refOffset = 0;
  let pracOffset = 0;
  let alignmentFrameOffset = 0;

  if (useAudioSync) {
    // Primary: audio-based alignment
    const audioFrameOffset = Math.round(audioOffsetSeconds! * fps);
    const totalOffset = audioFrameOffset + manualOffset;

    if (totalOffset > 0) {
      pracOffset = totalOffset; // practice starts later in the music
    } else if (totalOffset < 0) {
      refOffset = Math.abs(totalOffset);
    }
    alignmentFrameOffset = totalOffset;
  } else {
    // Fallback: motion-based alignment
    const { refStart, pracStart, bestLag } = autoAlignFrames(
      referenceFrames,
      practiceFrames,
      fps
    );

    const totalLag = bestLag + manualOffset;
    refOffset = refStart;
    pracOffset = pracStart;
    if (totalLag > 0) {
      pracOffset += totalLag;
    } else if (totalLag < 0) {
      refOffset += Math.abs(totalLag);
    }
    alignmentFrameOffset = refStart + (totalLag > 0 ? totalLag : 0);
  }

  const syncMethod = useAudioSync ? "audio" as const : "motion" as const;
  const alignedRef = referenceFrames.slice(refOffset);
  const alignedPrac = practiceFrames.slice(pracOffset);
  const frameCount = Math.min(alignedRef.length, alignedPrac.length);

  if (frameCount < 3) {
    // Not enough aligned frames — fall back to raw comparison
    return analyzeMotionRaw(referenceFrames, practiceFrames, fps, 0, syncMethod);
  }

  return analyzeMotionRaw(alignedRef, alignedPrac, fps, alignmentFrameOffset, syncMethod);
}

function analyzeMotionRaw(
  referenceFrames: { landmarks: Landmark[] }[],
  practiceFrames: { landmarks: Landmark[] }[],
  fps: number,
  alignmentOffset: number,
  syncMethod: "audio" | "motion" = "motion"
): AnalysisResult {
  const frameCount = Math.min(referenceFrames.length, practiceFrames.length);
  const frameComparisons: FrameComparison[] = [];

  for (let i = 0; i < frameCount; i++) {
    const comparison = compareFrame(
      referenceFrames[i].landmarks,
      practiceFrames[i].landmarks
    );
    frameComparisons.push({ ...comparison, frame: i });
  }

  // Timing
  const { timingScore } = detectTimingOffset(
    referenceFrames,
    practiceFrames,
    fps
  );

  // Dimension scores
  const dimensions = computeDimensions(
    frameComparisons,
    referenceFrames,
    practiceFrames,
    timingScore,
    fps
  );

  // Overall score: weighted average of dimensions
  // Rebalanced: emphasize pose and consistency, reduce timing penalty
  const weights = [0.15, 0.40, 0.20, 0.25]; // timing, pose, completeness, consistency
  const overallScore = Math.round(
    dimensions.reduce((s, d, i) => s + d.score * weights[i], 0)
  );

  // Joint deviations
  const jointDeviationMap = new Map<
    string,
    { total: number; count: number; refTotal: number; pracTotal: number }
  >();

  for (const fc of frameComparisons) {
    for (const ja of fc.jointAngles) {
      const existing = jointDeviationMap.get(ja.name) ?? {
        total: 0, count: 0, refTotal: 0, pracTotal: 0,
      };
      existing.total += ja.deviation;
      existing.count += 1;
      existing.refTotal += ja.referenceAngle;
      existing.pracTotal += ja.practiceAngle;
      jointDeviationMap.set(ja.name, existing);
    }
  }

  const deviations: Deviation[] = [];
  for (const [joint, data] of jointDeviationMap) {
    const avgDeviation = data.total / data.count;
    const avgRef = data.refTotal / data.count;
    const avgPrac = data.pracTotal / data.count;
    const severity: Deviation["severity"] =
      avgDeviation < 15 ? "good" : avgDeviation < 35 ? "warning" : "error";

    let message: string;
    if (severity === "good") {
      message = `${jointNameCN(joint)}表现不错，动作很到位`;
    } else {
      const part = joint.toLowerCase();
      if (part.includes("elbow") || part.includes("shoulder")) {
        const side = part.includes("left") ? "左" : "右";
        const partName = part.includes("elbow") ? "手臂" : "肩膀";
        message = avgPrac < avgRef
          ? `${side}${partName}可以再打开一些，看起来有点收`
          : `${side}${partName}伸得有点过了，注意控制`;
      } else if (part.includes("knee")) {
        const side = part.includes("left") ? "左" : "右";
        message = avgPrac < avgRef
          ? `${side}腿弯曲不够，需要蹲得更深一些`
          : `${side}腿可以稍微放松一点，不用绷那么直`;
      } else if (part.includes("hip")) {
        const side = part.includes("left") ? "左" : "右";
        message = `${side}边胯位有些偏，注意重心的控制`;
      } else {
        message = `${jointNameCN(joint)}的位置需要调整`;
      }
    }

    deviations.push({
      joint,
      averageDeviation: Math.round(avgDeviation * 10) / 10,
      message,
      severity,
    });
  }

  const topErrors = [...deviations]
    .filter((d) => d.severity !== "good")
    .sort((a, b) => b.averageDeviation - a.averageDeviation)
    .slice(0, 3);

  // Timeline issues
  const timingIssues = detectFrameTimingIssues(frameComparisons, fps);
  const poseIssues = detectPoseIssues(frameComparisons, fps);
  const rangeIssues = detectRangeIssues(referenceFrames, practiceFrames, fps);
  const highlights = detectHighlights(frameComparisons, fps);

  const timelineIssues = [
    ...highlights,
    ...timingIssues,
    ...poseIssues,
    ...rangeIssues,
  ].sort((a, b) => a.frame - b.frame);

  // Coaching tips
  const coachingTips = generateCoachingTips(
    overallScore,
    deviations,
    timelineIssues,
    frameComparisons,
    fps
  );

  return {
    overallScore,
    dimensions,
    frameComparisons,
    deviations,
    topErrors,
    timelineIssues,
    coachingTips,
    alignmentOffset,
    syncMethod,
  };
}
