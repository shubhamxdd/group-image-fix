import { Platform, Linking, Alert } from "react-native";

/**
 * Cross platform utility to open the saved composite image in the device gallery.
 */
export async function openImageInGallery(assetUri?: string | null): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      const iosPhotosUrl = "photos-redirect://";
      const canOpen = await Linking.canOpenURL(iosPhotosUrl);
      if (canOpen) {
        await Linking.openURL(iosPhotosUrl);
        return;
      }
    }

    if (assetUri) {
      try {
        const canOpenAsset = await Linking.canOpenURL(assetUri);
        if (canOpenAsset) {
          await Linking.openURL(assetUri);
          return;
        }
      } catch {
        // Continue to fallback
      }
    }

    if (Platform.OS === "android") {
      const androidGalleryUrl = "content://media/internal/images/media";
      try {
        const canOpenGallery = await Linking.canOpenURL(androidGalleryUrl);
        if (canOpenGallery) {
          await Linking.openURL(androidGalleryUrl);
          return;
        }
      } catch {
        // Fallback below
      }
    }

    Alert.alert(
      "Photo Saved",
      "The photo was saved to your device library. Please open your Gallery app to view it."
    );
  } catch (err) {
    console.warn("Failed to open gallery:", err);
    Alert.alert(
      "Photo Saved",
      "The photo was saved to your device library. Please open your Gallery app to view it."
    );
  }
}
