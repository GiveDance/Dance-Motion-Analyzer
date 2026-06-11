// ── Audio-based video synchronization ─────────────────────────────
// Extract audio from video, detect beats via onset energy, and
// cross-correlate beat patterns to find the best alignment offset.

export interface AudioSyncResult {
  /** Offset in seconds: positive means practice audio starts later */
  offsetSeconds: number;
  /** Confidence 0-1 of the audio-based alignment */
  confidence: number;
  /** Beat timestamps (seconds) detected in reference */
  refBeats: number[];
  /** Beat timestamps (seconds) detected in practice */
  pracBeats: number[];
}

// ── Extract raw audio samples from a video blob URL ─────────────

async function decodeAudioFromVideo(
  videoUrl: string
): Promise<{ samples: Float32Array; sampleRate: number } | null> {
  try {
    const response = await fetch(videoUrl);
    const arrayBuffer = await response.arrayBuffer();

    // Decode at a lower sample rate for efficiency (enough for beat detection)
    const targetSampleRate = 22050;
    const offlineCtx = new OfflineAudioContext(1, 1, targetSampleRate);

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
    } catch {
      // Some video formats may not have audio or be unsupported
      return null;
    }

    // Re-decode at proper length
    const duration = audioBuffer.duration;
    const totalSamples = Math.ceil(duration * targetSampleRate);
    const ctx = new OfflineAudioContext(1, totalSamples, targetSampleRate);
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    const rendered = await ctx.startRendering();
    return {
      samples: rendered.getChannelData(0),
      sampleRate: rendered.sampleRate,
    };
  } catch {
    return null;
  }
}

// ── Compute onset strength envelope ─────────────────────────────

function computeOnsetEnvelope(
  samples: Float32Array,
  sampleRate: number,
  hopSize: number = 512
): { envelope: Float32Array; hopRate: number } {
  const frameSize = hopSize * 2;
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);
  if (numFrames < 2) {
    return { envelope: new Float32Array(0), hopRate: sampleRate / hopSize };
  }

  // Compute spectral energy per frame using simple energy (sum of squares)
  const energies = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    let energy = 0;
    for (let j = start; j < start + frameSize && j < samples.length; j++) {
      energy += samples[j] * samples[j];
    }
    energies[i] = energy;
  }

  // Onset strength = positive first-order difference of energy (half-wave rectified)
  const envelope = new Float32Array(numFrames);
  for (let i = 1; i < numFrames; i++) {
    const diff = energies[i] - energies[i - 1];
    envelope[i] = diff > 0 ? diff : 0;
  }

  return { envelope, hopRate: sampleRate / hopSize };
}

// ── Detect beat positions from onset envelope ───────────────────

function detectBeats(
  envelope: Float32Array,
  hopRate: number,
  minBPM: number = 60,
  maxBPM: number = 200
): number[] {
  if (envelope.length < 10) return [];

  // Adaptive threshold: local mean + std * factor
  const windowSize = Math.round(hopRate * 0.5); // 0.5 second window
  const beats: number[] = [];
  const minInterval = (60 / maxBPM) * hopRate; // min frames between beats
  let lastBeat = -minInterval;

  for (let i = 1; i < envelope.length - 1; i++) {
    // Local statistics
    const wStart = Math.max(0, i - windowSize);
    const wEnd = Math.min(envelope.length, i + windowSize);
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let j = wStart; j < wEnd; j++) {
      sum += envelope[j];
      sumSq += envelope[j] * envelope[j];
      count++;
    }
    const mean = sum / count;
    const std = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
    const threshold = mean + std * 1.2;

    // Peak detection: local maximum above threshold
    if (
      envelope[i] > threshold &&
      envelope[i] > envelope[i - 1] &&
      envelope[i] >= envelope[i + 1] &&
      i - lastBeat >= minInterval
    ) {
      beats.push(i / hopRate); // convert to seconds
      lastBeat = i;
    }
  }

  return beats;
}

