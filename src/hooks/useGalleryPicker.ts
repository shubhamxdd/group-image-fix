import { useState, useCallback } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { useSessionStore } from "../store/sessionStore";
import { ingestPhotos } from "../services/imageIngestionService";
import { Session } from "../types/session";

export function useGalleryPicker() {
  const [isPicking, setIsPicking] = useState(false);
  const startImport = useSessionStore((state) => state.startImport);
  const setSessionReady = useSessionStore((state) => state.setSessionReady);
  const setSessionError = useSessionStore((state) => state.setSessionError);
  const session = useSessionStore((state) => state.session);
  const resetSession = useSessionStore((state) => state.resetSession);
  const setBasePhoto = useSessionStore((state) => state.setBasePhoto);

  const openPicker = useCallback(async () => {
    try {
      setIsPicking(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 1,
      });

      if (result.canceled) {
        setIsPicking(false);
        return;
      }

      const count = result.assets.length;
      if (count < 2) {
        Alert.alert(
          "Selection Needed",
          "Please select at least 2 group photos to compare and swap expressions."
        );
        setIsPicking(false);
        return;
      }

      if (count > 10) {
        Alert.alert(
          "Selection Capped",
          "A maximum of 10 photos is supported. Processing the first 10 photos."
        );
      }

      const assetsToProcess = result.assets.slice(0, 10);
      const sessionId = Crypto.randomUUID();
      const { token } = startImport(sessionId);

      try {
        const photos = await ingestPhotos(sessionId, assetsToProcess);
        const newSession: Session = {
          id: sessionId,
          createdAt: Date.now(),
          status: "ready",
          basePhotoId: photos[0].id,
          photos,
          errorMessage: null,
        };

        const applied = setSessionReady(newSession, token);
        if (!applied) {
          // Import was canceled or superseded
          console.log("Import result superseded by session reset.");
        }
      } catch (err: any) {
        const message = err?.message || "Failed to import selected photos.";
        setSessionError(message, token);
        Alert.alert("Import Error", message);
      }
    } catch (err: any) {
      Alert.alert("Gallery Error", err?.message || "Could not open photo gallery.");
    } finally {
      setIsPicking(false);
    }
  }, [startImport, setSessionReady, setSessionError]);

  return {
    openPicker,
    isPicking,
    session,
    resetSession,
    setBasePhoto,
  };
}
