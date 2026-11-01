# 0004. Seamless Face Blend Engine

**Date**: 2026-10-29
**Status**: Accepted

## Summary

This feature builds the on device face replacement and blending engine that seamlessly transplants a chosen face expression from an alternate burst shot onto the primary base photo. The engine aligns the donor face using a 3 point affine transformation matrix calculated from eye and mouth landmarks, adjusts skin tones and illumination in LAB color space, and blends the aligned face onto the base photo using an elliptical feathered alpha mask rendered with hardware accelerated Skia shaders. Real time interactive editing runs on 1080p proxy images under 60 milliseconds, while final exports apply the identical normalized mathematical matrix to the original full resolution camera photos and save directly to the device media library.

## Requirements

**User stories**:
- As a user, I want to select an alternate expression for any person in my group photo so that blinking eyes, frowns, or turned heads can be replaced with their best smile.
- As a user, I want the swapped face to match the angle, scale, and head tilt of the target person naturally so that the result looks realistic rather than pasted.
- As a user, I want skin tones, lighting, and edges between the new face and the original body to blend smoothly with no harsh cut lines or color shifts.
- As a user, I want to preview face changes instantly and save the final composite image at full original camera resolution directly to my photo gallery.

**Acceptance criteria**:
- **AC-1**: Face alignment computes a 3 point affine transformation matrix using left eye, right eye, and mouth or nose coordinates, mapping donor face pixels precisely to base target coordinates with rotation, scale, and position matching. If landmarks are obscured, it falls back to bounding box center and Euler angles.
- **AC-2**: Illumination and skin tone matching adjusts donor face pixels using statistical color transfer in LAB color space, matching the mean and standard deviation of lightness and chromatic channels to the base photo target face before blending.
- **AC-3**: Edge seam blending renders the aligned donor face onto the base photo canvas using an elliptical feathered alpha mask with smooth cosine or Gaussian falloff, eliminating visible boundary cut lines completely offline via Skia shaders.
- **AC-4**: Real time interactive preview renders the blended composite on the downscaled 1080p proxy image within 60 milliseconds per swap, tracking active selections per person without mutating original files.
- **AC-5**: Session state stores face swap selections non destructively as a map of person identifier to donor face identifier and transform parameters, allowing individual swaps to be toggled, updated, or reverted to the original base photo at any time.
- **AC-6**: Full resolution export applies the exact normalized affine matrix and feathered blend to the original full resolution base photo using Skia, saving the clean composite image directly to the device photo library via MediaLibrary permissions.

## Decision

**Chosen option**: Option 1: 3 Point Affine Landmark Alignment with LAB Color Transfer, Skia Elliptical Feathered Shader, and Two Tier Proxy and Full Resolution Pipeline.

The engine aligns donor faces using 3 point affine landmark geometry, balances skin tones via LAB statistical color transfer, blends edges using an elliptical feathered Skia shader on 1080p proxies for interactive preview, and reproduces the identical composite at full sensor resolution when exporting directly to the device gallery.

## Rationale

