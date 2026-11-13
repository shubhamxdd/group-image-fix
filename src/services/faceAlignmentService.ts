import { DetectedFace, NormalizedPoint } from "../types/detection";

export interface AffineMatrix3x3 {
  // [a, -b, tx, b, a, ty, 0, 0, 1]
  values: number[];
}

export interface BlendMaskGeometry {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotationAngle: number;
  featherRadius: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Computes the optimal 2D rigid similarity transform (isotropic scale, rotation,
 * and translation) using Umeyama's algorithm over corresponding point pairs.
 * Guarantees zero shear and identical horizontal and vertical scaling.
 */
export function computeUmeyamaSimilarity(
  srcPoints: PixelPoint[],
  dstPoints: PixelPoint[]
): number[] | null {
  const n = srcPoints.length;
  if (n < 2 || n !== dstPoints.length) {
    return null;
  }

  let muSrcX = 0;
  let muSrcY = 0;
  let muDstX = 0;
  let muDstY = 0;

  for (let i = 0; i < n; i++) {
    muSrcX += srcPoints[i].x;
    muSrcY += srcPoints[i].y;
    muDstX += dstPoints[i].x;
    muDstY += dstPoints[i].y;
  }
  muSrcX /= n;
  muSrcY /= n;
  muDstX /= n;
  muDstY /= n;

  let varSrc = 0;
  let c11 = 0;
  let c12 = 0;
  let c21 = 0;
  let c22 = 0;

  for (let i = 0; i < n; i++) {
    const sx = srcPoints[i].x - muSrcX;
    const sy = srcPoints[i].y - muSrcY;
    const dx = dstPoints[i].x - muDstX;
    const dy = dstPoints[i].y - muDstY;

    varSrc += sx * sx + sy * sy;
    c11 += dx * sx;
    c12 += dx * sy;
    c21 += dy * sx;
    c22 += dy * sy;
  }

  if (varSrc < 1e-6) {
    return null;
  }

  const num = c21 - c12;
  const den = c11 + c22;
  const theta = Math.atan2(num, den);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Optimal uniform scale clamped to safe limits
  const scale = Math.max(0.2, Math.min(5.0, (den * cosT + num * sinT) / varSrc));

  const a = scale * cosT;
  const b = scale * sinT;

  const tx = muDstX - (a * muSrcX - b * muSrcY);
  const ty = muDstY - (b * muSrcX + a * muSrcY);

  return [
    Number(a.toFixed(6)),
    Number((-b).toFixed(6)),
    Number(tx.toFixed(4)),
    Number(b.toFixed(6)),
    Number(a.toFixed(6)),
    Number(ty.toFixed(4)),
    0,
    0,
    1,
  ];
}

/**
 * Computes the exact 9 element pixel matrix mapping pixels in the donor image
 * (dimensions srcW x srcH) to matching positions on the base canvas (dstW x dstH).
 * Uses facial landmarks when available, with bounding box and orientation fallback.
 */
export function computeFaceAlignmentMatrix(
  donorFace: DetectedFace,
  baseFace: DetectedFace,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): number[] {
  const srcPoints: PixelPoint[] = [];
  const dstPoints: PixelPoint[] = [];

  const dLm = donorFace.landmarks;
  const bLm = baseFace.landmarks;

  if (dLm && bLm) {
    if (dLm.leftEye && bLm.leftEye) {
      srcPoints.push({ x: dLm.leftEye.x * srcW, y: dLm.leftEye.y * srcH });
      dstPoints.push({ x: bLm.leftEye.x * dstW, y: bLm.leftEye.y * dstH });
    }
    if (dLm.rightEye && bLm.rightEye) {
      srcPoints.push({ x: dLm.rightEye.x * srcW, y: dLm.rightEye.y * srcH });
      dstPoints.push({ x: bLm.rightEye.x * dstW, y: bLm.rightEye.y * dstH });
    }
    if (dLm.nose && bLm.nose) {
      srcPoints.push({ x: dLm.nose.x * srcW, y: dLm.nose.y * srcH });
      dstPoints.push({ x: bLm.nose.x * dstW, y: bLm.nose.y * dstH });
    }
    if (dLm.mouthLeft && bLm.mouthLeft) {
      srcPoints.push({ x: dLm.mouthLeft.x * srcW, y: dLm.mouthLeft.y * srcH });
      dstPoints.push({ x: bLm.mouthLeft.x * dstW, y: bLm.mouthLeft.y * dstH });
    }
    if (dLm.mouthRight && bLm.mouthRight) {
      srcPoints.push({ x: dLm.mouthRight.x * srcW, y: dLm.mouthRight.y * srcH });
      dstPoints.push({ x: bLm.mouthRight.x * dstW, y: bLm.mouthRight.y * dstH });
    }
  }

  if (srcPoints.length >= 2) {
    const similarity = computeUmeyamaSimilarity(srcPoints, dstPoints);
    if (similarity) {
      return similarity;
    }
  }

  // Bounding box fallback with Euler angle rotation
  const dCenter = {
    x: (donorFace.bounds.x + donorFace.bounds.width / 2) * srcW,
    y: (donorFace.bounds.y + donorFace.bounds.height / 2) * srcH,
  };
  const bCenter = {
    x: (baseFace.bounds.x + baseFace.bounds.width / 2) * dstW,
    y: (baseFace.bounds.y + baseFace.bounds.height / 2) * dstH,
  };

  const dDim = Math.hypot(donorFace.bounds.width * srcW, donorFace.bounds.height * srcH);
  const bDim = Math.hypot(baseFace.bounds.width * dstW, baseFace.bounds.height * dstH);
  const scale = dDim > 1e-4 ? Math.max(0.2, Math.min(5.0, bDim / dDim)) : 1.0;

  const rotDeg = (baseFace.headEulerAngleZ || 0) - (donorFace.headEulerAngleZ || 0);
  const theta = (rotDeg * Math.PI) / 180;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const a = scale * cosT;
  const b = scale * sinT;

  const tx = bCenter.x - (a * dCenter.x - b * dCenter.y);
  const ty = bCenter.y - (b * dCenter.x + a * dCenter.y);

  return [
    Number(a.toFixed(6)),
    Number((-b).toFixed(6)),
    Number(tx.toFixed(4)),
    Number(b.toFixed(6)),
    Number(a.toFixed(6)),
    Number(ty.toFixed(4)),
    0,
    0,
    1,
  ];
}

/**
 * Calculates the center, dimensions, and rotation angle for the face blend mask
 * on the base canvas. Focuses on the core facial features (eyes, nose, mouth)
 * so hair, ears, and neck remain untouched.
 */
export function computeBlendMaskGeometry(
  baseFace: DetectedFace,
  canvasW: number,
  canvasH: number,
  featherRadiusSetting = 0.35
): BlendMaskGeometry {
  let centerX = (baseFace.bounds.x + baseFace.bounds.width / 2) * canvasW;
  let centerY = (baseFace.bounds.y + baseFace.bounds.height / 2) * canvasH;
  let rotationAngle = ((baseFace.headEulerAngleZ || 0) * Math.PI) / 180;

  const landmarks = baseFace.landmarks;
  if (landmarks?.leftEye && landmarks?.rightEye) {
    const leftX = landmarks.leftEye.x * canvasW;
    const leftY = landmarks.leftEye.y * canvasH;
    const rightX = landmarks.rightEye.x * canvasW;
    const rightY = landmarks.rightEye.y * canvasH;

    rotationAngle = Math.atan2(rightY - leftY, rightX - leftX);

    const eyeMidX = (leftX + rightX) / 2;
    const eyeMidY = (leftY + rightY) / 2;

    let lowerX = eyeMidX;
    let lowerY = eyeMidY + baseFace.bounds.height * canvasH * 0.32;

    if (landmarks.mouthLeft && landmarks.mouthRight) {
      lowerX = ((landmarks.mouthLeft.x + landmarks.mouthRight.x) / 2) * canvasW;
      lowerY = ((landmarks.mouthLeft.y + landmarks.mouthRight.y) / 2) * canvasH;
    } else if (landmarks.nose) {
      lowerX = landmarks.nose.x * canvasW;
      lowerY = landmarks.nose.y * canvasH;
    }

    centerX = eyeMidX * 0.45 + lowerX * 0.55;
    centerY = eyeMidY * 0.45 + lowerY * 0.55;
  }

  // Inner facial ellipse: encompasses forehead below hairline, eyes, cheeks, mouth
  const radiusX = baseFace.bounds.width * 0.40 * canvasW;
  const radiusY = baseFace.bounds.height * 0.44 * canvasH;
  const featherRadius = Math.max(0.12, Math.min(0.40, featherRadiusSetting));

  return {
    centerX,
    centerY,
    radiusX,
    radiusY,
    rotationAngle,
    featherRadius,
  };
}

/**
 * Legacy adapter for callers that pass normalized coordinates.
 */
export function computeAffineAlignment(
  donorFace: DetectedFace,
  baseFace: DetectedFace
): number[] {
  return computeFaceAlignmentMatrix(donorFace, baseFace, 1000, 1000, 1000, 1000);
}

/**
 * Legacy matrix scaler.
 */
export function getPixelAffineMatrix(
  matrixNorm: number[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): number[] {
  // If matrixNorm is already in pixel coordinates (e.g. from computeFaceAlignmentMatrix)
  // or if srcW/srcH match the normalized range
  return matrixNorm;
}

export function applyAffineTransform(
  matrix: number[],
  point: NormalizedPoint
): NormalizedPoint {
  const a = matrix[0];
  const c = matrix[1];
  const tx = matrix[2];
  const b = matrix[3];
  const d = matrix[4];
  const ty = matrix[5];

  const x = a * point.x + c * point.y + tx;
  const y = b * point.x + d * point.y + ty;

  return {
    x: Number(x.toFixed(6)),
    y: Number(y.toFixed(6)),
  };
}
