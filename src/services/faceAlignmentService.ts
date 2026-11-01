import { DetectedFace, NormalizedPoint } from "../types/detection";

export interface AffineMatrix3x3 {
  // [a, c, tx, b, d, ty, 0, 0, 1]
  // x' = a * x + c * y + tx
  // y' = b * x + d * y + ty
  values: number[];
}

export function compute3PointAffineMatrix(
  p1: NormalizedPoint,
  p2: NormalizedPoint,
  p3: NormalizedPoint,
  q1: NormalizedPoint,
  q2: NormalizedPoint,
  q3: NormalizedPoint
): number[] | null {
  const x1 = p1.x;
  const y1 = p1.y;
  const x2 = p2.x;
  const y2 = p2.y;
  const x3 = p3.x;
  const y3 = p3.y;

  const u1 = q1.x;
  const v1 = q1.y;
  const u2 = q2.x;
  const v2 = q2.y;
  const u3 = q3.x;
  const v3 = q3.y;

  const det = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
  if (Math.abs(det) < 1e-7) {
    return null;
  }

  // Transposed cofactor matrix (adjugate)
  const inv00 = (y2 - y3) / det;
  const inv01 = (x3 - x2) / det;
  const inv02 = (x2 * y3 - x3 * y2) / det;

  const inv10 = (y3 - y1) / det;
  const inv11 = (x1 - x3) / det;
  const inv12 = (x3 * y1 - x1 * y3) / det;

  const inv20 = (y1 - y2) / det;
  const inv21 = (x2 - x1) / det;
  const inv22 = (x1 * y2 - x2 * y1) / det;

  const a = u1 * inv00 + u2 * inv10 + u3 * inv20;
  const c = u1 * inv01 + u2 * inv11 + u3 * inv21;
  const tx = u1 * inv02 + u2 * inv12 + u3 * inv22;

  const b = v1 * inv00 + v2 * inv10 + v3 * inv20;
  const d = v1 * inv01 + v2 * inv11 + v3 * inv21;
  const ty = v1 * inv02 + v2 * inv12 + v3 * inv22;

  return [
    Number(a.toFixed(6)),
    Number(c.toFixed(6)),
    Number(tx.toFixed(6)),
    Number(b.toFixed(6)),
    Number(d.toFixed(6)),
    Number(ty.toFixed(6)),
    0,
    0,
    1,
  ];
}

export function computeBoundingBoxFallbackMatrix(
  donorFace: DetectedFace,
  baseFace: DetectedFace
): number[] {
  const donorCenterX = donorFace.bounds.x + donorFace.bounds.width / 2;
  const donorCenterY = donorFace.bounds.y + donorFace.bounds.height / 2;

  const baseCenterX = baseFace.bounds.x + baseFace.bounds.width / 2;
  const baseCenterY = baseFace.bounds.y + baseFace.bounds.height / 2;

  const scaleW =
    donorFace.bounds.width > 0
      ? baseFace.bounds.width / donorFace.bounds.width
      : 1.0;
  const scaleH =
    donorFace.bounds.height > 0
      ? baseFace.bounds.height / donorFace.bounds.height
      : 1.0;
  const scale = Math.max(0.2, Math.min(5.0, (scaleW + scaleH) / 2));

  // Rotation difference in radians
  const dThetaDeg = (baseFace.headEulerAngleZ || 0) - (donorFace.headEulerAngleZ || 0);
  const dTheta = (dThetaDeg * Math.PI) / 180;

  const cosT = Math.cos(dTheta);
  const sinT = Math.sin(dTheta);

  const a = scale * cosT;
  const b = scale * sinT;
  const c = -scale * sinT;
  const d = scale * cosT;

  const tx = baseCenterX - (a * donorCenterX + c * donorCenterY);
  const ty = baseCenterY - (b * donorCenterX + d * donorCenterY);

  return [
    Number(a.toFixed(6)),
    Number(c.toFixed(6)),
    Number(tx.toFixed(6)),
    Number(b.toFixed(6)),
    Number(d.toFixed(6)),
    Number(ty.toFixed(6)),
    0,
    0,
    1,
  ];
}

