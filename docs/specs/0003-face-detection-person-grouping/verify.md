# Verify: Face Detection and Person Grouping · spec 0003 · updated 2026-10-28

Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones.

## Automated Checks
- [x] `bunx tsc --noEmit` checks clean with zero type errors (covers AC-1, AC-2, AC-3, AC-4, AC-5, AC-6)
- [x] `npx expo lint` checks clean with zero warnings or errors (covers AC-1 through AC-6)
- [x] `node --test` tests expression quality scoring formula, upright head pose computation, and missing probability fallbacks (covers AC-2)
- [x] `node --test` tests vector math, L2 normalization, and cosine similarity calculations (covers AC-3, AC-4)
- [x] `node --test` tests photo by photo bipartite clustering, same photo exclusivity, left to right base photo ordering, and best face assignment (covers AC-4, AC-5)
- [x] Model bundle check: `assets/models/mobilefacenet.tflite` is present and registered via `metro.config.js` (covers AC-3)

## Interactive Real Device / Simulator Verifications
- [x] AC-1: Tap "Detect Faces & Group People" in an active session, ML Kit detects all faces and produces normalized coordinates
- [x] AC-2: Expression quality scores display on person cards and highlight smiling faces with open eyes
- [x] AC-3: MobileFaceNet processes face crops in memory via Skia and extracts 192 dimensional feature vectors
- [x] AC-4: Alternate shots of the same person are clustered into the same person identity with real time sensitivity slider and presets
- [x] AC-5: People are labeled Person 1, Person 2, and so on from left to right across the group with cropped face avatars
- [x] AC-6: Session UI updates with detected face count badges on thumbnails, person chips, and honors session reset cancellation

## Acceptance criteria coverage
- AC-1 covered by faceDetectionService with accurate landmark mode and normalized coordinates
- AC-2 covered by calculateQualityScore balanced formula and fallback handling
- AC-3 covered by faceEmbeddingService Skia in memory crop buffer and MobileFaceNet Fast TFLite execution
- AC-4 covered by personClusteringService photo by photo bipartite matching with threshold 0.65
- AC-5 covered by personClusteringService left to right horizontal sort and bestFaceId resolution
- AC-6 covered by facePipelineService session store integration and index screen reactive UI
