import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import type { SkImage } from "@shopify/react-native-skia";
import { Session, Photo } from "../types/session";
import { DetectedFace } from "../types/detection";
import {
  computeFaceAlignmentMatrix,
  computeBlendMaskGeometry,
} from "./faceAlignmentService";
import { computeSkinToneColorMatrix } from "./faceColorMatchService";
import { createFaceContourSkPath } from "./faceMeshService";

async function loadSkiaImageFromUri(uri: string): Promise<SkImage | null> {
  try {
    const { Skia } = await import("@shopify/react-native-skia");
    const fileData = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const skiaData = Skia.Data.fromBase64(fileData);
    return Skia.Image.MakeImageFromEncoded(skiaData);
  } catch (err) {
    console.warn("Failed to load image for export from URI:", uri, err);
    return null;
  }
}

async function saveToGallery(filePath: string): Promise<string> {
  // 1. Try legacy API first
  try {
    const asset = await MediaLibrary.createAssetAsync(filePath);
    if (asset?.uri) {
      return asset.uri;
    }
  } catch (legacyErr) {
    console.warn("Legacy createAssetAsync failed, attempting new class-based API:", legacyErr);
  }

  // 2. Fallback to new class-based MediaLibrary.Asset.create API
  try {
    const nextMediaLibrary = await import("expo-media-library");
    if (nextMediaLibrary.Asset && typeof nextMediaLibrary.Asset.create === "function") {
      const asset = await nextMediaLibrary.Asset.create(filePath);
      return (asset as any)?.uri || (asset as any)?.id || filePath;
    }
  } catch (nextErr) {
    console.warn("Class-based Asset.create failed:", nextErr);
  }

  throw new Error("Could not save photo to device media library.");
}

export interface ExportResult {
  success: boolean;
  assetUri?: string;
  error?: string;
}

