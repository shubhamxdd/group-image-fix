export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface FaceLandmarks {
  leftEye?: NormalizedPoint;
  rightEye?: NormalizedPoint;
  nose?: NormalizedPoint;
  mouthLeft?: NormalizedPoint;
  mouthRight?: NormalizedPoint;
}

export interface DetectedFace {
  id: string;
  photoId: string;
  personId: string | null;
  bounds: NormalizedRect;
  landmarks?: FaceLandmarks;
  headEulerAngleX: number;
  headEulerAngleY: number;
  headEulerAngleZ: number;
  smilingProbability: number;
  leftEyeOpenProbability: number;
  rightEyeOpenProbability: number;
  qualityScore: number;
  embedding?: number[];
  cropUri?: string;
}

export interface Person {
  id: string;
  label: string;
  faceIds: string[];
  bestFaceId: string | null;
  thumbnailUri?: string;
  representativeEmbedding: number[];
}

export type DetectionStage =
  | "idle"
  | "detecting"
  | "embedding"
  | "clustering"
  | "done"
  | "error";

export interface DetectionProgress {
  stage: DetectionStage;
  currentPhotoIndex: number;
  totalPhotos: number;
  errorMessage: string | null;
}
