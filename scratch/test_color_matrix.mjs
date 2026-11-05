import test from 'node:test';
import assert from 'node:assert/strict';

function computeColorStats(rgba) {
  let sumR = 0, sumG = 0, sumB = 0;
  const count = rgba.length / 4;
  if (count === 0) return null;

  for (let i = 0; i < rgba.length; i += 4) {
    sumR += rgba[i];
    sumG += rgba[i + 1];
    sumB += rgba[i + 2];
  }

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;

  let sqR = 0, sqG = 0, sqB = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const dR = rgba[i] - meanR;
    const dG = rgba[i + 1] - meanG;
    const dB = rgba[i + 2] - meanB;
    sqR += dR * dR;
    sqG += dG * dG;
    sqB += dB * dB;
  }

  const stdR = Math.max(1, Math.sqrt(sqR / count));
  const stdG = Math.max(1, Math.sqrt(sqG / count));
  const stdB = Math.max(1, Math.sqrt(sqB / count));

  return { meanR, meanG, meanB, stdR, stdG, stdB };
}

function computeSkinToneColorMatrix(donorRgba, baseRgba, strength = 0.7) {
  const donorStats = computeColorStats(donorRgba);
  const baseStats = computeColorStats(baseRgba);

  if (!donorStats || !baseStats) {
    return [
      1, 0, 0, 0, 0,
      0, 1, 0, 0, 0,
      0, 0, 1, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }

  const rawScaleR = Math.max(0.8, Math.min(1.25, baseStats.stdR / donorStats.stdR));
  const rawScaleG = Math.max(0.8, Math.min(1.25, baseStats.stdG / donorStats.stdG));
  const rawScaleB = Math.max(0.8, Math.min(1.25, baseStats.stdB / donorStats.stdB));

  const sR = 1.0 + strength * (rawScaleR - 1.0);
  const sG = 1.0 + strength * (rawScaleG - 1.0);
  const sB = 1.0 + strength * (rawScaleB - 1.0);

  const rawOffR = (baseStats.meanR - donorStats.meanR * sR) / 255;
  const rawOffG = (baseStats.meanG - donorStats.meanG * sG) / 255;
  const rawOffB = (baseStats.meanB - donorStats.meanB * sB) / 255;

  const oR = Math.max(-0.15, Math.min(0.15, strength * rawOffR));
  const oG = Math.max(-0.15, Math.min(0.15, strength * rawOffG));
  const oB = Math.max(-0.15, Math.min(0.15, strength * rawOffB));

  return [
    sR, 0,  0,  0, oR,
    0,  sG, 0,  0, oG,
    0,  0,  sB, 0, oB,
    0,  0,  0,  1, 0,
  ];
}

test('Color matrix adjusts tones smoothly and stays within safe limits', () => {
  // Donor is cooler (R: 170, G: 160, B: 180)
  const donorRgba = new Uint8Array(256 * 4);
  for (let i = 0; i < donorRgba.length; i += 4) {
    donorRgba[i] = 170;
    donorRgba[i + 1] = 160;
    donorRgba[i + 2] = 180;
    donorRgba[i + 3] = 255;
  }

  // Base is warmer (R: 200, G: 170, B: 150)
  const baseRgba = new Uint8Array(256 * 4);
  for (let i = 0; i < baseRgba.length; i += 4) {
    baseRgba[i] = 200;
    baseRgba[i + 1] = 170;
    baseRgba[i + 2] = 150;
    baseRgba[i + 3] = 255;
  }

  const mat = computeSkinToneColorMatrix(donorRgba, baseRgba, 0.7);
  assert.equal(mat.length, 20);

  // Red offset must be positive (warmer red)
  assert.ok(mat[4] > 0);
  // Blue offset must be negative (cooler blue reduced)
  assert.ok(mat[14] < 0);
  // Alpha remains 1.0 identity
  assert.equal(mat[18], 1);
  assert.equal(mat[19], 0);
});
