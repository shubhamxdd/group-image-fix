import { create } from "zustand";
import * as FileSystem from "expo-file-system/legacy";
import { Session } from "../types/session";

interface SessionState {
  session: Session | null;
  activeToken: number;

  startImport: (sessionId: string) => { sessionId: string; token: number };
  setSessionReady: (session: Session, token: number) => boolean;
  setSessionError: (error: string, token: number) => boolean;
  setBasePhoto: (photoId: string) => void;
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