See [rationale.md](file:///home/shubhamxd/Desktop/code/img-gp/docs/specs/0004-seamless-face-blend-engine/rationale.md) for context, evaluated options, and trade-off analysis.

## Feature design

**Data model sketch**:

```typescript
export interface BlendParameters {
  featherRadius: number; // 0.10 to 0.50, default 0.25
  colorTransferEnabled: boolean; // default true
  affineMatrix: number[]; // 3x3 affine transformation float array [a, c, tx, b, d, ty, 0, 0, 1]
}

export interface FaceSwapSelection {
  personId: string; // Primary key, one active swap per person
  donorFaceId: string; // Foreign key to DetectedFace
  donorPhotoId: string; // Foreign key to Photo
  blendParams: BlendParameters;
  appliedAt: number;
}

export interface BlendResult {
  previewUri: string; // Local cached file path of composite 1080p proxy
  previewWidth: number;
  previewHeight: number;
  isDirty: boolean;
  renderDurationMs: number;
}
```

**Session state extension**:
- `session.swaps`: `Record<string, FaceSwapSelection>` (keyed by `personId`, empty when no faces swapped)
- `session.activeBlendPreviewUri`: `string | null` (path to current rendered composite preview)
- `session.isBlending`: `boolean`

**State transitions**:
1. Base photo selected: `swaps` is empty, `activeBlendPreviewUri` points to base photo proxy.
2. User selects alternate face for Person X: a new `FaceSwapSelection` is recorded in `swaps[personX.id]`.
3. Engine triggers `renderCompositePreview`: Skia renders base proxy + active swaps to a cached JPEG, updating `activeBlendPreviewUri`.
4. User reverts Person X: entry is deleted from `swaps`, engine re-renders composite preview.
5. User taps Save: engine executes `renderFullResolutionExport` on original full resolution photos and writes the resulting image to the camera roll.

**API surface**:

| Service / Method | Inputs | Key outputs | Behavior | Error cases |
|---|---|---|---|---|
| `computeAffineAlignment(donorFace: DetectedFace, baseFace: DetectedFace)` | Donor and base face objects with landmarks | 3x3 float matrix | Calculates affine matrix mapping donor eyes and mouth to base target, with bounding box fallback | Missing bounds, degenerate zero area |
| `applyLabColorTransfer(donorImage: SkImage, donorRect: SkRect, baseImage: SkImage, baseRect: SkRect)` | Skia images and crop rectangles | SkImage with matched tone | Matches mean and standard deviation of L, A, B color channels within facial crops | Color conversion failure, null pixel buffer |
| `renderCompositePreview(basePhoto: Photo, swaps: Record<string, FaceSwapSelection>, faceMap: Record<string, DetectedFace>, photoMap: Record<string, Photo>)` | Base photo, active swaps, face and photo maps | Promise<BlendResult> | Renders multi face composite onto 1080p proxy via Skia canvas and elliptical feathered shader | File read error, Skia surface allocation failure |
| `renderFullResolutionExport(basePhoto: Photo, swaps: Record<string, FaceSwapSelection>, faceMap: Record<string, DetectedFace>, photoMap: Record<string, Photo>)` | Base photo, active swaps, face and photo maps | Promise<string> (saved asset URI) | Applies normalized matrices to full resolution original photos and saves to device gallery via expo-media-library | Permission denied, memory pressure |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Affine alignment | 3x3 transformation matrix | Derived from `donorFace.landmarks` and `baseFace.landmarks` |
| Fallback alignment | Rotation and scale matrix | Derived from `donorFace.bounds`, `baseFace.bounds`, and `headEulerAngleZ` |
| Color transfer | Adjusted donor pixel buffer | Derived from mean and standard deviation of L, A, B channels across donor and base face crops |
| Composite preview | 1080p JPEG preview URI | Skia offscreen surface snapshot written to local session cache directory |
| High resolution export | Saved gallery asset URI | `MediaLibrary.createAssetAsync(compositePath)` |

**Key invariants**:
- All transformation matrices are computed and stored in normalized coordinates (0 to 1) so they apply identically to 1080p proxies and full resolution camera sensors.
- Original photo files and imported proxies are never overwritten or mutated; all blends output to separate cached composite files.
- Each person cluster can have at most one active face swap selection at any moment.
- Swapping a face to its own base photo instance acts as a cancellation, removing the swap cleanly.
- All image decoding, matrix math, color transfers, and blending execute 100% offline on device with zero network calls.

**Security model**:
- Pure on device execution with zero data transmission.
- Media library write permissions are requested only when the user explicitly triggers high resolution export.

**Critical test scenarios**:
- Scenario 1: Computing affine alignment for two faces with known eye coordinates produces a transformation matrix that superimposes donor eyes exactly onto base target coordinates, verifies **AC-1**.
- Scenario 2: When face landmarks are missing, alignment falls back to bounding box center and Euler angle rotation without throwing, verifies **AC-1**.
- Scenario 3: Color transfer matches donor skin brightness and tone to base photo target face, verifies **AC-2**.
- Scenario 4: Elliptical feathered mask produces smooth gradient transparency with zero alpha at the outer perimeter, verifies **AC-3**.
- Scenario 5: Proxy preview render completes in under 60 milliseconds and updates session store with composite preview path, verifies **AC-4**, **AC-5**.
- Scenario 6: Full resolution export scales the normalized transform to full sensor dimensions and saves to media library, verifies **AC-6**.

## Build plan

1. [x] Define blending and swap selection TypeScript contracts in `src/types/blend.ts`, satisfies **AC-4**, **AC-5**
2. [x] Implement 3 point affine landmark alignment math and bounding box fallback in `src/services/faceAlignmentService.ts`, satisfies **AC-1**
3. [x] Implement statistical LAB color transfer service in `src/services/faceColorMatchService.ts`, satisfies **AC-2**
4. [x] Build hardware accelerated Skia elliptical feathered blend shader and composite preview renderer in `src/services/faceBlendingEngine.ts`, satisfies **AC-3**, **AC-4**
5. [x] Extend Zustand session store with swap selection actions, undo support, and active composite preview state in `src/store/sessionStore.ts`, satisfies **AC-5**
6. [x] Implement full resolution export and media library gallery saving in `src/services/faceExportService.ts`, satisfies **AC-6**

## Consequences

**Positive**:
- Two tier pipeline guarantees snappy interactive editing (<60ms) while preserving original camera sensor resolution on export.
- 3 point landmark affine alignment corrects head tilts and angle shifts naturally.
- Statistical LAB color transfer prevents swapped faces from appearing mismatched under varying burst shadows.
- Elliptical feathered shader eliminates harsh boundaries without requiring heavy multi band pyramid computations.
- Non destructive session swap mapping allows infinite undo and instant comparison with original base photo.

**Negative / tradeoffs**:
- Extremely large full resolution camera photos (for example 48 megapixel images) require careful memory handling during export to avoid native memory spikes on budget Android devices.
- Severe profile head turns (greater than 45 degrees yaw) cannot be fully rectified with affine 2D transforms alone.

## Follow-up

- [ ] Add interactive feather radius slider in advanced settings for fine tuning edge falloff on difficult hairlines.
