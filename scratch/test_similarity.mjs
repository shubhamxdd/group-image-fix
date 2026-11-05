import test from 'node:test';
import assert from 'node:assert/strict';

function computeSimilarityPixelMatrix(
  donorLandmarks,
  baseLandmarks,
  srcW,
  srcH,
  dstW,
  dstH
) {
  const pLeft = { x: donorLandmarks.leftEye.x * srcW, y: donorLandmarks.leftEye.y * srcH };
  const pRight = { x: donorLandmarks.rightEye.x * srcW, y: donorLandmarks.rightEye.y * srcH };

  const qLeft = { x: baseLandmarks.leftEye.x * dstW, y: baseLandmarks.leftEye.y * dstH };
  const qRight = { x: baseLandmarks.rightEye.x * dstW, y: baseLandmarks.rightEye.y * dstH };

  const dX = pRight.x - pLeft.x;
  const dY = pRight.y - pLeft.y;
  const srcDist = Math.hypot(dX, dY);

  const bX = qRight.x - qLeft.x;
  const bY = qRight.y - qLeft.y;
  const dstDist = Math.hypot(bX, bY);

  if (srcDist < 1 || dstDist < 1) return null;

  const scale = dstDist / srcDist;
  const srcAngle = Math.atan2(dY, dX);
  const dstAngle = Math.atan2(bY, bX);
  const theta = dstAngle - srcAngle;

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const a = scale * cosT;
  const b = scale * sinT;

  const pCenter = { x: (pLeft.x + pRight.x) / 2, y: (pLeft.y + pRight.y) / 2 };
  const qCenter = { x: (qLeft.x + qRight.x) / 2, y: (qLeft.y + qRight.y) / 2 };

  const tx = qCenter.x - (a * pCenter.x - b * pCenter.y);
  const ty = qCenter.y - (b * pCenter.x + a * pCenter.y);

  // [scaleX, skewX, transX, skewY, scaleY, transY, 0, 0, 1]
  return [a, -b, tx, b, a, ty, 0, 0, 1];
}

function applyTransform(m, p) {
  return {
    x: m[0] * p.x + m[1] * p.y + m[2],
    y: m[3] * p.x + m[4] * p.y + m[5],
  };
}

test('Similarity pixel transform works across different aspect ratios and resolutions', () => {
  const srcW = 1080;
  const srcH = 1920; // Portrait
  const dstW = 4032;
  const dstH = 3024; // Landscape

  const donor = {
    leftEye: { x: 0.40, y: 0.30 },
    rightEye: { x: 0.60, y: 0.35 },
  };

  const base = {
    leftEye: { x: 0.25, y: 0.40 },
    rightEye: { x: 0.35, y: 0.38 },
  };

  const m = computeSimilarityPixelMatrix(donor, base, srcW, srcH, dstW, dstH);
  assert.ok(m);

  const mappedLeft = applyTransform(m, { x: donor.leftEye.x * srcW, y: donor.leftEye.y * srcH });
  const mappedRight = applyTransform(m, { x: donor.rightEye.x * srcW, y: donor.rightEye.y * srcH });

  assert.ok(Math.abs(mappedLeft.x - base.leftEye.x * dstW) < 1e-3);
  assert.ok(Math.abs(mappedLeft.y - base.leftEye.y * dstH) < 1e-3);
  assert.ok(Math.abs(mappedRight.x - base.rightEye.x * dstW) < 1e-3);
  assert.ok(Math.abs(mappedRight.y - base.rightEye.y * dstH) < 1e-3);

  // Scale must be isotropic (a^2 + b^2 = scale^2)
  const effectiveScale = Math.hypot(m[0], m[3]);
  assert.ok(effectiveScale > 0);
  assert.equal(m[0], m[4]);
  assert.equal(m[1], -m[3]);
});
