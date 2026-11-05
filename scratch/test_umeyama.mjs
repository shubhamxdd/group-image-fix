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

  // In 2D, the optimal rotation angle is atan2(c21 - c12, c11 + c22)
  const num = c21 - c12;
  const den = c11 + c22;
  const theta = Math.atan2(num, den);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  // Optimal isotropic scale
  const scale = Math.max(0.2, Math.min(5.0, (den * cosT + num * sinT) / varSrc));

  const a = scale * cosT;
  const b = scale * sinT;

  const tx = muDstX - (a * muSrcX - b * muSrcY);
  const ty = muDstY - (b * muSrcX + a * muSrcY);

  return [a, -b, tx, b, a, ty, 0, 0, 1];
}

function applyTransform(m, p) {
  return {
    x: m[0] * p.x + m[1] * p.y + m[2],
    y: m[3] * p.x + m[4] * p.y + m[5],
  };
}

test('Umeyama similarity computes optimal rigid transform without shear', () => {
  const src = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 150, y: 160 },
    { x: 120, y: 220 },
    { x: 180, y: 220 },
  ];

  // Rotate by 30 deg, scale by 1.5, translate by (50, 80)
  const angle = (30 * Math.PI) / 180;
  const s = 1.5;
  const expectedA = s * Math.cos(angle);
  const expectedB = s * Math.sin(angle);
  const expectedTx = 50;
  const expectedTy = 80;

  const dst = src.map(p => ({
    x: expectedA * p.x - expectedB * p.y + expectedTx,
    y: expectedB * p.x + expectedA * p.y + expectedTy,
  }));

  const m = computeUmeyamaSimilarity(src, dst);
  assert.ok(m);

  assert.ok(Math.abs(m[0] - expectedA) < 1e-4);
  assert.ok(Math.abs(m[1] - (-expectedB)) < 1e-4);
  assert.ok(Math.abs(m[2] - expectedTx) < 1e-4);
  assert.ok(Math.abs(m[3] - expectedB) < 1e-4);
  assert.ok(Math.abs(m[4] - expectedA) < 1e-4);
  assert.ok(Math.abs(m[5] - expectedTy) < 1e-4);

  // Orthogonal, zero shear:
  assert.equal(m[0], m[4]);
  assert.equal(m[1], -m[3]);
});
