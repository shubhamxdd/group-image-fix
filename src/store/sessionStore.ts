import { create } from "zustand";
import * as FileSystem from "expo-file-system/legacy";
import { Session } from "../types/session";
import { DetectedFace, Person, DetectionProgress } from "../types/detection";

export const initialDetectionProgress: DetectionProgress = {
  stage: "idle",
  currentPhotoIndex: 0,
  totalPhotos: 0,
  errorMessage: null,
};

interface SessionState {
  session: Session | null;
  activeToken: number;

  startImport: (sessionId: string) => { sessionId: string; token: number };
  setSessionReady: (session: Session, token: number) => boolean;
  setSessionError: (error: string, token: number) => boolean;
  setBasePhoto: (photoId: string) => void;
  setDetectionProgress: (progress: Partial<DetectionProgress>) => void;
  setDetectionResults: (
    detectedFaces: Record<string, DetectedFace>,
    persons: Person[],
    token: number
  ) => boolean;
  setDetectionError: (error: string, token: number) => boolean;
  resetSession: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  activeToken: 0,

  startImport: (sessionId: string) => {
    const nextToken = get().activeToken + 1;
    const newSession: Session = {
      id: sessionId,
      createdAt: Date.now(),
      status: "importing",
      basePhotoId: null,
      photos: [],
      detectedFaces: {},
      persons: [],
      detectionProgress: initialDetectionProgress,
      errorMessage: null,
    };
    set({ session: newSession, activeToken: nextToken });
    return { sessionId, token: nextToken };
  },

  setSessionReady: (session: Session, token: number) => {
    if (get().activeToken !== token) {
      return false;
    }
    set({ session: { ...session, status: "ready", errorMessage: null } });
    return true;
  },

  setSessionError: (error: string, token: number) => {
    if (get().activeToken !== token) {
      return false;
    }
    const current = get().session;
    if (current) {
      set({ session: { ...current, status: "error", errorMessage: error } });
    }
    return true;
  },

  setBasePhoto: (photoId: string) => {
    const current = get().session;
    if (current && current.status === "ready") {
      set({ session: { ...current, basePhotoId: photoId } });
    }
  },

  setDetectionProgress: (progress: Partial<DetectionProgress>) => {
    const current = get().session;
    if (current) {
      set({
        session: {
          ...current,
          detectionProgress: {
            ...current.detectionProgress,
            ...progress,
          },
        },
      });
    }
  },

  setDetectionResults: (
    detectedFaces: Record<string, DetectedFace>,
    persons: Person[],
    token: number
  ) => {
    if (get().activeToken !== token) {
      return false;
    }
    const current = get().session;
    if (current) {
      set({
        session: {
          ...current,
          detectedFaces,
          persons,
          detectionProgress: {
            stage: "done",
            currentPhotoIndex: current.photos.length,
            totalPhotos: current.photos.length,
            errorMessage: null,
          },
        },
      });
    }
    return true;
  },

  setDetectionError: (error: string, token: number) => {
    if (get().activeToken !== token) {
      return false;
    }
    const current = get().session;
    if (current) {
      set({
        session: {
          ...current,
          detectionProgress: {
            ...current.detectionProgress,
            stage: "error",
            errorMessage: error,
          },
        },
      });
    }
    return true;
  },

  resetSession: async () => {
    const current = get().session;
    const nextToken = get().activeToken + 1;
    set({ session: null, activeToken: nextToken });

    if (current && FileSystem.cacheDirectory) {
      const sessionDir = `${FileSystem.cacheDirectory}sessions/${current.id}/`;
      try {
        await FileSystem.deleteAsync(sessionDir, { idempotent: true });
      } catch (err) {
        console.warn("Failed to clean session cache:", err);
      }
    }
  },
}));
