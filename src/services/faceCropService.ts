import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { DetectedFace } from "../types/detection";
import { Photo } from "../types/session";

const cropCache = new Map<string, string>();

/**
 * Returns the cropped thumbnail URI for a detected face, generating it
 * on demand via expo-image-manipulator if not already cached.
 */
export async function getOrGenerateFaceCropUri(
  face: DetectedFace,
  photo: Photo
): Promise<string | null> {
  if (face.cropUri) {
    return face.cropUri;
  }

  const cached = cropCache.get(face.id);
  if (cached) {
    return cached;
  }

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

  if (cropW <= 10 || cropH <= 10) {
    return null;
  }

  try {
    const cropResult = await manipulateAsync(
      photo.proxyUri,
      [
        { crop: { originX, originY, width: cropW, height: cropH } },
        { resize: { width: 140, height: 140 } },
      ],
      { compress: 0.85, format: SaveFormat.JPEG }
    );
    cropCache.set(face.id, cropResult.uri);
    face.cropUri = cropResult.uri;
    return cropResult.uri;
  } catch (err) {
    console.warn("Failed to generate face crop on demand:", face.id, err);
    return null;
  }
}
