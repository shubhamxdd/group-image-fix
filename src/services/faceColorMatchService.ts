import type { SkImage } from "@shopify/react-native-skia";
import { NormalizedRect } from "../types/detection";

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rLin = srgbToLinear(r);
  const gLin = srgbToLinear(g);
  const bLin = srgbToLinear(b);

  const x = (rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375) / 0.95047;
  const y = (rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.072175) / 1.0;
  const z = (rLin * 0.0193339 + gLin * 0.119192 + bLin * 0.9503041) / 1.08883;

  const eps = 216 / 24389;
  const kappa = 24389 / 27;

  const fx = x > eps ? Math.cbrt(x) : (kappa * x + 16) / 116;
  const fy = y > eps ? Math.cbrt(y) : (kappa * y + 16) / 116;
  const fz = z > eps ? Math.cbrt(z) : (kappa * z + 16) / 116;

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const eps = 216 / 24389;
  const kappa = 24389 / 27;

  const fx3 = fx * fx * fx;
  const fz3 = fz * fz * fz;

  const x = (fx3 > eps ? fx3 : (116 * fx - 16) / kappa) * 0.95047;
  const y = (L > kappa * eps ? Math.pow((L + 16) / 116, 3) : L / kappa) * 1.0;
  const z = (fz3 > eps ? fz3 : (116 * fz - 16) / kappa) * 1.08883;

  const rLin = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gLin = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bLin = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  return [linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin)];
}

interface ChannelStats {
  mean: number;
  std: number;
}

function calculateChannelStats(values: number[]): ChannelStats {
  if (values.length === 0) {
    return { mean: 0, std: 1 };
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  const mean = sum / values.length;

  let sumSq = 0;
  for (const v of values) {
    const diff = v - mean;
    sumSq += diff * diff;
  }
  const variance = sumSq / values.length;
  const std = Math.max(0.1, Math.sqrt(variance));

  return { mean, std };
}

export function transferLabColor(
  donorRgba: Uint8Array,
  donorBoundsCount: number,
  baseRgba: Uint8Array,
  baseBoundsCount: number,
  strength = 0.85
): Uint8Array {
  // Extract LAB values from sample arrays
  const donorL: number[] = [];
  const donorA: number[] = [];
  const donorB: number[] = [];

  for (let i = 0; i < donorRgba.length; i += 4) {
    const r = donorRgba[i];
    const g = donorRgba[i + 1];
    const b = donorRgba[i + 2];
    const [lVal, aVal, bVal] = rgbToLab(r, g, b);
    donorL.push(lVal);
    donorA.push(aVal);
    donorB.push(bVal);
  }

  const baseL: number[] = [];
  const baseA: number[] = [];
  const baseB: number[] = [];

  for (let i = 0; i < baseRgba.length; i += 4) {
    const r = baseRgba[i];
    const g = baseRgba[i + 1];
    const b = baseRgba[i + 2];
    const [lVal, aVal, bVal] = rgbToLab(r, g, b);
    baseL.push(lVal);
    baseA.push(aVal);
    baseB.push(bVal);
  }

  const statsDonorL = calculateChannelStats(donorL);
  const statsDonorA = calculateChannelStats(donorA);
  const statsDonorB = calculateChannelStats(donorB);

  const statsBaseL = calculateChannelStats(baseL);
  const statsBaseA = calculateChannelStats(baseA);
  const statsBaseB = calculateChannelStats(baseB);

  const ratioL = Math.max(0.4, Math.min(2.5, statsBaseL.std / statsDonorL.std));
  const ratioA = Math.max(0.4, Math.min(2.5, statsBaseA.std / statsDonorA.std));
  const ratioB = Math.max(0.4, Math.min(2.5, statsBaseB.std / statsDonorB.std));

  const result = new Uint8Array(donorRgba.length);

  for (let i = 0, pxIdx = 0; i < donorRgba.length; i += 4, pxIdx++) {
    const origL = donorL[pxIdx];
    const origA = donorA[pxIdx];
    const origB = donorB[pxIdx];

    const targetL = (origL - statsDonorL.mean) * ratioL + statsBaseL.mean;
    const targetA = (origA - statsDonorA.mean) * ratioA + statsBaseA.mean;
    const targetB = (origB - statsDonorB.mean) * ratioB + statsBaseB.mean;

    // Blend between original and target based on strength factor
    const finalL = origL + (targetL - origL) * strength;
    const finalA = origA + (targetA - origA) * strength;
    const finalB = origB + (targetB - origB) * strength;

    const [r, g, b] = labToRgb(finalL, finalA, finalB);

    result[i] = r;
    result[i + 1] = g;
    result[i + 2] = b;
    result[i + 3] = donorRgba[i + 3];
  }

  return result;
}

export async function matchFaceToneWithSkia(
  donorImage: SkImage,
  donorBounds: NormalizedRect,
  baseImage: SkImage,
  baseBounds: NormalizedRect
): Promise<SkImage | null> {
  try {
    const { Skia, ColorType, AlphaType } = await import("@shopify/react-native-skia");

    const dImgW = donorImage.width();
    const dImgH = donorImage.height();
    const bImgW = baseImage.width();
    const bImgH = baseImage.height();

    // Sample face crop region
    const dX = Math.round(Math.max(0, donorBounds.x * dImgW));
    const dY = Math.round(Math.max(0, donorBounds.y * dImgH));
    const dW = Math.round(Math.min(dImgW - dX, donorBounds.width * dImgW));
    const dH = Math.round(Math.min(dImgH - dY, donorBounds.height * dImgH));

    const bX = Math.round(Math.max(0, baseBounds.x * bImgW));
    const bY = Math.round(Math.max(0, baseBounds.y * bImgH));
    const bW = Math.round(Math.min(bImgW - bX, baseBounds.width * bImgW));
    const bH = Math.round(Math.min(bImgH - bY, baseBounds.height * bImgH));

    if (dW <= 0 || dH <= 0 || bW <= 0 || bH <= 0) {
      return donorImage;
    }

    const donorInfo = {
      width: dW,
      height: dH,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Premul,
    };

    const baseInfo = {
      width: bW,
      height: bH,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Premul,
    };

    const donorPixels = donorImage.readPixels(dX, dY, donorInfo);
    const basePixels = baseImage.readPixels(bX, bY, baseInfo);

    if (!donorPixels || !basePixels) {
      return donorImage;
    }

    const adjustedCropPixels = transferLabColor(
      donorPixels instanceof Uint8Array ? donorPixels : new Uint8Array(donorPixels),
      dW * dH,
      basePixels instanceof Uint8Array ? basePixels : new Uint8Array(basePixels),
      bW * bH
    );

    // Create an SkImage from the adjusted patch
    const data = Skia.Data.fromBytes(adjustedCropPixels);
    const adjustedCropImage = Skia.Image.MakeImage(donorInfo, data, dW * 4);

    if (!adjustedCropImage) {
      return donorImage;
    }

    // Composite adjusted crop back onto donor image canvas
    const surface = Skia.Surface.Make(dImgW, dImgH);
    if (!surface) {
      return donorImage;
    }

    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    canvas.drawImage(donorImage, 0, 0, paint);

    const srcRect = Skia.XYWHRect(0, 0, dW, dH);
    const dstRect = Skia.XYWHRect(dX, dY, dW, dH);
    canvas.drawImageRect(adjustedCropImage, srcRect, dstRect, paint);
    surface.flush();

    return surface.makeImageSnapshot();
  } catch (err) {
    console.warn("Could not apply Skia LAB color matching:", err);
    return donorImage;
  }
}
