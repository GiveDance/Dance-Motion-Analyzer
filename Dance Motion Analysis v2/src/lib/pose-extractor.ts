import {
  PoseLandmarker,
  FilesetResolver,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { FramePose, PoseData } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedVision: any = null;

async function getVision() {
  if (!cachedVision) {
    cachedVision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
  }
  return cachedVision;
}

async function createLandmarker(): Promise<PoseLandmarker> {
  const vision = await getVision();
  const options = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    },
    runningMode: "VIDEO" as const,
    numPoses: 1,
  };

  try {
    return await PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" },
    });
  } catch {
    console.warn("GPU delegate failed, falling back to CPU");
    return await PoseLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
  }
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    video.oncanplay = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video"));
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

export async function extractPoseFromVideo(
  videoUrl: string,
  onProgress?: (progress: number) => void
): Promise<PoseData> {
  const poseLandmarker = await createLandmarker();

  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  if (!videoUrl.startsWith("blob:")) {
    video.crossOrigin = "anonymous";
  }
  video.preload = "auto";
  video.load();

  await waitForVideoReady(video);

  const duration = video.duration;
  const fps = 10;
  const totalFrames = Math.floor(duration * fps);
  const frames: FramePose[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const targetTime = i / fps;
    await seekTo(video, targetTime);

    const timestampMs = i * 100 + 1;

    try {
      const result: PoseLandmarkerResult =
        poseLandmarker.detectForVideo(video, timestampMs);

      if (result.landmarks && result.landmarks.length > 0) {
        frames.push({
          frame: i,
          timestamp: targetTime,
          landmarks: result.landmarks[0].map((lm) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 0,
          })),
        });
      }
    } catch (e) {
      console.warn(`Frame ${i} failed:`, e);
    }

    onProgress?.(((i + 1) / totalFrames) * 100);
  }

  poseLandmarker.close();
  video.src = "";
  video.load();

  if (frames.length === 0) {
    throw new Error(
      "No pose landmarks detected. Ensure the video shows a person with visible body."
    );
  }

  return { fps, totalFrames: frames.length, frames };
}