// ── Cross-correlate beat patterns to find best offset ───────────

function crossCorrelateBeatPatterns(
  refBeats: number[],
  pracBeats: number[],
  maxOffsetSeconds: number = 15,
  resolution: number = 0.05 // 50ms steps
): { offsetSeconds: number; confidence: number } {
  if (refBeats.length < 3 || pracBeats.length < 3) {
    return { offsetSeconds: 0, confidence: 0 };
  }

  // Convert beats to a binary-ish signal on a common time grid
  const totalDuration = Math.max(
    refBeats[refBeats.length - 1],
    pracBeats[pracBeats.length - 1]
  ) + maxOffsetSeconds;
  const gridSize = Math.ceil(totalDuration / resolution);

  // Create beat density signals (Gaussian-smoothed)
  const sigma = 0.08 / resolution; // ~80ms spread
  const refSignal = new Float32Array(gridSize);
  const pracSignal = new Float32Array(gridSize);

  for (const t of refBeats) {
    const center = Math.round(t / resolution);
    for (let i = Math.max(0, center - 10); i < Math.min(gridSize, center + 10); i++) {
      const dist = i - center;
      refSignal[i] += Math.exp(-(dist * dist) / (2 * sigma * sigma));
    }
  }
  for (const t of pracBeats) {
    const center = Math.round(t / resolution);
    for (let i = Math.max(0, center - 10); i < Math.min(gridSize, center + 10); i++) {
      const dist = i - center;
      pracSignal[i] += Math.exp(-(dist * dist) / (2 * sigma * sigma));
    }
  }

  // Cross-correlation
  const maxLagSteps = Math.round(maxOffsetSeconds / resolution);
  let bestCorr = -Infinity;
  let bestLag = 0;
  let totalCorr = 0;
  let corrCount = 0;

  for (let lag = -maxLagSteps; lag <= maxLagSteps; lag++) {
    let corr = 0;
    let count = 0;
    for (let i = 0; i < refSignal.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= pracSignal.length) continue;
      corr += refSignal[i] * pracSignal[j];
      count++;
    }
    if (count > 0) corr /= count;
    totalCorr += corr;
    corrCount++;

    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  // Confidence: ratio of best correlation to mean correlation
  const meanCorr = totalCorr / corrCount;
  const confidence = meanCorr > 0 ? Math.min(1, (bestCorr / meanCorr - 1) / 3) : 0;

  return {
    offsetSeconds: bestLag * resolution,
    confidence: Math.max(0, confidence),
  };
}

// ── Main entry: synchronize two videos via audio ────────────────

export async function syncViaAudio(
  refVideoUrl: string,
  pracVideoUrl: string,
  onProgress?: (stage: string) => void
): Promise<AudioSyncResult | null> {
  onProgress?.("正在提取标准视频音频...");
  const refAudio = await decodeAudioFromVideo(refVideoUrl);
  if (!refAudio) return null;

  onProgress?.("正在提取练习视频音频...");
  const pracAudio = await decodeAudioFromVideo(pracVideoUrl);
  if (!pracAudio) return null;

  onProgress?.("正在分析音乐节拍...");
  const refOnset = computeOnsetEnvelope(refAudio.samples, refAudio.sampleRate);
  const pracOnset = computeOnsetEnvelope(pracAudio.samples, pracAudio.sampleRate);

  if (refOnset.envelope.length < 10 || pracOnset.envelope.length < 10) {
    return null;
  }

  const refBeats = detectBeats(refOnset.envelope, refOnset.hopRate);
  const pracBeats = detectBeats(pracOnset.envelope, pracOnset.hopRate);

  onProgress?.("正在对齐音乐节拍...");
  const { offsetSeconds, confidence } = crossCorrelateBeatPatterns(
    refBeats,
    pracBeats
  );

  return {
    offsetSeconds,
    confidence,
    refBeats,
    pracBeats,
  };
}
