import * as FileSystem from "expo-file-system/legacy";
import type { SkImage, SkRuntimeEffect } from "@shopify/react-native-skia";
import { BlendResult, FaceSwapSelection } from "../types/blend";
import { DetectedFace } from "../types/detection";
import { Photo, Session } from "../types/session";
import {
  computeFaceAlignmentMatrix,
  computeBlendMaskGeometry,
} from "./faceAlignmentService";
import { computeSkinToneColorMatrix } from "./faceColorMatchService";
import { createFaceContourSkPath } from "./faceMeshService";

let cachedMaskEffect: SkRuntimeEffect | null = null;

const ROTATED_ELLIPTICAL_MASK_SKSL = `
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
  float alpha = 0.5 + 0.5 * cos(3.1415926535 * t);
  return vec4(alpha);
}
`;

async function getOrCompileMaskEffect(): Promise<SkRuntimeEffect | null> {
  if (cachedMaskEffect) {
    return cachedMaskEffect;
  }
  try {
    const { Skia } = await import("@shopify/react-native-skia");
    cachedMaskEffect = Skia.RuntimeEffect.Make(ROTATED_ELLIPTICAL_MASK_SKSL);
    return cachedMaskEffect;
  } catch (err) {
    console.warn("Could not compile rotated elliptical mask shader:", err);
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
      renderDurationMs: 0,
    };
  }

  try {
    const {
      Skia,
      BlendMode,
      ImageFormat,
      BlurStyle,
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

    const maskEffect = await getOrCompileMaskEffect();
    const photoMap = new Map<string, Photo>(session.photos.map((p) => [p.id, p]));

    const baseFacesByPerson = new Map<string, DetectedFace>();
    for (const face of Object.values(session.detectedFaces)) {
      if (face.photoId === basePhoto.id && face.personId) {
        baseFacesByPerson.set(face.personId, face);
      }
    }

    for (const swap of swapList) {
      const donorFace = session.detectedFaces[swap.donorFaceId];
      const baseFace = baseFacesByPerson.get(swap.personId);
      const donorPhoto = photoMap.get(swap.donorPhotoId);

      if (!donorFace || !baseFace || !donorPhoto) {
        continue;
      }

      const donorImage = await loadSkiaImageFromUri(donorPhoto.proxyUri);
      if (!donorImage) {
        continue;
      }

      const donorW = donorImage.width();
      const donorH = donorImage.height();

      // Compute rigid similarity pixel matrix
      const matrixValues = computeFaceAlignmentMatrix(
        donorFace,
        baseFace,
        donorW,
        donorH,
        baseW,
        baseH
      );
      const skiaMatrix = Skia.Matrix(matrixValues);

      // Compute rotated elliptical mask geometry
      const maskGeom = computeBlendMaskGeometry(
        baseFace,
        baseW,
        baseH,
        swap.blendParams.featherRadius ?? 0.35
      );

      // Setup donor paint with optional GPU color matching
      const donorPaint = Skia.Paint();
      if (swap.blendParams.colorTransferEnabled) {
        const colorMatrix = await computeSkinToneColorMatrix(
          donorImage,
          donorFace,
          baseImage,
          baseFace
        );
        if (colorMatrix) {
          donorPaint.setColorFilter(Skia.ColorFilter.MakeMatrix(colorMatrix));
        }
      }

      // Draw isolated layer
      canvas.saveLayer();

      // Draw transformed donor
      canvas.save();
      canvas.concat(skiaMatrix);
      canvas.drawImage(donorImage, 0, 0, donorPaint);
      canvas.restore();

      // Apply feathered mask (contour path if available, or rotated ellipse shader)
      const maskPaint = Skia.Paint();
      maskPaint.setBlendMode(BlendMode.DstIn);

      let usedContourMask = false;
      if (baseFace.contourPoints && baseFace.contourPoints.length >= 3) {
        const contourPath = await createFaceContourSkPath(
          baseFace.contourPoints,
          baseW,
          baseH
        );
        if (contourPath) {
          const blurSigma = Math.max(
            6,
            Math.min(maskGeom.radiusX, maskGeom.radiusY) * (swap.blendParams.featherRadius ?? 0.35) * 0.5
          );
          maskPaint.setMaskFilter(
            Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurSigma, true)
          );
          canvas.drawPath(contourPath, maskPaint);
          usedContourMask = true;
        }
      }

      if (!usedContourMask) {
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
            6,
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
      }

      // Merge masked donor onto composite
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
      isDirty: true,
      renderDurationMs: elapsed,
    };
  } catch (err) {
    console.warn("Failed to render composite preview:", err);
    return null;
  }
}
