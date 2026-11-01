import { create } from "zustand";
import * as FileSystem from "expo-file-system/legacy";
import { Session } from "../types/session";
import { DetectedFace, Person, DetectionProgress } from "../types/detection";
import { BlendParameters, BlendResult, FaceSwapSelection } from "../types/blend";
import {
  clusterFacesIntoPersons,
  DEFAULT_SIMILARITY_THRESHOLD,
} from "../services/personClusteringService";
import { computeAffineAlignment } from "../services/faceAlignmentService";
import { renderCompositePreview } from "../services/faceBlendingEngine";

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
  blendSequenceToken: number;

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
  setFaceSwap: (
    personId: string,
    donorFaceId: string,
    options?: { featherRadius?: number; colorTransferEnabled?: boolean }
  ) => Promise<BlendResult | null>;
  removeFaceSwap: (personId: string) => Promise<BlendResult | null>;
  revertAllSwaps: () => Promise<void>;
  setBlendParameters: (
    personId: string,
    params: Partial<BlendParameters>
  ) => Promise<BlendResult | null>;
  renamePerson: (personId: string, newName: string) => void;
  resetSession: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  activeToken: 0,
  clusteringThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  blendSequenceToken: 0,

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
      swaps: {},
      activeBlendPreviewUri: null,
      isBlending: false,
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
            swaps: {},
            activeBlendPreviewUri: null,
            isBlending: false,
          },
        });
        return;
      }
      set({
        session: {
          ...current,
          basePhotoId: photoId,
          swaps: {},
          activeBlendPreviewUri: null,
          isBlending: false,
        },
      });
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

  setFaceSwap: async (
    personId: string,
    donorFaceId: string,
    options?: { featherRadius?: number; colorTransferEnabled?: boolean }
  ) => {
    const current = get().session;
    if (!current || !current.basePhotoId) {
      return null;
    }

    const donorFace = current.detectedFaces[donorFaceId];
    if (!donorFace) {
      return null;
    }

    const baseFace = Object.values(current.detectedFaces).find(
      (f) => f.photoId === current.basePhotoId && f.personId === personId
    );

    if (!baseFace) {
      return null;
    }

    // Selecting the face from the base photo reverts the swap
    if (donorFace.id === baseFace.id) {
      return get().removeFaceSwap(personId);
    }

    const affineMatrix = computeAffineAlignment(donorFace, baseFace);
    const selection: FaceSwapSelection = {
      personId,
      donorFaceId,
      donorPhotoId: donorFace.photoId,
      blendParams: {
        affineMatrix,
        featherRadius: options?.featherRadius ?? 0.25,
        colorTransferEnabled: options?.colorTransferEnabled ?? true,
      },
      appliedAt: Date.now(),
    };

    const updatedSwaps = {
      ...current.swaps,
      [personId]: selection,
    };

    const callToken = get().blendSequenceToken + 1;
    set({
      blendSequenceToken: callToken,
      session: {
        ...current,
        swaps: updatedSwaps,
        isBlending: true,
      },
    });

    const blendResult = await renderCompositePreview(
      { ...current, swaps: updatedSwaps },
      updatedSwaps
    );

    if (get().blendSequenceToken === callToken) {
      const activeSession = get().session;
      if (activeSession && activeSession.id === current.id) {
        const previewWithCacheBuster = blendResult?.previewUri
          ? `${blendResult.previewUri}?t=${Date.now()}`
          : null;
        set({
          session: {
            ...activeSession,
            activeBlendPreviewUri: previewWithCacheBuster,
            isBlending: false,
          },
        });
      }
    }

    return blendResult;
  },

  removeFaceSwap: async (personId: string) => {
    const current = get().session;
    if (!current) {
      return null;
    }

    const updatedSwaps = { ...current.swaps };
    delete updatedSwaps[personId];

    const callToken = get().blendSequenceToken + 1;
    set({
      blendSequenceToken: callToken,
      session: {
        ...current,
        swaps: updatedSwaps,
        isBlending: true,
      },
    });

    const blendResult = await renderCompositePreview(
      { ...current, swaps: updatedSwaps },
      updatedSwaps
    );

    if (get().blendSequenceToken === callToken) {
      const activeSession = get().session;
      if (activeSession && activeSession.id === current.id) {
        const hasActiveSwaps = Object.keys(updatedSwaps).length > 0;
        const previewWithCacheBuster =
          hasActiveSwaps && blendResult?.previewUri
            ? `${blendResult.previewUri}?t=${Date.now()}`
            : null;
        set({
          session: {
            ...activeSession,
            activeBlendPreviewUri: previewWithCacheBuster,
            isBlending: false,
          },
        });
      }
    }

    return blendResult;
  },

  revertAllSwaps: async () => {
    const current = get().session;
    if (!current) {
      return;
    }
    const callToken = get().blendSequenceToken + 1;
    set({
      blendSequenceToken: callToken,
      session: {
        ...current,
        swaps: {},
        activeBlendPreviewUri: null,
        isBlending: false,
      },
    });
  },

  setBlendParameters: async (
    personId: string,
    params: Partial<BlendParameters>
  ) => {
    const current = get().session;
    if (!current || !current.swaps[personId]) {
      return null;
    }

    const existing = current.swaps[personId];
    const updatedSelection: FaceSwapSelection = {
      ...existing,
      blendParams: {
        ...existing.blendParams,
        ...params,
      },
    };

    const updatedSwaps = {
      ...current.swaps,
      [personId]: updatedSelection,
    };

    const callToken = get().blendSequenceToken + 1;
    set({
      blendSequenceToken: callToken,
      session: {
        ...current,
        swaps: updatedSwaps,
        isBlending: true,
      },
    });

    const blendResult = await renderCompositePreview(
      { ...current, swaps: updatedSwaps },
      updatedSwaps
    );

    if (get().blendSequenceToken === callToken) {
      const activeSession = get().session;
      if (activeSession && activeSession.id === current.id) {
        const previewWithCacheBuster = blendResult?.previewUri
          ? `${blendResult.previewUri}?t=${Date.now()}`
          : null;
        set({
          session: {
            ...activeSession,
            activeBlendPreviewUri: previewWithCacheBuster,
            isBlending: false,
          },
        });
      }
    }

    return blendResult;
  },

  renamePerson: (personId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const current = get().session;
    if (!current) return;

    const updatedPersons = current.persons.map((p) =>
      p.id === personId ? { ...p, label: trimmed } : p
    );

    set({
      session: {
        ...current,
        persons: updatedPersons,
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
