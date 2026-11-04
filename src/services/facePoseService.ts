import { DetectedFace } from "../types/detection";

export interface PoseCompatibilityResult {
  isCompatible: boolean;
  dYaw: number;
  dPitch: number;
  dRoll: number;
  posePenalty: number;
  adjustedScore: number;
}

export function evaluatePoseCompatibility(
  baseFace: DetectedFace,
  donorFace: DetectedFace,
  maxAngleThresholdDeg = 8
): PoseCompatibilityResult {
  const dYaw = Math.abs(
    (donorFace.headEulerAngleY || 0) - (baseFace.headEulerAngleY || 0)
  );
  const dPitch = Math.abs(
    (donorFace.headEulerAngleX || 0) - (baseFace.headEulerAngleX || 0)
  );
  const dRoll = Math.abs(
    (donorFace.headEulerAngleZ || 0) - (baseFace.headEulerAngleZ || 0)
  );

  const isCompatible =
    dYaw <= maxAngleThresholdDeg && dPitch <= maxAngleThresholdDeg;

  // Soft penalty proportional to angle discrepancy: w1 * dYaw + w2 * dPitch
  const posePenalty = 0.02 * dYaw + 0.02 * dPitch;
  const adjustedScore = Math.max(
    0,
    Number((donorFace.qualityScore - posePenalty).toFixed(4))
  );

  return {
    isCompatible,
    dYaw: Number(dYaw.toFixed(1)),
    dPitch: Number(dPitch.toFixed(1)),
    dRoll: Number(dRoll.toFixed(1)),
    posePenalty: Number(posePenalty.toFixed(4)),
    adjustedScore,
  };
}
