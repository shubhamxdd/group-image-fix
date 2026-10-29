import { create } from "zustand";
import * as FileSystem from "expo-file-system/legacy";
import { Session } from "../types/session";
import { DetectedFace, Person, DetectionProgress } from "../types/detection";
import {
  clusterFacesIntoPersons,
  DEFAULT_SIMILARITY_THRESHOLD,
} from "../services/personClusteringService";

export const initialDetectionProgress: DetectionProgress = {
  stage: "idle",
  currentPhotoIndex: 0,
  totalPhotos: 0,
  errorMessage: null,
};

interface SessionState {
  session: Session | null;
  activeToken: number;
  clusteringThreshold: number;

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
  setClusteringThreshold: (threshold: number) => void;
  reclusterPersons: (threshold?: number) => void;
  resetSession: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  activeToken: 0,
  clusteringThreshold: DEFAULT_SIMILARITY_THRESHOLD,

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
      const faceList = Object.values(current.detectedFaces);
      if (faceList.length > 0 && current.detectionProgress.stage === "done") {
        const { persons, updatedFaces } = clusterFacesIntoPersons(
          faceList,
          photoId,
          { similarityThreshold: get().clusteringThreshold }
        );
        set({
          session: {
            ...current,
            basePhotoId: photoId,
            detectedFaces: updatedFaces,
            persons,
          },
        });
        return;
      }
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

  setClusteringThreshold: (threshold: number) => {
    set({ clusteringThreshold: threshold });
  },

  reclusterPersons: (threshold?: number) => {
    const targetThreshold = threshold ?? get().clusteringThreshold;
    const current = get().session;
    if (!current || !current.detectedFaces) {
      set({ clusteringThreshold: targetThreshold });
      return;
    }

    const faceList = Object.values(current.detectedFaces);
    if (faceList.length === 0) {
      set({ clusteringThreshold: targetThreshold });
      return;
    }

    const { persons, updatedFaces } = clusterFacesIntoPersons(
      faceList,
      current.basePhotoId,
      { similarityThreshold: targetThreshold }
    );

    set({
      clusteringThreshold: targetThreshold,
      session: {
        ...current,
        detectedFaces: updatedFaces,
        persons,
      },
    });
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
