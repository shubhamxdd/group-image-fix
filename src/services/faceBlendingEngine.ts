import * as FileSystem from "expo-file-system/legacy";
import type { SkImage, SkRuntimeEffect, SkPath } from "@shopify/react-native-skia";
import { PathOp } from "@shopify/react-native-skia";
import { BlendResult, FaceSwapSelection } from "../types/blend";
import { DetectedFace } from "../types/detection";
import { Photo, Session } from "../types/session";
import { getPixelAffineMatrix, computeBlendMaskGeometry } from "./faceAlignmentService";
import { matchFaceToneWithSkia } from "./faceColorMatchService";
import { generateFaceBoundaryPolygon, getWarpedDonorPolygon } from "./facePolygonMaskService";

let cachedTwoBandEffect: SkRuntimeEffect | null = null;
let cachedEllipticalEffect: SkRuntimeEffect | null = null;

// Two-band frequency blending shader:
// baseSharp and donorSharp provide high-frequency details (eyes, teeth, pores) blended with maskTight.
// baseBlur and donorBlur provide low-frequency lighting and skin tones blended with maskWide.
const TWO_BAND_BLEND_SKSL = `
uniform shader baseSharp;
uniform shader baseBlur;
uniform shader donorSharp;
uniform shader donorBlur;
uniform shader maskWide;
uniform shader maskTight;

vec4 main(vec2 p) {
  vec3 lowB = baseBlur.eval(p).rgb;
  vec3 lowD = donorBlur.eval(p).rgb;
  vec3 hiB  = baseSharp.eval(p).rgb  - lowB;
  vec3 hiD  = donorSharp.eval(p).rgb - lowD;
  float wW  = maskWide.eval(p).a;
  float wT  = maskTight.eval(p).a;
  vec3 low  = mix(lowB, lowD, wW);
  vec3 hi   = mix(hiB,  hiD,  wT);
  return vec4(low + hi, 1.0);
}
`;

const ELLIPTICAL_MASK_SKSL = `
uniform vec2 uCenter;
uniform vec2 uRadii;
uniform float uAngle;
uniform float uFeather;

vec4 main(vec2 xy) {
  vec2 delta = xy - uCenter;
  float cosA = cos(-uAngle);
  float sinA = sin(-uAngle);
  vec2 rotatedDelta = vec2(
    delta.x * cosA - delta.y * sinA,
    delta.x * sinA + delta.y * cosA
  );
  vec2 d = rotatedDelta / uRadii;
  float dist = length(d);
  if (dist >= 1.0) {
    return vec4(0.0);
  }
  float inner = max(0.0, 1.0 - uFeather);
  if (dist <= inner) {
    return vec4(1.0);
  }
  float t = (dist - inner) / max(0.001, uFeather);
  float alpha = 0.5 + 0.5 * cos(3.14159265 * t);
  return vec4(alpha);
}
`;

async function getOrCompileTwoBandEffect(): Promise<SkRuntimeEffect | null> {
  if (cachedTwoBandEffect) {
    return cachedTwoBandEffect;
  }
  try {
    const { Skia } = await import("@shopify/react-native-skia");
    cachedTwoBandEffect = Skia.RuntimeEffect.Make(TWO_BAND_BLEND_SKSL);
    return cachedTwoBandEffect;
  } catch (err) {
    console.warn("Could not compile two-band shader, will fall back:", err);
    return null;
  }
}

async function getOrCompileMaskEffect(): Promise<SkRuntimeEffect | null> {
  if (cachedEllipticalEffect) {
    return cachedEllipticalEffect;
  }
  try {
    const { Skia } = await import("@shopify/react-native-skia");
    cachedEllipticalEffect = Skia.RuntimeEffect.Make(ELLIPTICAL_MASK_SKSL);
    return cachedEllipticalEffect;
  } catch (err) {
    console.warn("Could not compile elliptical mask shader:", err);
    return null;
  }
}

async function loadSkiaImageFromUri(uri: string): Promise<SkImage | null> {
  try {
    const { Skia } = await import("@shopify/react-native-skia");
    const fileData = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const skiaData = Skia.Data.fromBase64(fileData);
    return Skia.Image.MakeImageFromEncoded(skiaData);
  } catch (err) {
    console.warn("Failed to load Skia image from URI:", uri, err);
    return null;
  }
}

/**
 * Creates an intersected, smoothed SkPath from the base face polygon and the warped donor face polygon.
 */
