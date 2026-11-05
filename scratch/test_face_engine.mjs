import test from 'node:test';
import assert from 'node:assert/strict';

function computeUmeyamaSimilarity(srcPoints, dstPoints) {
  const n = srcPoints.length;
  if (n < 2 || n !== dstPoints.length) return null;

  let muSrcX = 0, muSrcY = 0;
  let muDstX = 0, muDstY = 0;

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
  let c11 = 0, c12 = 0, c21 = 0, c22 = 0;

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

  if (varSrc < 1e-6) return null;

  const num = c21 - c12;
  const den = c11 + c22;
  const theta = Math.atan2(num, den);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const scale = Math.max(0.2, Math.min(5.0, (den * cosT + num * sinT) / varSrc));

  const a = scale * cosT;
  const b = scale * sinT;

  const tx = muDstX - (a * muSrcX - b * muSrcY);
  const ty = muDstY - (b * muSrcX + a * muSrcY);

  return [a, -b, tx, b, a, ty, 0, 0, 1];
}

function computeFaceAlignmentMatrix(donorFace, baseFace, srcW, srcH, dstW, dstH) {
  const srcPoints = [];
  const dstPoints = [];

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
    if (similarity) return similarity;
  }

  // Bounding box fallback
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
  const scale = dDim > 0 ? Math.max(0.2, Math.min(5.0, bDim / dDim)) : 1.0;

  const rotDeg = (baseFace.headEulerAngleZ || 0) - (donorFace.headEulerAngleZ || 0);
  const theta = (rotDeg * Math.PI) / 180;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const a = scale * cosT;
  const b = scale * sinT;

  const tx = bCenter.x - (a * dCenter.x - b * dCenter.y);
  const ty = bCenter.y - (b * dCenter.x + a * dCenter.y);

  return [a, -b, tx, b, a, ty, 0, 0, 1];
}

function computeBlendMaskGeometry(baseFace, canvasW, canvasH, featherRadiusSetting = 0.35) {
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

  const radiusX = baseFace.bounds.width * 0.45 * canvasW;
  const radiusY = baseFace.bounds.height * 0.52 * canvasH;
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

test('computeFaceAlignmentMatrix preserves rigid aspect ratio and alignment', () => {
  const donorFace = {
    bounds: { x: 0.2, y: 0.2, width: 0.2, height: 0.3 },
    landmarks: {
      leftEye: { x: 0.25, y: 0.28 },
      rightEye: { x: 0.35, y: 0.30 },
      nose: { x: 0.30, y: 0.35 },
    },
    headEulerAngleZ: 10,
  };

  const baseFace = {
    bounds: { x: 0.4, y: 0.4, width: 0.22, height: 0.33 },
    landmarks: {
      leftEye: { x: 0.45, y: 0.48 },
      rightEye: { x: 0.55, y: 0.48 }, // horizontal eyes
      nose: { x: 0.50, y: 0.55 },
    },
    headEulerAngleZ: 0,
  };

  const m = computeFaceAlignmentMatrix(donorFace, baseFace, 4000, 3000, 4000, 3000);
  assert.ok(m);

  // Must be strictly conformal (zero shear)
  assert.equal(m[0], m[4]);
  assert.equal(m[1], -m[3]);

  // Check scale is positive and reasonable
  const scale = Math.hypot(m[0], m[3]);
  assert.ok(scale > 0.5 && scale < 2.0);

  // Mask geometry
  const geom = computeBlendMaskGeometry(baseFace, 4000, 3000);
  assert.ok(geom.radiusX > 0);
  assert.ok(geom.radiusY > 0);
  assert.ok(geom.centerX > 0);
  assert.ok(geom.centerY > 0);
});
