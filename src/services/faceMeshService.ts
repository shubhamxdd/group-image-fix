import type { SkImage, SkPath } from "@shopify/react-native-skia";
import type { TfliteModel } from "react-native-fast-tflite";
import { NormalizedPoint, NormalizedRect } from "../types/detection";

let cachedMeshModel: TfliteModel | null = null;
let meshModelLoadPromise: Promise<TfliteModel | null> | null = null;

// Canonical 36 MediaPipe Face Mesh indices tracing the outer face oval
export const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

// Forehead indices that should be pulled downward to blend on smooth forehead skin
const FOREHEAD_INDICES = new Set([10, 338, 297, 109, 67, 332, 103]);

export interface FaceMeshResult {
  meshPoints: NormalizedPoint[];
  contourPoints: NormalizedPoint[];
  confidence: number;
}

export async function getOrLoadFaceMeshModel(): Promise<TfliteModel | null> {
  if (cachedMeshModel) {
    return cachedMeshModel;
  }
  if (!meshModelLoadPromise) {
    meshModelLoadPromise = (async () => {
      try {
        console.log("[FaceMeshService] Loading Face Mesh TFLite model...");
        const { loadTensorflowModel } = await import("react-native-fast-tflite");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const modelSource = require("../../assets/models/face_landmark.tflite");
        const model = await loadTensorflowModel(modelSource, []);
        console.log("[FaceMeshService] Model loaded successfully:", !!model);
        cachedMeshModel = model;
        return model;
      } catch (err) {
        console.warn("[FaceMeshService] Failed to load Face Mesh model:", err);
        return null;
      }
    })();
  }
  return meshModelLoadPromise;
}

/**
 * Extracts 468 dense 3D facial landmarks from a face crop using MediaPipe Face Mesh.
 */
export async function extractFaceMeshFromSkia(
  image: SkImage,
  bounds: NormalizedRect,
  model?: TfliteModel | null
): Promise<FaceMeshResult | null> {
  try {
    const tflite = model !== undefined ? model : await getOrLoadFaceMeshModel();
    if (!tflite) {
      return null;
    }

    const { Skia } = await import("@shopify/react-native-skia");

    const imgW = image.width();
    const imgH = image.height();

    // 25% margin padding to ensure full chin, temples, and forehead are in frame
    const marginX = bounds.width * 0.25;
    const marginY = bounds.height * 0.25;

    const cropX = Math.max(0, (bounds.x - marginX) * imgW);
    const cropY = Math.max(0, (bounds.y - marginY) * imgH);
    const cropR = Math.min(imgW, (bounds.x + bounds.width + marginX) * imgW);
    const cropB = Math.min(imgH, (bounds.y + bounds.height + marginY) * imgH);

    const cropW = Math.max(1, cropR - cropX);
    const cropH = Math.max(1, cropB - cropY);

    // MediaPipe Face Mesh takes 192x192 RGB input
    const surface = Skia.Surface.Make(192, 192);
    if (!surface) {
      return null;
    }

    const canvas = surface.getCanvas();
    const paint = Skia.Paint();

    const srcRect = Skia.XYWHRect(cropX, cropY, cropW, cropH);
    const dstRect = Skia.XYWHRect(0, 0, 192, 192);

    canvas.drawImageRect(image, srcRect, dstRect, paint);
    surface.flush();

    const snapshot = surface.makeImageSnapshot();
    const rawBytes = snapshot.readPixels();

    if (!rawBytes) {
      return null;
    }

    // Convert 192x192 RGBA to normalized float RGB in [0.0, 1.0]
    const floatInput = new Float32Array(192 * 192 * 3);
    let floatIdx = 0;
    for (let i = 0; i < rawBytes.length; i += 4) {
      floatInput[floatIdx++] = rawBytes[i] / 255.0;
      floatInput[floatIdx++] = rawBytes[i + 1] / 255.0;
      floatInput[floatIdx++] = rawBytes[i + 2] / 255.0;
    }

    const inputBuffer = floatInput.buffer.slice(
      floatInput.byteOffset,
      floatInput.byteOffset + floatInput.byteLength
    );

    const outputs = await tflite.run([inputBuffer]);
    if (!outputs || outputs.length === 0) {
      return null;
    }

    // outputs[0] is typically [1, 1404] representing 468 points (x, y, z)
    const rawLandmarks = new Float32Array(outputs[0]);
    const pointCount = Math.floor(rawLandmarks.length / 3);

    if (pointCount < 468) {
      return null;
    }

    // Confidence flag in outputs[1] if available
    let confidence = 0.95;
    if (outputs.length > 1) {
      const rawFlag = new Float32Array(outputs[1]);
      confidence = Math.max(0, Math.min(1, rawFlag[0]));
    }

    // Normalized bounds of the crop within the full photo
    const cropXNorm = cropX / imgW;
    const cropYNorm = cropY / imgH;
    const cropWNorm = cropW / imgW;
    const cropHNorm = cropH / imgH;

    const meshPoints: NormalizedPoint[] = [];

    // Eyebrows reference level for softening top forehead points
    const browLevelY =
      cropYNorm + (rawLandmarks[168 * 3 + 1] / 192.0) * cropHNorm; // point 168: between brows

    for (let i = 0; i < pointCount; i++) {
      const lx = rawLandmarks[i * 3] / 192.0;
      const ly = rawLandmarks[i * 3 + 1] / 192.0;

      let normX = cropXNorm + lx * cropWNorm;
      let normY = cropYNorm + ly * cropHNorm;

      // Pull forehead hairline points downward so mask blends on smooth forehead skin
      if (FOREHEAD_INDICES.has(i)) {
        normY = normY * 0.70 + browLevelY * 0.30;
      }

      meshPoints.push({
        x: Number(normX.toFixed(5)),
        y: Number(normY.toFixed(5)),
      });
    }

    // Extract ordered perimeter contour points
    const contourPoints: NormalizedPoint[] = [];
    for (const idx of FACE_OVAL_INDICES) {
      if (idx < meshPoints.length) {
        contourPoints.push(meshPoints[idx]);
      }
    }

    return {
      meshPoints,
      contourPoints,
      confidence,
    };
  } catch (err) {
    console.warn("[FaceMeshService] Failed to extract face mesh:", err);
    return null;
  }
}

/**
 * Creates an SkPath connecting the facial contour points for mask rendering.
 */
export async function createFaceContourSkPath(
  contourPoints: NormalizedPoint[],
  canvasW: number,
  canvasH: number
): Promise<SkPath | null> {
  if (contourPoints.length < 3) {
    return null;
  }

  try {
    const { Skia } = await import("@shopify/react-native-skia");
    const path = Skia.Path.Make();

    const first = contourPoints[0];
    path.moveTo(first.x * canvasW, first.y * canvasH);

    for (let i = 1; i < contourPoints.length; i++) {
      const pt = contourPoints[i];
      path.lineTo(pt.x * canvasW, pt.y * canvasH);
    }

    path.close();
    return path;
  } catch (err) {
    console.warn("[FaceMeshService] Failed to build SkPath:", err);
    return null;
  }
}
