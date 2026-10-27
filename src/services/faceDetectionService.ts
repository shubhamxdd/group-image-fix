import * as Crypto from "expo-crypto";
import FaceDetection, {
  Face,
  FaceDetectionOptions,
} from "@react-native-ml-kit/face-detection";
import { Photo } from "../types/session";
import {
  DetectedFace,
  NormalizedPoint,
  NormalizedRect,
  FaceLandmarks,
} from "../types/detection";

const DETECTION_OPTIONS: FaceDetectionOptions = {
  performanceMode: "accurate",
  landmarkMode: "all",
  classificationMode: "all",
  minFaceSize: 0.08,
};

export function calculateQualityScore(face: Face): number {
  const smile =
    typeof face.smilingProbability === "number" ? face.smilingProbability : 0.0;
  const leftEye =
    typeof face.leftEyeOpenProbability === "number"
      ? face.leftEyeOpenProbability
      : 1.0;
  const rightEye =
    typeof face.rightEyeOpenProbability === "number"
      ? face.rightEyeOpenProbability
      : 1.0;

  const avgEyes = (leftEye + rightEye) / 2;

  const sumAngles =
    Math.abs(face.rotationX || 0) +
    Math.abs(face.rotationY || 0) +
    Math.abs(face.rotationZ || 0);
  const poseUpright = Math.max(0, 1 - sumAngles / 90);

  const rawScore = 0.45 * avgEyes + 0.45 * smile + 0.1 * poseUpright;
  return Math.max(0, Math.min(1, Number(rawScore.toFixed(4))));
}

export function normalizeBounds(
  frame: Face["frame"],
  imageWidth: number,
  imageHeight: number
): NormalizedRect {
  const safeW = imageWidth > 0 ? imageWidth : 1080;
  const safeH = imageHeight > 0 ? imageHeight : 1080;

  const x = Math.max(0, Math.min(1, frame.left / safeW));
  const y = Math.max(0, Math.min(1, frame.top / safeH));
  const width = Math.max(0, Math.min(1 - x, frame.width / safeW));
  const height = Math.max(0, Math.min(1 - y, frame.height / safeH));

  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4)),
  };
}

export function normalizePoint(
  pt: { x: number; y: number } | undefined,
  imageWidth: number,
  imageHeight: number
): NormalizedPoint | undefined {
  if (!pt) return undefined;
  const safeW = imageWidth > 0 ? imageWidth : 1080;
  const safeH = imageHeight > 0 ? imageHeight : 1080;

  return {
    x: Number(Math.max(0, Math.min(1, pt.x / safeW)).toFixed(4)),
    y: Number(Math.max(0, Math.min(1, pt.y / safeH)).toFixed(4)),
  };
}

export async function detectFacesInPhoto(photo: Photo): Promise<DetectedFace[]> {
  const rawFaces = await FaceDetection.detect(photo.proxyUri, DETECTION_OPTIONS);

  const faces: DetectedFace[] = rawFaces.map((raw) => {
    const bounds = normalizeBounds(raw.frame, photo.proxyWidth, photo.proxyHeight);

    let landmarks: FaceLandmarks | undefined;
    if (raw.landmarks) {
      landmarks = {
        leftEye: normalizePoint(
          raw.landmarks.leftEye?.position,
          photo.proxyWidth,
          photo.proxyHeight
        ),
        rightEye: normalizePoint(
          raw.landmarks.rightEye?.position,
          photo.proxyWidth,
          photo.proxyHeight
        ),
        nose: normalizePoint(
          raw.landmarks.noseBase?.position,
          photo.proxyWidth,
          photo.proxyHeight
        ),
        mouthLeft: normalizePoint(
          raw.landmarks.mouthLeft?.position,
          photo.proxyWidth,
          photo.proxyHeight
        ),
        mouthRight: normalizePoint(
          raw.landmarks.mouthRight?.position,
          photo.proxyWidth,
          photo.proxyHeight
        ),
      };
    }

    const qualityScore = calculateQualityScore(raw);

    const detectedFace: DetectedFace = {
      id: Crypto.randomUUID(),
      photoId: photo.id,
      personId: null,
      bounds,
      landmarks,
      headEulerAngleX: raw.rotationX || 0,
      headEulerAngleY: raw.rotationY || 0,
      headEulerAngleZ: raw.rotationZ || 0,
      smilingProbability:
        typeof raw.smilingProbability === "number" ? raw.smilingProbability : 0.0,
      leftEyeOpenProbability:
        typeof raw.leftEyeOpenProbability === "number"
          ? raw.leftEyeOpenProbability
          : 1.0,
      rightEyeOpenProbability:
        typeof raw.rightEyeOpenProbability === "number"
          ? raw.rightEyeOpenProbability
          : 1.0,
      qualityScore,
    };

    return detectedFace;
  });

  return faces;
}
