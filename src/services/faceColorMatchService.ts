import type { SkImage } from "@shopify/react-native-skia";
import { DetectedFace, NormalizedRect } from "../types/detection";

interface ChannelStats {
  meanR: number;
  meanG: number;
  meanB: number;
  stdR: number;
  stdG: number;
  stdB: number;
}

function computeChannelStats(rgba: Uint8Array): ChannelStats | null {
  const total = Math.floor(rgba.length / 4);
  if (total === 0) {
    return null;
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let validCount = 0;

  // Filter out specular highlights and deep shadow cavities (nostrils, pupil)
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;

    if (luma >= 25 && luma <= 242) {
      sumR += r;
      sumG += g;
      sumB += b;
      validCount++;
    }
  }

  // Fallback to all pixels if extreme lighting filtered everything
  if (validCount < 16) {
    validCount = 0;
    sumR = 0;
    sumG = 0;
    sumB = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      sumR += rgba[i];
      sumG += rgba[i + 1];
      sumB += rgba[i + 2];
      validCount++;
    }
  }

  const meanR = sumR / validCount;
  const meanG = sumG / validCount;
  const meanB = sumB / validCount;

  let sqR = 0;
  let sqG = 0;
  let sqB = 0;

  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;

    if (validCount < total || (luma >= 25 && luma <= 242)) {
      const dR = r - meanR;
      const dG = g - meanG;
      const dB = b - meanB;
      sqR += dR * dR;
      sqG += dG * dG;
      sqB += dB * dB;
    }
  }

  const stdR = Math.max(1.0, Math.sqrt(sqR / validCount));
  const stdG = Math.max(1.0, Math.sqrt(sqG / validCount));
  const stdB = Math.max(1.0, Math.sqrt(sqB / validCount));

  return { meanR, meanG, meanB, stdR, stdG, stdB };
}

/**
 * Computes a 20 element 4x5 color matrix for Skia that gently balances the donor's
 * skin tone and ambient lighting to match the base face.
 * Executed directly on GPU via Skia.ColorFilter.MakeMatrix.
 */
export async function computeSkinToneColorMatrix(
  donorImage: SkImage,
  donorFace: DetectedFace,
  baseImage: SkImage,
  baseFace: DetectedFace,
  strength = 0.65
): Promise<number[] | null> {
  try {
    const { ColorType, AlphaType } = await import("@shopify/react-native-skia");

    const dW = donorImage.width();
    const dH = donorImage.height();
    const bW = baseImage.width();
    const bH = baseImage.height();

    // Sample a representative facial skin patch covering cheeks and bridge (32 to 160px)
    const dPatchW = Math.max(32, Math.min(160, Math.round(donorFace.bounds.width * 0.28 * dW)));
    const dPatchH = Math.max(32, Math.min(160, Math.round(donorFace.bounds.height * 0.28 * dH)));
    const dCenterX = Math.round((donorFace.bounds.x + donorFace.bounds.width / 2) * dW);
    const dCenterY = Math.round((donorFace.bounds.y + donorFace.bounds.height / 2) * dH);
    const dX = Math.max(0, Math.min(dW - dPatchW, Math.round(dCenterX - dPatchW / 2)));
    const dY = Math.max(0, Math.min(dH - dPatchH, Math.round(dCenterY - dPatchH / 2)));

    const bPatchW = Math.max(32, Math.min(160, Math.round(baseFace.bounds.width * 0.28 * bW)));
    const bPatchH = Math.max(32, Math.min(160, Math.round(baseFace.bounds.height * 0.28 * bH)));
    const bCenterX = Math.round((baseFace.bounds.x + baseFace.bounds.width / 2) * bW);
    const bCenterY = Math.round((baseFace.bounds.y + baseFace.bounds.height / 2) * bH);
    const bX = Math.max(0, Math.min(bW - bPatchW, Math.round(bCenterX - bPatchW / 2)));
    const bY = Math.max(0, Math.min(bH - bPatchH, Math.round(bCenterY - bPatchH / 2)));

    const donorInfo = {
      width: dPatchW,
      height: dPatchH,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Premul,
    };
    const baseInfo = {
      width: bPatchW,
      height: bPatchH,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Premul,
    };

    const dPixelsRaw = donorImage.readPixels(dX, dY, donorInfo);
    const bPixelsRaw = baseImage.readPixels(bX, bY, baseInfo);

    if (!dPixelsRaw || !bPixelsRaw) {
      return null;
    }

    const dPixels = dPixelsRaw instanceof Uint8Array ? dPixelsRaw : new Uint8Array(dPixelsRaw);
    const bPixels = bPixelsRaw instanceof Uint8Array ? bPixelsRaw : new Uint8Array(bPixelsRaw);

    const dStats = computeChannelStats(dPixels);
    const bStats = computeChannelStats(bPixels);

    if (!dStats || !bStats) {
      return null;
    }

    const rawScaleR = Math.max(0.80, Math.min(1.25, bStats.stdR / dStats.stdR));
    const rawScaleG = Math.max(0.80, Math.min(1.25, bStats.stdG / dStats.stdG));
    const rawScaleB = Math.max(0.80, Math.min(1.25, bStats.stdB / dStats.stdB));

    const sR = 1.0 + strength * (rawScaleR - 1.0);
    const sG = 1.0 + strength * (rawScaleG - 1.0);
    const sB = 1.0 + strength * (rawScaleB - 1.0);

    const rawOffR = (bStats.meanR - dStats.meanR * sR) / 255;
    const rawOffG = (bStats.meanG - dStats.meanG * sG) / 255;
    const rawOffB = (bStats.meanB - dStats.meanB * sB) / 255;

    const oR = Math.max(-0.12, Math.min(0.12, strength * rawOffR));
    const oG = Math.max(-0.12, Math.min(0.12, strength * rawOffG));
    const oB = Math.max(-0.12, Math.min(0.12, strength * rawOffB));

    return [
      Number(sR.toFixed(4)), 0, 0, 0, Number(oR.toFixed(4)),
      0, Number(sG.toFixed(4)), 0, 0, Number(oG.toFixed(4)),
      0, 0, Number(sB.toFixed(4)), 0, Number(oB.toFixed(4)),
      0, 0, 0, 1, 0,
    ];
  } catch (err) {
    console.warn("Could not compute skin tone matrix:", err);
    return null;
  }
}

/**
 * Legacy tone matching helper.
 */
export async function matchFaceToneWithSkia(
  donorImage: SkImage,
  _donorBounds: NormalizedRect,
  _baseImage: SkImage,
  _baseBounds: NormalizedRect
): Promise<SkImage | null> {
  return donorImage;
}
