# 0003. Face Detection and Person Grouping

**Date**: 2026-10-28
**Status**: Done

## Summary

This feature runs offline face detection on all imported group photos, scores each face expression for open eyes and smiling, and groups faces belonging to the same person across shots using on device neural network embeddings. Detection runs on downscaled 1080p proxy images via Google ML Kit to keep memory usage low. Face crops are processed directly in memory using React Native Skia pixel buffers and a quantized MobileFaceNet model via fast TensorFlow Lite to generate 192 dimensional feature vectors. A photo by photo bipartite matching engine groups faces into distinct person identities by cosine similarity, identifying every unique person across the burst sequence. The system also supports real time sensitivity tuning via preset buttons (Group More, Balanced, Strict) and an interactive continuous sensitivity slider (0.35 to 0.75) with member pairwise matching and non co-occurrence cluster merging.

## Requirements

**User stories**:
- As a user, I want all faces in my burst group photos detected automatically so that I do not have to draw boxes or tag people by hand.
- As a user, I want the app to recognize that the same person appears across multiple photos so that I can easily browse alternate expressions for each person.
- As a user, I want the app to calculate expression quality scores for each face so that blinking eyes and awkward expressions can be automatically identified without penalizing smiling faces.
- As a user, I want the app to work entirely offline so that my family and group photos remain completely private on my device.

**Acceptance criteria**:
- **AC-1**: Face detection runs offline on all imported session photos using downscaled 1080p proxy images, producing bounding boxes and facial landmarks normalized between 0 and 1, head Euler angles, and smiling and eye open probabilities.
- **AC-2**: A face expression quality score between 0 and 1 is calculated for every detected face using a balanced formula: `0.45 * avg(eyesOpen) + 0.45 * smile + 0.10 * poseUpright`, where pose upright is derived from Euler angles and undefined values fall back safely.
- **AC-3**: Face crops with 15% margin padding are processed directly in memory via React Native Skia into raw RGB float buffers and run through a bundled quantized MobileFaceNet TensorFlow Lite model, outputting a 192 dimensional L2 normalized float embedding vector for each face.
- **AC-4**: Detected faces across photos are grouped into unique person clusters using photo by photo bipartite matching with cosine similarity threshold 0.65, unioning all distinct persons identified across the burst without same photo exclusivity lockouts.
- **AC-5**: Each person cluster is labeled sequentially (Person 1, Person 2, and so on) ordered from left to right according to horizontal position on the base photo (with absent persons appended by their average horizontal position), and identifies the best face possessing the highest expression quality score.
- **AC-6**: The session state updates with detected faces, clustered persons, and detection progress status, honors active session token cancellation on reset, and exposes actions to trigger detection or clear detection results.

## Decision

**Chosen option**: Option 1: ML Kit Face Detection with In Memory Skia Tensor Crops, MobileFaceNet TFLite Embeddings, and Bipartite Matching.

The application detects faces on 1080p proxies using `@react-native-ml-kit/face-detection`, extracts raw RGB tensor buffers directly in memory using `@shopify/react-native-skia`, computes 192 dimensional L2 normalized embeddings using a bundled quantized MobileFaceNet model via `react-native-fast-tflite`, and clusters cross photo faces into person identities using photo by photo bipartite matching with cosine similarity threshold 0.65.

## Rationale

