import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat, ActionResize } from "expo-image-manipulator";
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
      const maxDim = Math.max(origWidth, origHeight);

      const resizeActions: { resize: ActionResize["resize"] }[] = [];
      if (maxDim > 1080) {
        if (origWidth >= origHeight) {
          resizeActions.push({ resize: { width: 1080 } });
        } else {
          resizeActions.push({ resize: { height: 1080 } });
        }
      }

      const manipResult = await manipulateAsync(
        targetOriginalUri,
        resizeActions,
        {
          compress: 0.85,
          format: SaveFormat.JPEG,
        }
      );

      const targetProxyUri = `${proxiesDir}${photoId}.jpg`;
      await FileSystem.moveAsync({
        from: manipResult.uri,
        to: targetProxyUri,
      });

      const photo: Photo = {
        id: photoId,
        originalUri: targetOriginalUri,
        proxyUri: targetProxyUri,
        width: origWidth,
        height: origHeight,
        proxyWidth: manipResult.width,
        proxyHeight: manipResult.height,
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
