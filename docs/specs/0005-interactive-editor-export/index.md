# 0005. Interactive Editor and Export

**Date**: 2026-11-01
**Status**: In Progress

## Summary

This feature provides the interactive editing interface and gallery export flow for group photos. Users navigate to a dedicated full screen editor where they see the blended composite image with subtle glowing rings over each detected face on the base photo. Tapping any person opens a compact bottom drawer sheet displaying their alternate expressions with quality ratings, allowing instant face swapping that updates the preview in real time. A hold to compare button gives quick visual feedback against the untouched base photo, and an export button renders the finished full resolution picture directly to the device gallery with clear progress feedback.

## Requirements

**User stories**:
- As a user, I want to tap on people in my group photo to select who needs an expression change.
- As a user, I want to browse all alternate face shots for a person in a compact bottom drawer with expression quality ratings so that I can pick their happiest look.
- As a user, I want the blended preview to update reliably on screen when I select an alternate expression, without stale image caching.
- As a user, I want to revert any person back to their original face easily if I prefer their initial expression.
- As a user, I want to press and hold a compare button to inspect the composite photo against the untouched base photo without overlay rings blocking my view.
- As a user, I want to export the finished composite image at full sensor resolution directly to my device photo library with progress feedback and permission recovery.

**Acceptance criteria**:
- **AC-1**: Navigation opens a dedicated full screen editor route (`src/app/editor.tsx`) from the session overview screen when face detection completes, displaying the base photo or composite preview at full aspect ratio.
- **AC-2**: Face selection overlays render bounding indicator rings directly over each person present in the base photo, projecting coordinates accurately using intrinsic image dimensions and letterbox scaling math.
- **AC-3**: Bottom expression drawer displays all available face crops for the active person in a compact horizontal dock (~160 height), marking quality ratings derived from `face.qualityScore` and `face.smilingProbability`, highlighting the current selection, and providing a revert button.
- **AC-4**: Real time preview synchronization triggers composite rendering whenever a swap selection changes, handling rapid sequential taps via request sequencing, appending cache busting timestamps to image URIs, and providing immediate touch feedback.
- **AC-5**: Instant compare control switches the visible canvas to the untouched original base photo and hides face rings while pressed, immediately returning to the blended composite and restoring overlays when released.
- **AC-6**: Export flow invokes full resolution composite rendering with milestone progress updates (rendering, saving, success), handling media library permission denials gracefully by directing users to device settings when needed.

## Decision

**Chosen option**: Option 1: Dedicated Full Screen Editor Route with Letterbox Projected Overlays, Compact Expression Drawer, Hold to Compare Gesture, and Milestone Export Modal.

We route the user into a dedicated full screen editor screen (`src/app/editor.tsx`). Face targets are displayed as responsive glowing rings overlaid directly on the composite canvas using React Native Pressable views with generous hit slops. Tapping any person opens a compact bottom drawer sheet (~160 height) showing their alternate face crops with quality badges. The toolbar includes a press responder button for instant comparison that hides overlays during inspection. The export button triggers background full resolution rendering with an informative milestone progress modal.

## Rationale

