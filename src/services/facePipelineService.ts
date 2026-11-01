import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Photo } from "../types/session";
import { DetectedFace } from "../types/detection";
import { useSessionStore } from "../store/sessionStore";
import { detectFacesInPhoto } from "./faceDetectionService";
import {
  extractFaceEmbeddingFromSkia,
  getOrLoadMobileFaceNetModel,
} from "./faceEmbeddingService";
import { clusterFacesIntoPersons } from "./personClusteringService";

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function runFaceDetectionPipeline(
  sessionId: string,
  token: number
): Promise<boolean> {
  const store = useSessionStore.getState();
  const session = store.session;

  if (!session || session.id !== sessionId || session.status !== "ready") {
    return false;
  }

  try {
    store.setDetectionProgress({
      stage: "detecting",
      currentPhotoIndex: 0,
      totalPhotos: session.photos.length,
      errorMessage: null,
    });

    // Step 1: Detect faces across photos (concurrency limit = 2)
    let detectedFacesNested: DetectedFace[][];
    try {
      detectedFacesNested = await mapWithConcurrency(
        session.photos,
        2,
        async (photo: Photo, index: number) => {
          if (useSessionStore.getState().activeToken !== token) {
            throw new Error("Pipeline aborted: session token mismatch.");
          }

          const faces = await detectFacesInPhoto(photo);

          useSessionStore.getState().setDetectionProgress({
            currentPhotoIndex: index + 1,
          });

          return faces;
        }
      );
    } catch (detectErr: any) {
      const errMsg = detectErr?.message || "";
      if (
        errMsg.includes("The package '@react-native-ml-kit/face-detection' doesn't seem to be linked") ||
        errMsg.includes("NativeFaceDetection")
      ) {
        throw new Error(
          "Native build required: Face detection requires an Expo development build (run 'npx expo run:android' or 'npx expo run:ios'). Expo Go does not bundle native ML Kit."
        );
      }
      throw detectErr;
    }

    if (useSessionStore.getState().activeToken !== token) {
      return false;
    }

    const allFaces: DetectedFace[] = detectedFacesNested.flat();

    if (allFaces.length === 0) {
      store.setDetectionResults({}, [], token);
      return true;
    }

    const photoMap = new Map<string, Photo>();
    for (const p of session.photos) {
      photoMap.set(p.id, p);
    }

    // Step 2: Extract embeddings for each face in memory via Skia if model is available
    store.setDetectionProgress({
      stage: "embedding",
      currentPhotoIndex: 0,
      totalPhotos: allFaces.length,
    });

    const model = await getOrLoadMobileFaceNetModel();
    console.log("[DetectionPipeline] Model loaded:", !!model);

    if (model) {
      // Dynamically load Skia to avoid top-level evaluation crashes
      let SkiaApi: typeof import("@shopify/react-native-skia")["Skia"] | null = null;
      try {
        const skiaModule = await import("@shopify/react-native-skia");
        SkiaApi = skiaModule.Skia;
      } catch (skiaErr) {
        console.warn("Skia module unavailable for embedding extraction:", skiaErr);
      }

      if (SkiaApi) {
        // Group faces by photo to load each photo Skia image only once
        const facesByPhotoId = new Map<string, DetectedFace[]>();
        for (const face of allFaces) {
          const list = facesByPhotoId.get(face.photoId) || [];
          list.push(face);
          facesByPhotoId.set(face.photoId, list);
        }

        let processedFaceCount = 0;
        for (const [photoId, photoFaces] of facesByPhotoId.entries()) {
          if (useSessionStore.getState().activeToken !== token) {
            return false;
          }

          const photo = photoMap.get(photoId);
          if (!photo) continue;

          try {
            const fileData = await FileSystem.readAsStringAsync(photo.proxyUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const skiaData = SkiaApi.Data.fromBase64(fileData);
            const skiaImage = SkiaApi.Image.MakeImageFromEncoded(skiaData);

            if (!skiaImage) {
              console.warn("Could not decode Skia image from proxy:", photo.proxyUri);
              continue;
            }

            for (const face of photoFaces) {
              if (useSessionStore.getState().activeToken !== token) {
                return false;
              }

              try {
                const embedding = await extractFaceEmbeddingFromSkia(
                  skiaImage,
                  face.bounds,
                  model
                );
                if (embedding) {
                  face.embedding = embedding;
                }
              } catch (embErr) {
                console.warn("Face embedding extraction error:", embErr);
              }

              processedFaceCount++;
              useSessionStore.getState().setDetectionProgress({
                currentPhotoIndex: processedFaceCount,
              });
            }
          } catch (imgErr) {
            console.warn("Skia image load error for photo:", photoId, imgErr);
          }
        }
      }
    }

    if (useSessionStore.getState().activeToken !== token) {
      return false;
    }

    // Step 3: Cluster faces into unique person identities (bipartite matching with spatial fallback)
    store.setDetectionProgress({
      stage: "clustering",
    });

    const currentThreshold = useSessionStore.getState().clusteringThreshold;
    const { persons, updatedFaces } = clusterFacesIntoPersons(
      allFaces,
      session.basePhotoId,
      { similarityThreshold: currentThreshold }
    );

    // Step 4: Generate crisp face crop thumbnails for all detected faces and persons
    for (const face of Object.values(updatedFaces)) {
      const photo = photoMap.get(face.photoId);
      if (!photo) continue;

      const marginX = face.bounds.width * 0.15;
      const marginY = face.bounds.height * 0.15;

      const originX = Math.max(
        0,
        Math.round((face.bounds.x - marginX) * photo.proxyWidth)
      );
      const originY = Math.max(
        0,
        Math.round((face.bounds.y - marginY) * photo.proxyHeight)
      );
      const cropW = Math.min(
        photo.proxyWidth - originX,
        Math.round((face.bounds.width + marginX * 2) * photo.proxyWidth)
      );
      const cropH = Math.min(
        photo.proxyHeight - originY,
        Math.round((face.bounds.height + marginY * 2) * photo.proxyHeight)
      );

      if (cropW > 10 && cropH > 10) {
        try {
          const cropResult = await manipulateAsync(
            photo.proxyUri,
            [
              { crop: { originX, originY, width: cropW, height: cropH } },
              { resize: { width: 140, height: 140 } },
            ],
            { compress: 0.85, format: SaveFormat.JPEG }
          );
          face.cropUri = cropResult.uri;
        } catch (cropErr) {
          console.warn("Could not generate face thumbnail:", face.id, cropErr);
        }
      }
    }

    // Set person thumbnailUri to their bestFace thumbnail
    for (const person of persons) {
      if (person.bestFaceId && updatedFaces[person.bestFaceId]?.cropUri) {
        person.thumbnailUri = updatedFaces[person.bestFaceId].cropUri;
      }
    }

    // Step 5: Save results to session store
    const applied = store.setDetectionResults(updatedFaces, persons, token);
    return applied;
  } catch (err: any) {
    if (useSessionStore.getState().activeToken === token) {
      const msg = err?.message || "Failed during face detection and grouping.";
      store.setDetectionError(msg, token);
    }
    return false;
  }
}
