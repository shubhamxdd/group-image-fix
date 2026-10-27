import { Skia, SkImage } from "@shopify/react-native-skia";
import { loadTensorflowModel, TfliteModel } from "react-native-fast-tflite";
import { NormalizedRect } from "../types/detection";

let cachedModel: TfliteModel | null = null;
let modelLoadPromise: Promise<TfliteModel> | null = null;

export async function getOrLoadMobileFaceNetModel(): Promise<TfliteModel> {
  if (cachedModel) {
    return cachedModel;
  }
  if (!modelLoadPromise) {
    modelLoadPromise = (async () => {
      // In Expo, local assets with metro tflite resolver can be loaded via require
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const modelSource = require("../../assets/models/mobilefacenet.tflite");
      const model = await loadTensorflowModel(modelSource, []);
      cachedModel = model;
      return model;
    })();
  }
  return modelLoadPromise;
}

export function l2Normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return Number(dot.toFixed(6));
}

export function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  const dim = embeddings[0].length;
  const mean = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      mean[i] += emb[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    mean[i] /= embeddings.length;
  }
  return l2Normalize(mean);
}

export async function extractFaceEmbeddingFromSkia(
  image: SkImage,
  bounds: NormalizedRect,
  model?: TfliteModel
): Promise<number[]> {
  const tflite = model || (await getOrLoadMobileFaceNetModel());

  const imgW = image.width();
  const imgH = image.height();

  // Add 15% margin padding
  const marginX = bounds.width * 0.15;
  const marginY = bounds.height * 0.15;

  const cropX = Math.max(0, (bounds.x - marginX) * imgW);
  const cropY = Math.max(0, (bounds.y - marginY) * imgH);
  const cropR = Math.min(imgW, (bounds.x + bounds.width + marginX) * imgW);
  const cropB = Math.min(imgH, (bounds.y + bounds.height + marginY) * imgH);

  const cropW = Math.max(1, cropR - cropX);
  const cropH = Math.max(1, cropB - cropY);

  // Render crop into offscreen 112x112 Skia surface
  const surface = Skia.Surface.Make(112, 112);
  if (!surface) {
    throw new Error("Failed to create offscreen Skia surface for face crop.");
  }

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();

  const srcRect = Skia.XYWHRect(cropX, cropY, cropW, cropH);
  const dstRect = Skia.XYWHRect(0, 0, 112, 112);

  canvas.drawImageRect(image, srcRect, dstRect, paint);
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const rawBytes = snapshot.readPixels();

  if (!rawBytes) {
    throw new Error("Failed to read pixels from face crop snapshot.");
  }

  // Convert 112x112 RGBA bytes to normalized Float32Array RGB: (pixel - 127.5) / 128
  const floatInput = new Float32Array(112 * 112 * 3);
  let floatIdx = 0;
  for (let i = 0; i < rawBytes.length; i += 4) {
    floatInput[floatIdx++] = (rawBytes[i] - 127.5) / 128;
    floatInput[floatIdx++] = (rawBytes[i + 1] - 127.5) / 128;
    floatInput[floatIdx++] = (rawBytes[i + 2] - 127.5) / 128;
  }

  const outputs = await tflite.run([floatInput.buffer]);
  if (!outputs || outputs.length === 0) {
    throw new Error("Fast-TFLite model returned no output tensors.");
  }

  const rawEmbedding = new Float32Array(outputs[0]);
  const embeddingArray = Array.from(rawEmbedding);
  return l2Normalize(embeddingArray);
}