Reasoning, alternatives considered, and tradeoffs are recorded in [rationale.md](file:///home/shubhamxd/Desktop/code/img-gp/docs/specs/0005-interactive-editor-export/rationale.md).

## Feature design

**Component hierarchy**:
- `src/app/editor.tsx`: Main editor route, loads session from store, manages active person selection, comparison state, and export modal visibility.
- `src/components/CompositeCanvas.tsx`: Renders the composite proxy image with correct letterbox aspect fit, calculates touch coordinates, and overlays interactive face indicator circles.
- `src/components/FaceSwitcherSheet.tsx`: Compact bottom drawer sheet presenting face cards for the selected person with quality ratings, photo source tags, and a revert button.
- `src/components/CompareButton.tsx`: Touch responder button that toggles `isComparing` state on press in and press out events.
- `src/components/ExportModal.tsx`: Modal overlay showing export progress spinner, milestone percentage, and completion notification.

**Data model sketch**:

```typescript
export interface EditorLocalState {
  selectedPersonId: string | null;
  isComparing: boolean;
  isExportModalVisible: boolean;
  exportStatus: "idle" | "rendering" | "saving" | "success" | "error";
  exportProgress: number; // 0, 30, 80, 100
  exportedAssetUri: string | null;
  errorMessage: string | null;
}
```

**Letterbox coordinate mapping formula**:
Given container width and height $(W_c, H_c)$ and image proxy width and height $(W_p, H_p)$ from `basePhoto`:
- Scale ratio: $S = \min(W_c / W_p, H_c / H_p)$
- Rendered image dimensions: $W_r = W_p \times S$, $H_r = H_p \times S$
- Centering offsets: $O_x = (W_c - W_r) / 2$, $O_y = (H_c - H_r) / 2$
- Ring center coordinates from normalized bounds $(x, y, w, h)$:
  $X_c = O_x + (x + w / 2) \times W_r$
  $Y_c = O_y + (y + h / 2) \times H_r$
  Radius: $R = \max(w \times W_r, h \times H_r) \times 0.55$

**State transitions**:
1. User taps "Open Editor" on `src/app/index.tsx`: Expo Router navigates to `/editor`.
2. Editor mounts: Reads `session` from Zustand store. If `session.activeBlendPreviewUri` is empty, it initializes with `basePhoto.proxyUri`.
3. User taps Person 2 glowing ring: `selectedPersonId` is set to Person 2. `FaceSwitcherSheet` docks at screen bottom displaying all face crops for Person 2.
4. User taps alternate face shot #3: Calls `sessionStore.setFaceSwap(personId, donorFaceId)` with request sequence token. The blending engine re-renders the 1080p proxy composite, appending `?t=${Date.now()}` to avoid native image caching.
5. User presses and holds "Compare": `isComparing` becomes true, canvas swaps visible image source to `basePhoto.proxyUri` and hides glowing rings. User releases: `isComparing` becomes false, canvas restores blended composite and reveals glowing rings.
6. User taps "Revert to Original": Calls `sessionStore.removeFaceSwap(personId)`. Swap entry is deleted, composite re-renders, drawer updates selection highlight.
7. User taps "Export Photo": `isExportModalVisible` opens with "rendering" state (30%). Calls `exportFullResolutionComposite(session)`. Transitions to "saving" (80%), writes to device photo gallery via `expo-media-library`, and displays "success" (100%).

**API surface**:

| Component or Hook | Inputs | Key outputs | Behavior | Error cases |
|---|---|---|---|---|
| `src/app/editor.tsx` | Route params, Zustand store | Interactive editing screen | Coordinates canvas, switcher drawer, compare gesture, and export trigger | Missing session, navigates back to home |
| `CompositeCanvas` | `imageUri`, `basePhoto`, `detectedFaces`, `persons`, `activePersonId`, `isComparing`, `onSelectPerson` | Touch events, highlighted rings | Projects normalized face bounds using intrinsic base photo dimensions and captures taps | Missing base photo, zero dimensions |
| `FaceSwitcherSheet` | `person`, `allFaces`, `activeSwap`, `basePhotoId`, `onSelectFace`, `onRevertFace`, `onClose` | Bottom drawer UI | Displays horizontal list of face crop cards with quality scores and revert action | Empty person clusters, missing face crops |
| `ExportModal` | `visible`, `status`, `progress`, `onClose`, `onOpenSettings` | Modal dialogue | Displays progress spinner, milestone status, and permission recovery link | Permission rejection, out of disk space |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Render composite image | Preview image URI with cache buster | `session.activeBlendPreviewUri ? `${session.activeBlendPreviewUri}?t=${Date.now()}` : basePhoto.proxyUri` |
| Face touch target layout | Screen x, y, radius for face rings | Computed from `face.bounds` normalized box using letterbox formula and `basePhoto.proxyWidth` / `proxyHeight` |
| Filter visible face rings | Person rings to render | Filtered where `face.photoId === session.basePhotoId` |
| Alternate face cards | Cropped face thumbnail URI | Pre-cached face crop URI or generated on demand via `ImageManipulator.manipulateAsync` |
| Quality rating badge | Quality percentage | `Math.round(face.qualityScore * 100)` and `Math.round(face.smilingProbability * 100)` |
| Current selection indicator | Active face card highlight | `session.swaps[personId]?.donorFaceId ?? basePhotoFaceForPerson.id` |
| Base face marker | "Original Shot" label | Evaluated where `face.photoId === session.basePhotoId` |
| Compare action | Unedited photo URI | `basePhoto.proxyUri` (with overlay rings hidden) |
| Export milestone progress | Status percentage | Set to 30 on start, 80 on composite ready, 100 on gallery save |
| Full resolution save | Saved asset ID | Result of `exportFullResolutionComposite(session)` |

**Key invariants**:
- The editor always operates on immutable session state; choosing or reverting faces never alters original photo files on disk.
- Only persons who have a corresponding face in the base photo (`face.photoId === session.basePhotoId`) have interactive overlay rings rendered on canvas.
- When `isComparing` is active, overlay rings must be hidden so the unedited base photo can be inspected without obstruction.
- Fast sequential face taps must not trigger out of order race conditions; subsequent requests cancel or supersede pending render promises.
- Image URLs passed to `Image` must include a cache buster timestamp parameter when re-rendered from the same file path.
- Exporting to gallery always handles denied permissions gracefully, offering a button to open system app settings via `Linking.openSettings()`.

**Security model**:
- All face crops, preview blends, and full resolution composite renders remain strictly on device.
- Device photo library write access is requested solely to save the final composite image.

**Configuration required**:
- None. Uses existing permissions in `app.json` (`expo-media-library`).

**Critical test scenarios**:
- Happy path: User opens editor from home screen, taps Person 1 ring, selects alternate smiling face, sees composite preview update without stale caching, and taps Export to save to device gallery, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**.
- Letterbox alignment: User tests on phones with different aspect ratios, verifying indicator rings stay centered on faces without drift, verifies **AC-2**.
- Face revert: User selects an alternate face, sees preview change, then taps Revert to Original and confirms the composite matches the original shot, verifies **AC-3**, **AC-4**.
- Fast compare: User holds the compare button, verifies that face rings disappear and canvas displays unedited base photo instantly, and releases to restore composite and rings, verifies **AC-5**.
- Permission recovery during export: User denies photo gallery write permission, verifies that the export modal presents an "Open Settings" button that launches device settings, verifies **AC-6**.

## Build plan

1. [x] Update `src/app/index.tsx` to enable the "Open Editor" primary action button when face grouping completes, satisfies **AC-1**.
2. [x] Implement `src/app/editor.tsx` route with screen scaffold, top navigation header, session store integration, and route registration, satisfies **AC-1**.
3. [x] Build `src/components/CompositeCanvas.tsx` with letterbox aspect ratio scaling, intrinsic dimension mapping, and interactive face bounding rings, satisfies **AC-2**.
4. [x] Build `src/components/FaceSwitcherSheet.tsx` compact bottom drawer with face crop cards, quality ratings, active selection highlight, and revert control, satisfies **AC-3**.
5. [x] Wire face selection events to `sessionStore.setFaceSwap`, integrate request sequencing, and append timestamp cache busters for instant preview synchronization, satisfies **AC-4**.
6. [x] Implement `src/components/CompareButton.tsx` with press in and press out responder gestures for instant before and after toggling with overlay hiding, satisfies **AC-5**.
7. [x] Implement `src/components/ExportModal.tsx` with milestone progress and permission recovery, connecting export action to `exportFullResolutionComposite`, satisfies **AC-6**.

## Consequences

**Positive**:
- Dedicated screen separation gives the editor full screen canvas room while keeping overview logic decoupled.
- Letterbox coordinate math ensures face indicator rings align accurately across all device screen aspect ratios.
- Cache busting query strings and request sequencing prevent native image caching glitches and race conditions during rapid taps.
- Compact bottom drawer ensures people faces remain visible while selecting alternate expressions.

**Negative / tradeoffs**:
- Generating face thumbnails for all alternate shots on the fly consumes slight memory, mitigated by caching crops locally.
- Full resolution export on high megapixel devices can consume significant memory during Skia rendering.

**Neutral**:
- Added new route `/editor` to Expo Router navigation structure.
