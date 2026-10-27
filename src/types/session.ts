import { DetectedFace, Person, DetectionProgress } from "./detection";

export interface Photo {
  id: string;
  originalUri: string;
  proxyUri: string;
  width: number;
  height: number;
  proxyWidth: number;
  proxyHeight: number;
  createdAt: number;
}

export type SessionStatus = "idle" | "importing" | "ready" | "error";

export interface Session {
  id: string;
  createdAt: number;
  status: SessionStatus;
  basePhotoId: string | null;
  photos: Photo[];
  detectedFaces: Record<string, DetectedFace>;
  persons: Person[];
  detectionProgress: DetectionProgress;
  errorMessage: string | null;
}
