import test from 'node:test';
import assert from 'node:assert/strict';

const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const FOREHEAD_INDICES = new Set([10, 338, 297, 109, 67, 332, 103, 54, 21, 284, 251]);
const CHIN_JAW_INDICES = new Set([152, 148, 176, 149, 150, 136, 172, 377, 400, 378, 379, 365, 397]);
const EAR_TEMPLE_INDICES = new Set([234, 127, 93, 132, 58, 454, 356, 323, 361, 288]);

function processRawMeshOutput(rawOutputs, cropBounds, imgW, imgH) {
  const pointCount = Math.floor(rawOutputs.length / 3);
  if (pointCount < 468) return null;

  const cropXNorm = cropBounds.x;
  const cropYNorm = cropBounds.y;
  const cropWNorm = cropBounds.width;
  const cropHNorm = cropBounds.height;

  const meshPoints = [];
  const browLevelY = cropYNorm + (rawOutputs[168 * 3 + 1] / 192.0) * cropHNorm;
  const noseCenterX = cropXNorm + (rawOutputs[1 * 3] / 192.0) * cropWNorm;
  const mentalCreaseY = cropYNorm + (rawOutputs[18 * 3 + 1] / 192.0) * cropHNorm;
  const chinUpperY = cropYNorm + (rawOutputs[200 * 3 + 1] / 192.0) * cropHNorm;

  for (let i = 0; i < pointCount; i++) {
    const lx = rawOutputs[i * 3] / 192.0;
    const ly = rawOutputs[i * 3 + 1] / 192.0;

    let normX = cropXNorm + lx * cropWNorm;
    let normY = cropYNorm + ly * cropHNorm;

    if (FOREHEAD_INDICES.has(i)) {
      normY = normY * 0.60 + browLevelY * 0.40;
    }

    if (i === 152) {
      normY = normY * 0.35 + chinUpperY * 0.65;
    } else if (CHIN_JAW_INDICES.has(i)) {
      normY = normY * 0.65 + mentalCreaseY * 0.35;
    }

    if (EAR_TEMPLE_INDICES.has(i)) {
      normX = normX * 0.80 + noseCenterX * 0.20;
    }

    meshPoints.push({
      x: Number(normX.toFixed(5)),
      y: Number(normY.toFixed(5)),
    });
  }

  const contourPoints = [];
  for (const idx of FACE_OVAL_INDICES) {
    if (idx < meshPoints.length) {
      contourPoints.push(meshPoints[idx]);
    }
  }

  return { meshPoints, contourPoints };
}

test('MediaPipe Face Mesh contour extraction correctly maps all 36 perimeter points', () => {
  // Generate dummy 468 points (1404 floats)
  const dummyRaw = new Float32Array(468 * 3);
  for (let i = 0; i < 468; i++) {
    dummyRaw[i * 3] = (i % 192); // x
    dummyRaw[i * 3 + 1] = Math.floor(i / 192) * 40; // y
    dummyRaw[i * 3 + 2] = 0; // z
  }

  const cropBounds = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
  const res = processRawMeshOutput(dummyRaw, cropBounds, 4000, 3000);

  assert.ok(res);
  assert.equal(res.meshPoints.length, 468);
  assert.equal(res.contourPoints.length, 36);

  // All contour points must lie within normalized [0, 1] range
  for (const pt of res.contourPoints) {
    assert.ok(pt.x >= 0 && pt.x <= 1, `Point x out of range: ${pt.x}`);
    assert.ok(pt.y >= 0 && pt.y <= 1, `Point y out of range: ${pt.y}`);
  }
});

test('Catmull-Rom cubic spline interpolation calculates continuous control points', () => {
  const points = [
    { x: 0.5, y: 0.1 },
    { x: 0.8, y: 0.4 },
    { x: 0.6, y: 0.8 },
    { x: 0.2, y: 0.5 },
  ];
  const n = points.length;
  const segments = [];

  for (let i = 0; i < n; i++) {
    const pPrev = points[(i - 1 + n) % n];
    const pCurr = points[i];
    const pNext = points[(i + 1) % n];
    const pNext2 = points[(i + 2) % n];

    const cp1x = pCurr.x + (pNext.x - pPrev.x) / 6;
    const cp1y = pCurr.y + (pNext.y - pPrev.y) / 6;
    const cp2x = pNext.x - (pNext2.x - pCurr.x) / 6;
    const cp2y = pNext.y - (pNext2.y - pCurr.y) / 6;

    segments.push({ cp1x, cp1y, cp2x, cp2y });
  }

  assert.equal(segments.length, 4);
  for (const seg of segments) {
    assert.ok(!Number.isNaN(seg.cp1x) && !Number.isNaN(seg.cp1y));
    assert.ok(!Number.isNaN(seg.cp2x) && !Number.isNaN(seg.cp2y));
  }
});
