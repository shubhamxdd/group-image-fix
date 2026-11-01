import * as FileSystem from "expo-file-system/legacy";
import type { SkImage, SkRuntimeEffect } from "@shopify/react-native-skia";
import { BlendResult, FaceSwapSelection } from "../types/blend";
import { DetectedFace } from "../types/detection";
import { Photo, Session } from "../types/session";
import { getPixelAffineMatrix } from "./faceAlignmentService";
import { matchFaceToneWithSkia } from "./faceColorMatchService";

let cachedRuntimeEffect: SkRuntimeEffect | null = null;

const ELLIPTICAL_MASK_SKSL = `
uniform vec2 uCenter;
uniform vec2 uRadii;
uniform float uFeather;

vec4 main(vec2 xy) {
  vec2 d = (xy - uCenter) / uRadii;
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

async function getOrCompileMaskEffect(): Promise<SkRuntimeEffect | null> {
  if (cachedRuntimeEffect) {
    return cachedRuntimeEffect;
  }
  try {
    const { Skia } = await import("@shopify/react-native-skia");
    cachedRuntimeEffect = Skia.RuntimeEffect.Make(ELLIPTICAL_MASK_SKSL);
    return cachedRuntimeEffect;
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

    // Find base faces for each person to determine target location
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

      let donorImage = await loadSkiaImageFromUri(donorPhoto.proxyUri);
      if (!donorImage) {
        continue;
      }

      if (swap.blendParams.colorTransferEnabled) {
        const colorMatched = await matchFaceToneWithSkia(
          donorImage,
          donorFace.bounds,
          baseImage,
          baseFace.bounds
        );
        if (colorMatched) {
          donorImage = colorMatched;
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

      const targetCenterX =
        (baseFace.bounds.x + baseFace.bounds.width / 2) * baseW;
      const targetCenterY =
        (baseFace.bounds.y + baseFace.bounds.height / 2) * baseH;

      const radiusX = (baseFace.bounds.width * 0.58) * baseW;
      const radiusY = (baseFace.bounds.height * 0.68) * baseH;
      const featherRadius = Math.max(0.1, Math.min(0.5, swap.blendParams.featherRadius));

      // Create isolated scratch layer
      canvas.saveLayer();

      // Draw transformed donor face inside layer
      canvas.save();
      canvas.concat(skiaMatrix);
      canvas.drawImage(donorImage, 0, 0, basePaint);
      canvas.restore();

      // Mask with elliptical feathered alpha
      const maskPaint = Skia.Paint();
      maskPaint.setBlendMode(BlendMode.DstIn);

      if (maskEffect) {
        const maskShader = maskEffect.makeShader([
          targetCenterX,
          targetCenterY,
          radiusX,
          radiusY,
          featherRadius,
        ]);
        if (maskShader) {
          maskPaint.setShader(maskShader);
          canvas.drawRect(Skia.XYWHRect(0, 0, baseW, baseH), maskPaint);
        }
      } else {
        const blurSigma = Math.max(4, Math.min(radiusX, radiusY) * featherRadius * 0.6);
        maskPaint.setMaskFilter(
          Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurSigma, true)
        );
        const ovalRect = Skia.XYWHRect(
          targetCenterX - radiusX,
          targetCenterY - radiusY,
          radiusX * 2,
          radiusY * 2
        );
        canvas.drawOval(ovalRect, maskPaint);
      }

      // Merge masked layer onto base photo
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