export function computeAffineAlignment(
  donorFace: DetectedFace,
  baseFace: DetectedFace
): number[] {
  const dLandmarks = donorFace.landmarks;
  const bLandmarks = baseFace.landmarks;

  if (dLandmarks && bLandmarks) {
    const dLeft = dLandmarks.leftEye;
    const dRight = dLandmarks.rightEye;
    const bLeft = bLandmarks.leftEye;
    const bRight = bLandmarks.rightEye;

    let dThird: NormalizedPoint | undefined;
    let bThird: NormalizedPoint | undefined;

    if (dLandmarks.mouthLeft && dLandmarks.mouthRight) {
      dThird = {
        x: (dLandmarks.mouthLeft.x + dLandmarks.mouthRight.x) / 2,
        y: (dLandmarks.mouthLeft.y + dLandmarks.mouthRight.y) / 2,
      };
    } else if (dLandmarks.nose) {
      dThird = dLandmarks.nose;
    }

    if (bLandmarks.mouthLeft && bLandmarks.mouthRight) {
      bThird = {
        x: (bLandmarks.mouthLeft.x + bLandmarks.mouthRight.x) / 2,
        y: (bLandmarks.mouthLeft.y + bLandmarks.mouthRight.y) / 2,
      };
    } else if (bLandmarks.nose) {
      bThird = bLandmarks.nose;
    }

    if (dLeft && dRight && dThird && bLeft && bRight && bThird) {
      const matrix = compute3PointAffineMatrix(
        dLeft,
        dRight,
        dThird,
        bLeft,
        bRight,
        bThird
      );
      if (matrix) {
        return matrix;
      }
    }
  }

  // Graceful fallback to bounding box center, scale, and Euler angles
  return computeBoundingBoxFallbackMatrix(donorFace, baseFace);
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

export function getPixelAffineMatrix(
  matrixNorm: number[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): number[] {
  const a = matrixNorm[0];
  const c = matrixNorm[1];
  const tx = matrixNorm[2];
  const b = matrixNorm[3];
  const d = matrixNorm[4];
  const ty = matrixNorm[5];

  const safeSrcW = srcW > 0 ? srcW : 1;
  const safeSrcH = srcH > 0 ? srcH : 1;
  const safeDstW = dstW > 0 ? dstW : 1;
  const safeDstH = dstH > 0 ? dstH : 1;

  // [dstW 0 0] * [a c tx] * [1/srcW 0 0]
  // [0 dstH 0]   [b d ty]   [0 1/srcH 0]
  // [0 0 1   ]   [0 0 1 ]   [0 0 1     ]
  const aPx = (a * safeDstW) / safeSrcW;
  const cPx = (c * safeDstW) / safeSrcH;
  const txPx = tx * safeDstW;

  const bPx = (b * safeDstH) / safeSrcW;
  const dPx = (d * safeDstH) / safeSrcH;
  const tyPx = ty * safeDstH;

  return [
    Number(aPx.toFixed(6)),
    Number(cPx.toFixed(6)),
    Number(txPx.toFixed(4)),
    Number(bPx.toFixed(6)),
    Number(dPx.toFixed(6)),
    Number(tyPx.toFixed(4)),
    0,
    0,
    1,
  ];
}

export interface BlendMaskGeometry {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotationAngle: number;
  featherRadius: number;
}

export function computeBlendMaskGeometry(
  baseFace: DetectedFace,
  canvasW: number,
  canvasH: number,
  featherRadiusSetting = 0.35
): BlendMaskGeometry {
  const landmarks = baseFace.landmarks;
  let centerX = (baseFace.bounds.x + baseFace.bounds.width / 2) * canvasW;
  let centerY = (baseFace.bounds.y + baseFace.bounds.height / 2) * canvasH;
  let rotationAngle = ((baseFace.headEulerAngleZ || 0) * Math.PI) / 180;

  if (landmarks?.leftEye && landmarks?.rightEye) {
    const leftX = landmarks.leftEye.x * canvasW;
    const leftY = landmarks.leftEye.y * canvasH;
    const rightX = landmarks.rightEye.x * canvasW;
    const rightY = landmarks.rightEye.y * canvasH;

    const eyeDx = rightX - leftX;
    const eyeDy = rightY - leftY;
    rotationAngle = Math.atan2(eyeDy, eyeDx);

    const eyeMidX = (leftX + rightX) / 2;
    const eyeMidY = (leftY + rightY) / 2;

    let lowerX = eyeMidX;
    let lowerY = eyeMidY + baseFace.bounds.height * canvasH * 0.35;

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

  // Tighten to inner facial contour (cheeks, forehead below hairline, jaw)
  // so original hair, ears, and neck remain unclipped.
  const radiusX = baseFace.bounds.width * 0.44 * canvasW;
  const radiusY = baseFace.bounds.height * 0.50 * canvasH;
  const featherRadius = Math.max(0.15, Math.min(0.55, featherRadiusSetting));

  return {
    centerX,
    centerY,
    radiusX,
    radiusY,
    rotationAngle,
    featherRadius,
  };
}