export async function exportFullResolutionComposite(
  session: Session,
  onProgress?: (progress: number, stage: string) => void
): Promise<ExportResult> {
  onProgress?.(10, "Checking media library permissions...");
  const basePhoto = session.photos.find((p) => p.id === session.basePhotoId);
  if (!basePhoto) {
    return { success: false, error: "No base photo selected in active session." };
  }

  // Request media library write permissions
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) {
    return {
      success: false,
      error: "Media library write permission is required to save photos.",
    };
  }

  const swapList = Object.values(session.swaps || {});

  // If no swaps were performed, save original base photo directly
  if (swapList.length === 0) {
    try {
      onProgress?.(70, "Saving original base photo to gallery...");
      const savedUri = await saveToGallery(basePhoto.originalUri);
      onProgress?.(100, "Saved photo successfully!");
      return { success: true, assetUri: savedUri };
    } catch (saveErr: any) {
      return {
        success: false,
        error: saveErr?.message || "Could not save photo to media library.",
      };
    }
  }

  try {
    onProgress?.(25, "Loading full resolution base photo...");
    const {
      Skia,
      BlendMode,
      ImageFormat,
      BlurStyle,
      TileMode,
    } = await import("@shopify/react-native-skia");

    // Load full resolution original base photo
    const baseOriginal = await loadSkiaImageFromUri(basePhoto.originalUri);
    if (!baseOriginal) {
      return {
        success: false,
        error: "Failed to load base photo at full resolution.",
      };
    }

    const origW = baseOriginal.width();
    const origH = baseOriginal.height();

    const surface = Skia.Surface.Make(origW, origH);
    if (!surface) {
      return {
        success: false,
        error: "Insufficient memory to allocate full resolution canvas.",
      };
    }

    const canvas = surface.getCanvas();
    const basePaint = Skia.Paint();
    canvas.drawImage(baseOriginal, 0, 0, basePaint);

    const photoMap = new Map<string, Photo>(session.photos.map((p) => [p.id, p]));
    const baseFacesByPerson = new Map<string, DetectedFace>();
    for (const face of Object.values(session.detectedFaces)) {
      if (face.photoId === basePhoto.id && face.personId) {
        baseFacesByPerson.set(face.personId, face);
      }
    }

    const maskEffect = Skia.RuntimeEffect.Make(`
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
    `);

    let swapIdx = 0;
    for (const swap of swapList) {
      swapIdx++;
      const currentPct = 30 + Math.round((swapIdx / swapList.length) * 45);
      onProgress?.(currentPct, `Blending face expression ${swapIdx} of ${swapList.length}...`);
      const donorFace = session.detectedFaces[swap.donorFaceId];
      const baseFace = baseFacesByPerson.get(swap.personId);
      const donorPhoto = photoMap.get(swap.donorPhotoId);

      if (!donorFace || !baseFace || !donorPhoto) {
        continue;
      }

      const donorOriginal = await loadSkiaImageFromUri(donorPhoto.originalUri);
      if (!donorOriginal) {
        continue;
      }

      const donorW = donorOriginal.width();
      const donorH = donorOriginal.height();

      const pixelMatrixValues = computeFaceAlignmentMatrix(
        donorFace,
        baseFace,
        donorW,
        donorH,
        origW,
        origH
      );
      const skiaMatrix = Skia.Matrix(pixelMatrixValues);

      const maskGeom = computeBlendMaskGeometry(
        baseFace,
        origW,
        origH,
        swap.blendParams.featherRadius ?? 0.30
      );

      const minRadius = Math.min(maskGeom.radiusX, maskGeom.radiusY);
      // Tight feather for high frequency facial features (pores, eyelashes, smile, teeth)
      const sharpSigma = Math.max(3, minRadius * 0.035);
      // Wide feather for low frequency ambient lighting and skin tone transition
      const wideSigma = Math.max(12, minRadius * 0.16);

      let colorFilter: any = null;
      if (swap.blendParams.colorTransferEnabled) {
        const colorMatrix = await computeSkinToneColorMatrix(
          donorOriginal,
          donorFace,
          baseOriginal,
          baseFace
        );
        if (colorMatrix) {
          colorFilter = Skia.ColorFilter.MakeMatrix(colorMatrix);
        }
      }

      // Build smooth anatomical path from inner face core contour
      let contourPath: any = null;
      if (baseFace.contourPoints && baseFace.contourPoints.length >= 3) {
        contourPath = await createFaceContourSkPath(
          baseFace.contourPoints,
          origW,
          origH
        );
      }

      // Helper function to draw mask geometry with a specified blur radius
      const drawMaskIntoExportCanvas = (blurRadius: number) => {
        const maskPaint = Skia.Paint();
        maskPaint.setAntiAlias(true);
        maskPaint.setColor(Skia.Color("#ffffff"));

        if (contourPath) {
          maskPaint.setMaskFilter(
            Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurRadius, true)
          );
          canvas.drawPath(contourPath, maskPaint);
        } else if (maskEffect) {
          const effectiveFeather = Math.max(0.12, Math.min(0.40, blurRadius / minRadius));
          const maskShader = maskEffect.makeShader([
            maskGeom.centerX,
            maskGeom.centerY,
            maskGeom.radiusX,
            maskGeom.radiusY,
            maskGeom.rotationAngle,
            effectiveFeather,
          ]);
          if (maskShader) {
            maskPaint.setShader(maskShader);
            canvas.drawRect(Skia.XYWHRect(0, 0, origW, origH), maskPaint);
          }
        } else {
          maskPaint.setMaskFilter(
            Skia.MaskFilter.MakeBlur(BlurStyle.Normal, blurRadius, true)
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
      };

      // PASS 1: Low-frequency ambient lighting & skin tone transition
      // Wide feathered mask + low-pass filtered donor image
      // Blends lighting seamlessly into surrounding base skin with zero visible edge line
      // and zero ghosted pores or duplicate hairs.
      canvas.saveLayer();
      drawMaskIntoExportCanvas(wideSigma);

      const lowFreqPaint = Skia.Paint();
      lowFreqPaint.setAntiAlias(true);
      lowFreqPaint.setBlendMode(BlendMode.SrcIn);
      if (colorFilter) {
        lowFreqPaint.setColorFilter(colorFilter);
      }
      if (Skia.ImageFilter && typeof Skia.ImageFilter.MakeBlur === "function") {
        lowFreqPaint.setImageFilter(
          Skia.ImageFilter.MakeBlur(wideSigma * 0.45, wideSigma * 0.45, TileMode.Clamp)
        );
      }
      canvas.save();
      canvas.concat(skiaMatrix);
      canvas.drawImage(donorOriginal, 0, 0, lowFreqPaint);
      canvas.restore();
      canvas.restore();

      // PASS 2: High-frequency expression details & texture core
      // Tight feathered mask + native crisp donor image
      // Transplants crisp teeth, lips, eyes, and skin pores with zero blurriness.
      canvas.saveLayer();
      drawMaskIntoExportCanvas(sharpSigma);

      const sharpPaint = Skia.Paint();
      sharpPaint.setAntiAlias(true);
      sharpPaint.setBlendMode(BlendMode.SrcIn);
      if (colorFilter) {
        sharpPaint.setColorFilter(colorFilter);
      }
      canvas.save();
      canvas.concat(skiaMatrix);
      canvas.drawImage(donorOriginal, 0, 0, sharpPaint);
      canvas.restore();
      canvas.restore();
    }

    onProgress?.(80, "Encoding full resolution image...");
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const base64Data = snapshot.encodeToBase64(ImageFormat.JPEG, 95);

    const exportFilePath = `${FileSystem.cacheDirectory}export_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(exportFilePath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    onProgress?.(92, "Saving to media gallery...");
    const savedAssetUri = await saveToGallery(exportFilePath);

    // Clean up temporary export file
    try {
      await FileSystem.deleteAsync(exportFilePath, { idempotent: true });
    } catch {
      // Ignore temporary file cleanup failure
    }

    onProgress?.(100, "Export completed successfully!");
    return {
      success: true,
      assetUri: savedAssetUri,
    };
  } catch (err: any) {
    console.warn("Full resolution export failed:", err);
    return {
      success: false,
      error: err?.message || "An unexpected error occurred during full resolution export.",
    };
  }
}