See [rationale.md](file:///home/shubhamxd/Desktop/code/img-gp/docs/specs/0003-face-detection-person-grouping/rationale.md) for context, evaluated options, and design decisions.

## Feature design

**Data model sketch**:

```typescript
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
  representativeEmbedding: number[];
}

export type DetectionStage = 'idle' | 'detecting' | 'embedding' | 'clustering' | 'done' | 'error';

export interface DetectionProgress {
  stage: DetectionStage;
  currentPhotoIndex: number;
  totalPhotos: number;
  errorMessage: string | null;
}
```

**Formulas and calculations**:
- `poseUpright`: `Math.max(0, 1 - (Math.abs(headEulerAngleX) + Math.abs(headEulerAngleY) + Math.abs(headEulerAngleZ)) / 90)`
- `qualityScore`: `(0.45 * (leftEyeOpen + rightEyeOpen) / 2) + (0.45 * smiling) + (0.10 * poseUpright)`
- Default fallbacks when ML Kit returns undefined: `smilingProbability = 0.0`, `leftEyeOpenProbability = 1.0`, `rightEyeOpenProbability = 1.0`, `headEulerAngleX = 0`, `headEulerAngleY = 0`, `headEulerAngleZ = 0`.
- MobileFaceNet input tensor: shape `[1, 112, 112, 3]`, RGB format, normalized as `(pixel - 127.5) / 128`.
- Cosine similarity: `dotProduct(vecA, vecB)` on L2 normalized vectors (range -1.0 to 1.0, threshold 0.65).
- Representative embedding: L2 normalized centroid of all assigned member face embeddings in that person cluster.

**State transitions**:
`idle` → `detecting` (ML Kit running across photos with concurrency limit 2) → `embedding` (Skia in memory crop and MobileFaceNet inference) → `clustering` (photo by photo bipartite matching) → `done` (persons and faces stored in state) or `error` (on failure). Calling `resetSession()` increments active session token, canceling any in flight detection.

**Service surface**:
| Service / Method | Inputs | Outputs | Behavior | Error cases |
|---|---|---|---|---|
| `detectFacesInPhoto(photo: Photo)` | Photo object with proxyUri | Array of raw ML Kit face objects | Runs ML Kit on proxyUri and normalizes bounds and landmarks to 0..1 | File unreadable, detection failure |
| `extractFaceEmbedding(skiaImage: SkImage, bounds: NormalizedRect, model: TFLiteModel)` | Loaded Skia image, face bounds, loaded TFLite model | 192 dimensional float array | Crops face with 15% margin directly in memory, scales to 112x112, runs model inference | Invalid bounds, inference error |
| `clusterFacesIntoPersons(faces: DetectedFace[], basePhotoId: string | null)` | All detected faces across photos, base photo ID | Array of Person clusters with assigned faceIds | Photo by photo bipartite matching with 0.65 threshold, left to right ordering | Empty faces array |
| `runFacePipeline(sessionId: string)` | Active session ID | void (updates session store) | Coordinates detection, embedding, clustering, and store mutation with activeToken check | Aborted token, missing assets |

**Value sourcing**:
| Field / Action | Value produced | Source |
|---|---|---|
| `DetectedFace.id` | Unique identifier | `Crypto.randomUUID()` |
| `DetectedFace.bounds` | Normalized coordinates 0..1 | ML Kit bounding box divided by proxy dimensions |
| `DetectedFace.qualityScore` | Float 0..1 | `0.45 * avg(eyesOpen) + 0.45 * smile + 0.10 * poseUpright` |
| `DetectedFace.embedding` | 192D float array | MobileFaceNet TFLite tensor output L2 normalized |
| `DetectedFace.cropUri` | Cached JPEG crop path | Saved on demand for UI thumbnails only |
| `Person.id` | Unique person identifier | `Crypto.randomUUID()` |
| `Person.label` | "Person 1", "Person 2", etc. | Ordered left to right by base photo center X, then average center X |
| `Person.bestFaceId` | Face ID with highest score | Selected from member faces by maximum `qualityScore` |

**Person ordering rule**:
1. Persons with faces visible on the base photo sort left to right by the horizontal center of their face bounding box on the base photo (`bounds.x + bounds.width / 2`).
2. Persons absent from the base photo sort after base photo persons, ordered left to right by the average horizontal center coordinate across the alternate photos where they appear.

**Key invariants**:
- Detection coordinates and landmarks are always stored normalized between 0 and 1 so they scale accurately to both preview screens and full resolution originals.
- Face crops include 15% margin padding clamped inside image boundaries, preserving aspect ratio with center padding where needed.
- Raw tensor buffers are extracted directly in memory using Skia to eliminate disk I/O churn.
- No person cluster may contain two faces from the same photo.
- All computation runs 100% offline on device with zero cloud network calls.

**Security model**:
- Operates entirely on device with local cached images.
- No facial data, embeddings, or identity clusters ever leave the device.

**Critical test scenarios**:
- Scenario 1: Multi photo detection runs on 1080p proxies with concurrency 2, extracting normalized bounds, landmarks, and expression scores (satisfies **AC-1**, **AC-2**).
- Scenario 2: Skia extracts raw pixel buffers in memory and generates 192D L2 normalized embeddings via MobileFaceNet TFLite model (satisfies **AC-3**).
- Scenario 3: Bipartite matching groups cross photo faces into person clusters with threshold 0.65 without lockouts (satisfies **AC-4**).
- Scenario 4: Person clusters sort horizontally on the base photo and append absent persons deterministically, marking the face with highest expression score as best face (satisfies **AC-5**).
- Scenario 5: Unequal face counts across photos correctly group all unique persons across the burst without crashing (satisfies **AC-4**, **AC-6**).
- Scenario 6: Active session token aborts in flight detection immediately on session reset (satisfies **AC-6**).

## Build plan

1. Bundle the quantized MobileFaceNet TFLite model asset into `assets/models/mobilefacenet.tflite` and register with Metro asset loader, satisfies **AC-3**
2. Define detection and person clustering TypeScript interfaces in `src/types/detection.ts` and extend session contracts, satisfies **AC-1**, **AC-5**, **AC-6**
3. Implement face detection service with ML Kit, normalized coordinates, and balanced expression quality score formula, satisfies **AC-1**, **AC-2**
4. Implement face embedding service using `@shopify/react-native-skia` in memory pixel extraction and `react-native-fast-tflite`, satisfies **AC-3**
5. Implement photo by photo bipartite clustering engine with cosine similarity threshold 0.65 and left to right horizontal ordering, satisfies **AC-4**, **AC-5**
6. Wire detection pipeline into Zustand session store with activeToken cancellation and display face bounding boxes, person cards, and quality scores in the user interface, satisfies **AC-6**

## Consequences

**Positive**:
- 100% offline compute ensures complete user privacy.
- In memory Skia tensor extraction eliminates heavy disk read and write churn.
- Bipartite matching prevents photo exclusivity lockouts and yields globally optimal person clustering.
- Balanced quality scoring rewards genuine smiles without penalizing laughing squints.

**Negative / tradeoffs**:
- Bundling MobileFaceNet adds approximately 2 megabytes to the application binary size.
- Running detection and embeddings across 10 burst photos with 4 people takes approximately 2 to 4 seconds on device.

## Follow-up

- [ ] Add caching for face crop images on demand to allow instantaneous thumbnail previews in the interactive expression switcher.