function createIntersectedPolygonPath(
  Skia: typeof import("@shopify/react-native-skia")["Skia"],
  baseFace: DetectedFace,
  donorFace: DetectedFace,
  matrixNorm: number[],
  canvasW: number,
  canvasH: number
): SkPath | null {
  try {
    const basePath = Skia.Path.Make();
    const basePts = generateFaceBoundaryPolygon(baseFace, 0.04);
    if (basePts.length > 0) {
      basePath.moveTo(basePts[0].x * canvasW, basePts[0].y * canvasH);
      for (let i = 1; i < basePts.length; i++) {
        basePath.lineTo(basePts[i].x * canvasW, basePts[i].y * canvasH);
      }
      basePath.close();
    }

    const donorPath = Skia.Path.Make();
    const donorPts = getWarpedDonorPolygon(donorFace, matrixNorm, 0.04);
    if (donorPts.length > 0) {
      donorPath.moveTo(donorPts[0].x * canvasW, donorPts[0].y * canvasH);
      for (let i = 1; i < donorPts.length; i++) {
        donorPath.lineTo(donorPts[i].x * canvasW, donorPts[i].y * canvasH);
      }
      donorPath.close();
    }

    const intersected = Skia.Path.MakeFromOp(basePath, donorPath, PathOp.Intersect);
    return intersected || basePath;
  } catch {
    return null;
  }
}

