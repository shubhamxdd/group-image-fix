import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import type { SkImage } from "@shopify/react-native-skia";
import { Session, Photo } from "../types/session";
import { DetectedFace } from "../types/detection";
import { getPixelAffineMatrix } from "./faceAlignmentService";
import { matchFaceToneWithSkia } from "./faceColorMatchService";

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

export interface ExportResult {
  success: boolean;
  assetUri?: string;
  error?: string;
}

export async function exportFullResolutionComposite(
  session: Session
): Promise<ExportResult> {
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
      const asset = await MediaLibrary.createAssetAsync(basePhoto.originalUri);
      return { success: true, assetUri: asset.uri };
    } catch (saveErr: any) {
      return {
        success: false,
        error: saveErr?.message || "Could not save photo to media library.",
      };
    }
  }

  try {
    const {
      Skia,
      BlendMode,
      ImageFormat,
      BlurStyle,
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
    `);

    for (const swap of swapList) {
      const donorFace = session.detectedFaces[swap.donorFaceId];
      const baseFace = baseFacesByPerson.get(swap.personId);
      const donorPhoto = photoMap.get(swap.donorPhotoId);

      if (!donorFace || !baseFace || !donorPhoto) {
        continue;
      }

      let donorOriginal = await loadSkiaImageFromUri(donorPhoto.originalUri);
      if (!donorOriginal) {
        continue;
      }

      if (swap.blendParams.colorTransferEnabled) {
        const toneAdjusted = await matchFaceToneWithSkia(
          donorOriginal,
          donorFace.bounds,
          baseOriginal,
          baseFace.bounds
        );
        if (toneAdjusted) {
          donorOriginal = toneAdjusted;
        }
      }

      const donorW = donorOriginal.width();
      const donorH = donorOriginal.height();

      const pixelMatrixValues = getPixelAffineMatrix(
        swap.blendParams.affineMatrix,
        donorW,
        donorH,
        origW,
        origH
      );

      const skiaMatrix = Skia.Matrix(pixelMatrixValues);

      const targetCenterX =
        (baseFace.bounds.x + baseFace.bounds.width / 2) * origW;
      const targetCenterY =
        (baseFace.bounds.y + baseFace.bounds.height / 2) * origH;

      const radiusX = (baseFace.bounds.width * 0.58) * origW;
      const radiusY = (baseFace.bounds.height * 0.68) * origH;
      const featherRadius = Math.max(0.1, Math.min(0.5, swap.blendParams.featherRadius));

      canvas.saveLayer();

      canvas.save();
      canvas.concat(skiaMatrix);
      canvas.drawImage(donorOriginal, 0, 0, basePaint);
      canvas.restore();

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
          canvas.drawRect(Skia.XYWHRect(0, 0, origW, origH), maskPaint);
        }
      } else {
        const blurSigma = Math.max(8, Math.min(radiusX, radiusY) * featherRadius * 0.6);
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

      canvas.restore();
    }

    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const base64Data = snapshot.encodeToBase64(ImageFormat.JPEG, 95);

    const exportFilePath = `${FileSystem.cacheDirectory}export_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(exportFilePath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const asset = await MediaLibrary.createAssetAsync(exportFilePath);

    // Clean up temporary export file
    try {
      await FileSystem.deleteAsync(exportFilePath, { idempotent: true });
    } catch (cleanupErr) {
      console.warn("Could not delete temporary export file:", cleanupErr);
    }

    return { success: true, assetUri: asset.uri };
  } catch (err: any) {
    console.warn("Full resolution export failed:", err);
    return {
      success: false,
      error: err?.message || "Failed to render and save full resolution composite.",
    };
  }
}
