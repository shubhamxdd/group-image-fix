import { DetectedFace, NormalizedPoint } from "../types/detection";
import { applyAffineTransform } from "./faceAlignmentService";

/**
 * Generates an ordered polygon of facial boundary points in normalized coordinates (0..1).
 * Pulls down the forehead to sit just above eyebrows (preventing hairline cuts),
 * tucks inside ears and jaw (preventing collar and hair leaks),
 * and shrinks inward by shrinkFactor (default 3-5%).
 */
export function generateFaceBoundaryPolygon(
  face: DetectedFace,
  shrinkFactor = 0.04
): NormalizedPoint[] {
  const lm = face.landmarks;
  const b = face.bounds;

  const centerX = b.x + b.width / 2;
  const centerY = b.y + b.height / 2;

  // Key reference coordinates
  const leftEye = lm?.leftEye || { x: b.x + b.width * 0.32, y: b.y + b.height * 0.38 };
  const rightEye = lm?.rightEye || { x: b.x + b.width * 0.68, y: b.y + b.height * 0.38 };
  const mouthLeft = lm?.mouthLeft || { x: b.x + b.width * 0.35, y: b.y + b.height * 0.72 };
  const mouthRight = lm?.mouthRight || { x: b.x + b.width * 0.65, y: b.y + b.height * 0.72 };
  const chin = lm?.mouthBottom
    ? { x: lm.mouthBottom.x, y: Math.min(b.y + b.height * 0.95, lm.mouthBottom.y + b.height * 0.12) }
    : { x: centerX, y: b.y + b.height * 0.94 };

  const leftCheek = lm?.leftCheek || { x: b.x + b.width * 0.12, y: b.y + b.height * 0.55 };
  const rightCheek = lm?.rightCheek || { x: b.x + b.width * 0.88, y: b.y + b.height * 0.55 };

  // Forehead top anchored just above eye line, tucked below the hairline
  const eyeMidY = (leftEye.y + rightEye.y) / 2;
  const foreheadY = Math.max(b.y + b.height * 0.14, eyeMidY - b.height * 0.22);

  // Construct 12 point polygon tracing the natural anatomical boundary clockwise
  const rawPoints: NormalizedPoint[] = [
    // Forehead (below hairline)
    { x: centerX, y: foreheadY },
    { x: rightEye.x + b.width * 0.06, y: foreheadY + b.height * 0.04 },
    // Right temple & upper cheek
    { x: b.x + b.width * 0.86, y: eyeMidY + b.height * 0.05 },
    // Right cheek (tucked inside ear)
    { x: rightCheek.x, y: rightCheek.y },
    // Right jaw
    { x: mouthRight.x + b.width * 0.14, y: mouthRight.y + b.height * 0.06 },
    // Lower right chin
    { x: centerX + b.width * 0.16, y: chin.y - b.height * 0.02 },
    // Chin tip
    { x: chin.x, y: chin.y },
    // Lower left chin
    { x: centerX - b.width * 0.16, y: chin.y - b.height * 0.02 },
    // Left jaw
    { x: mouthLeft.x - b.width * 0.14, y: mouthLeft.y + b.height * 0.06 },
    // Left cheek (tucked inside ear)
    { x: leftCheek.x, y: leftCheek.y },
    // Left temple & upper cheek
    { x: b.x + b.width * 0.14, y: eyeMidY + b.height * 0.05 },
    // Forehead left
    { x: leftEye.x - b.width * 0.06, y: foreheadY + b.height * 0.04 },
  ];

  // Shrink polygon inward toward face center by shrinkFactor (e.g. 4%)
  return rawPoints.map((pt) => {
    const dx = pt.x - centerX;
    const dy = pt.y - centerY;
    return {
      x: centerX + dx * (1 - shrinkFactor),
      y: centerY + dy * (1 - shrinkFactor),
    };
  });
}

/**
 * Transforms donor boundary polygon into base photo pixel coordinates using affine matrix.
 */
export function getWarpedDonorPolygon(
  donorFace: DetectedFace,
  matrixNorm: number[],
  shrinkFactor = 0.04
): NormalizedPoint[] {
  const donorPoly = generateFaceBoundaryPolygon(donorFace, shrinkFactor);
  return donorPoly.map((pt) => applyAffineTransform(matrixNorm, pt));
}