export async function renderCompositePreview(
  session: Session,
  swaps: Record<string, FaceSwapSelection>
): Promise<BlendResult | null> {
  const startTime = Date.now();
  const basePhoto = session.photos.find((p) => p.id === session.basePhotoId);
  if (!basePhoto) {
    return null;
  }

  const swapList = Object.values(swaps);
  if (swapList.length === 0) {
    return {
      previewUri: basePhoto.proxyUri,
      previewWidth: basePhoto.proxyWidth,
      previewHeight: basePhoto.proxyHeight,
      isDirty: false,
      renderDurationMs: Date.now() - startTime,
    };
  }

  try {
    const {
      Skia,
      BlendMode,
      ImageFormat,
      BlurStyle,
      TileMode,
      FilterMode,
      MipmapMode,
    } = await import("@shopify/react-native-skia");

    const baseImage = await loadSkiaImageFromUri(basePhoto.proxyUri);
    if (!baseImage) {
      return null;
    }

    const baseW = baseImage.width();
    const baseH = baseImage.height();

    const surface = Skia.Surface.Make(baseW, baseH);
    if (!surface) {
      return null;
    }

    const canvas = surface.getCanvas();
    const basePaint = Skia.Paint();
    canvas.drawImage(baseImage, 0, 0, basePaint);

    const photoMap = new Map<string, Photo>(session.photos.map((p) => [p.id, p]));
    const baseFacesByPerson = new Map<string, DetectedFace>();
    for (const face of Object.values(session.detectedFaces)) {
      if (face.photoId === basePhoto.id && face.personId) {
        baseFacesByPerson.set(face.personId, face);
      }
    }

    const twoBandEffect = await getOrCompileTwoBandEffect();
    const maskEffect = await getOrCompileMaskEffect();

    for (const swap of swapList) {
      const donorFace = session.detectedFaces[swap.donorFaceId];
      const baseFace = baseFacesByPerson.get(swap.personId);
      const donorPhoto = photoMap.get(swap.donorPhotoId);

      if (!donorFace || !baseFace || !donorPhoto) {
        continue;
      }

      let donorImage = await loadSkiaImageFromUri(donorPhoto.proxyUri);
      if (!donorImage) {
        continue;
      }

      if (swap.blendParams.colorTransferEnabled) {
        const toneAdjusted = await matchFaceToneWithSkia(
          donorImage,
          donorFace.bounds,
          baseImage,
          baseFace.bounds
        );
        if (toneAdjusted) {
          donorImage = toneAdjusted;
        }
      }

      const donorW = donorImage.width();
      const donorH = donorImage.height();

      const pixelMatrixValues = getPixelAffineMatrix(
        swap.blendParams.affineMatrix,
        donorW,
        donorH,
        baseW,
        baseH
      );

      const skiaMatrix = Skia.Matrix(pixelMatrixValues);

      // Attempt to build landmark-guided intersected polygon mask
      const polygonPath = createIntersectedPolygonPath(
        Skia,
        baseFace,
        donorFace,
        swap.blendParams.affineMatrix,
        baseW,
        baseH
      );

      const faceDim = Math.max(baseFace.bounds.width * baseW, baseFace.bounds.height * baseH);
      const blurSigmaWide = Math.max(8, faceDim * 0.08);
      const blurSigmaTight = Math.max(2, faceDim * 0.02);

      // Generate mask surfaces
      const maskWideSurface = Skia.Surface.Make(baseW, baseH);
      const maskTightSurface = Skia.Surface.Make(baseW, baseH);

      if (maskWideSurface && maskTightSurface && polygonPath) {
        const pWideCanvas = maskWideSurface.getCanvas();
        const pTightCanvas = maskTightSurface.getCanvas();

        const pWidePaint = Skia.Paint();
        pWidePaint.setColor(Skia.Color("#ffffff"));
        pWidePaint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurSigmaWide, true));
        pWideCanvas.drawPath(polygonPath, pWidePaint);
        maskWideSurface.flush();

        const pTightPaint = Skia.Paint();
        pTightPaint.setColor(Skia.Color("#ffffff"));
        pTightPaint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurSigmaTight, true));
        pTightCanvas.drawPath(polygonPath, pTightPaint);
        maskTightSurface.flush();

        // Render warped donor face into its own surface
        const donorWarpedSurface = Skia.Surface.Make(baseW, baseH);
        if (donorWarpedSurface) {
          const dwCanvas = donorWarpedSurface.getCanvas();
          dwCanvas.concat(skiaMatrix);
          dwCanvas.drawImage(donorImage, 0, 0, basePaint);
          donorWarpedSurface.flush();

          const donorWarpedImage = donorWarpedSurface.makeImageSnapshot();

          // Low-frequency blurred surfaces
          const blurSigmaLighting = Math.max(10, faceDim * 0.10);

          const baseBlurSurface = Skia.Surface.Make(baseW, baseH);
          const donorBlurSurface = Skia.Surface.Make(baseW, baseH);

          if (baseBlurSurface && donorBlurSurface && donorWarpedImage && twoBandEffect) {
            const bbCanvas = baseBlurSurface.getCanvas();
            const blurFilter = Skia.ImageFilter.MakeBlur(blurSigmaLighting, blurSigmaLighting, TileMode.Clamp, null);
            const bbPaint = Skia.Paint();
            bbPaint.setImageFilter(blurFilter);
            bbCanvas.drawImage(baseImage, 0, 0, bbPaint);
            baseBlurSurface.flush();

            const dbCanvas = donorBlurSurface.getCanvas();
            const dbPaint = Skia.Paint();
            dbPaint.setImageFilter(blurFilter);
            dbCanvas.drawImage(donorWarpedImage, 0, 0, dbPaint);
            donorBlurSurface.flush();

            const baseBlurImg = baseBlurSurface.makeImageSnapshot();
            const donorBlurImg = donorBlurSurface.makeImageSnapshot();
            const maskWideImg = maskWideSurface.makeImageSnapshot();
            const maskTightImg = maskTightSurface.makeImageSnapshot();

            const shaderOpts = [TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None] as const;
            const twoBandShader = twoBandEffect.makeShaderWithChildren([], [
              baseImage.makeShaderOptions(...shaderOpts),
              baseBlurImg.makeShaderOptions(...shaderOpts),
              donorWarpedImage.makeShaderOptions(...shaderOpts),
              donorBlurImg.makeShaderOptions(...shaderOpts),
              maskWideImg.makeShaderOptions(...shaderOpts),
              maskTightImg.makeShaderOptions(...shaderOpts),
            ]);

            if (twoBandShader) {
              const blendPaint = Skia.Paint();
              blendPaint.setShader(twoBandShader);
              canvas.drawRect(Skia.XYWHRect(0, 0, baseW, baseH), blendPaint);
              continue;
            }
          }
        }
      }

      // Robust fallback to analytical rotated ellipse shader
      const maskGeom = computeBlendMaskGeometry(
        baseFace,
        baseW,
        baseH,
        swap.blendParams.featherRadius ?? 0.35
      );

      canvas.saveLayer();

      canvas.save();
      canvas.concat(skiaMatrix);
      canvas.drawImage(donorImage, 0, 0, basePaint);
      canvas.restore();

      const maskPaint = Skia.Paint();
      maskPaint.setBlendMode(BlendMode.DstIn);

      if (maskEffect) {
        const maskShader = maskEffect.makeShader([
          maskGeom.centerX,
          maskGeom.centerY,
          maskGeom.radiusX,
          maskGeom.radiusY,
          maskGeom.rotationAngle,
          maskGeom.featherRadius,
        ]);
        if (maskShader) {
          maskPaint.setShader(maskShader);
          canvas.drawRect(Skia.XYWHRect(0, 0, baseW, baseH), maskPaint);
        }
      } else {
        const blurSigma = Math.max(
          4,
          Math.min(maskGeom.radiusX, maskGeom.radiusY) * maskGeom.featherRadius * 0.6
        );
        maskPaint.setMaskFilter(
          Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurSigma, true)
        );
        canvas.save();
        canvas.translate(maskGeom.centerX, maskGeom.centerY);
        canvas.rotate((maskGeom.rotationAngle * 180) / Math.PI, 0, 0);
        const ovalRect = Skia.XYWHRect(
          -maskGeom.radiusX,
          -maskGeom.radiusY,
          maskGeom.radiusX * 2,
          maskGeom.radiusY * 2
        );
        canvas.drawOval(ovalRect, maskPaint);
        canvas.restore();
      }

      canvas.restore();
    }

    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const base64Data = snapshot.encodeToBase64(ImageFormat.JPEG, 92);

    const sessionDir = `${FileSystem.cacheDirectory}sessions/${session.id}/`;
    const previewPath = `${sessionDir}preview_composite.jpg`;

    await FileSystem.writeAsStringAsync(previewPath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const elapsed = Date.now() - startTime;
    return {
      previewUri: previewPath,
      previewWidth: baseW,
      previewHeight: baseH,
      isDirty: false,
      renderDurationMs: elapsed,
    };
  } catch (err) {
    console.warn("Face blending failed:", err);
    return null;
  }
}
