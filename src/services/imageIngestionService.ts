import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { ImagePickerAsset } from "expo-image-picker";
import { Photo } from "../types/session";

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

export async function ingestPhotos(
  sessionId: string,
  assets: ImagePickerAsset[]
): Promise<Photo[]> {
  if (!FileSystem.cacheDirectory) {
    throw new Error("Cache directory is not available on this device.");
  }

  const sessionDir = `${FileSystem.cacheDirectory}sessions/${sessionId}/`;
  const originalsDir = `${sessionDir}originals/`;
  const proxiesDir = `${sessionDir}proxies/`;

  try {
    await FileSystem.makeDirectoryAsync(originalsDir, { intermediates: true });
    await FileSystem.makeDirectoryAsync(proxiesDir, { intermediates: true });

    const photos = await mapWithConcurrency(assets, 2, async (asset) => {
      const photoId = Crypto.randomUUID();
      const rawExt = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const cleanExt = ["jpg", "jpeg", "png", "heic", "webp"].includes(rawExt)
        ? rawExt
        : "jpg";

      const targetOriginalUri = `${originalsDir}${photoId}.${cleanExt}`;
      await FileSystem.copyAsync({
        from: asset.uri,
        to: targetOriginalUri,
      });

      const origWidth = asset.width || 1080;
      const origHeight = asset.height || 1080;

      // Ingest at full original resolution without compression or downscaling
      const targetProxyUri = `${proxiesDir}${photoId}.${cleanExt}`;
      await FileSystem.copyAsync({
        from: targetOriginalUri,
        to: targetProxyUri,
      });

      const photo: Photo = {
        id: photoId,
        originalUri: targetOriginalUri,
        proxyUri: targetProxyUri,
        width: origWidth,
        height: origHeight,
        proxyWidth: origWidth,
        proxyHeight: origHeight,
        createdAt: Date.now(),
      };

      return photo;
    });

    return photos;
  } catch (err) {
    try {
      await FileSystem.deleteAsync(sessionDir, { idempotent: true });
    } catch {
      // Ignore cleanup error on failure
    }
    throw err;
  }
}
