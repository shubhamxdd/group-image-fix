# 0002. Gallery Photo Import and Session State

**Date**: 2026-10-24
**Status**: In Progress

## Summary

This feature provides photo selection from the device gallery using the native system picker, generates 1080p proxy images in app cache, and manages the active editing session using an in memory Zustand store. Users can choose between 2 and 10 group photos. The original photos are preserved on disk for final high resolution export, while the downscaled proxies protect against out of memory crashes during face detection and interactive editing.

## Context

Face swapping across group photos requires several alternate shots of the same group of people. Users must be able to select photos from their device camera roll seamlessly. Because mobile devices have strict memory limits, loading multiple full resolution camera photos (each often exceeding 12 megapixels) directly into memory causes immediate out of memory crashes.

The application needs a reliable import pipeline that validates photo counts, preserves full resolution image paths on disk, generates downscaled 1080p preview proxies, and keeps the active photo session reactive and accessible throughout the editing experience.

## Requirements

**User stories**:
- As a user, I want to select 2 to 10 photos from my device photo library so that I can supply group photos for face swapping.
- As a user, I want clear feedback if I select only 1 photo so that I understand why the app cannot proceed.
- As a user, I want the import process to create fast preview images so that my phone never lags or runs out of memory while editing.
- As a user, I want canceling the photo picker to return cleanly to the previous screen without an error alert.

**Acceptance criteria**:
- **AC-1**: User can launch the native system photo picker with multiple selection enabled up to 10 photos.
- **AC-2**: Selecting only 1 photo displays an informative notification prompting the user to select at least 2 photos, leaving the session idle.
- **AC-3**: Canceling the system photo picker without making a selection returns cleanly to idle state with no error toast.
- **AC-4**: Imported photos are copied into a dedicated session cache directory with unique identifiers, preserving their original full resolution file paths and visual dimensions.
- **AC-5**: A downscaled 1080p proxy image preserving aspect ratio is generated in cache for every imported photo, providing scaled width and height for fast on device detection and editing.
- **AC-6**: The active session state in Zustand stores the imported photos array, session status (idle, importing, ready, error), base photo identifier, and provides actions to update or reset the session with cleanup.

## Options considered

### Option 1: Native System Picker with Cache Copy and 1080p Proxies in Zustand (Chosen)

This option uses `expo-image-picker` to invoke the native iOS and Android system photo picker, copies the selected files to local app cache, creates 1080p proxy images via `expo-image-manipulator`, and stores the session state in a lightweight Zustand store.

**Pros**:
- Modern system photo picker requires no broad photo library permissions, offering immediate user trust.
- Generating 1080p proxies safeguards against out of memory crashes while preserving original files for final export.
- Zustand provides fast, reactive state with zero boilerplate and full TypeScript typing.

**Cons**:
- Temporary disk cache usage increases by approximately 2 to 4 megabytes per imported photo until reset.

### Option 2: Custom In App Gallery Grid with Full Media Library Permissions

This option builds a custom grid gallery UI inside the app using `expo-media-library` to query all camera roll photos directly.

**Pros**:
- Full visual control over multi selection checkboxes and custom headers.

**Cons**:
- Triggers intrusive permission prompts requesting access to all user photos.
- Substantial UI development overhead for thumbnail virtualization, paging, and album navigation.

### Option 3: Direct Camera Roll URIs with On The Fly Scaling

This option skips copying files to cache and reads assets directly from their original camera roll content URIs, scaling images in memory as needed.

**Pros**:
- Zero additional disk cache usage.

**Cons**:
- Content URIs on Android and iOS can expire, move, or be revoked when the user modifies their photo library.
- On the fly scaling during editing causes frame drops and repeated decode overhead.

## Decision

**Chosen option**: Option 1: Native System Picker with Cache Copy and 1080p Proxies in Zustand.

The application will use `expo-image-picker` for photo selection, copy images to local cache, generate 1080p downscaled proxies with `expo-image-manipulator`, and manage active session state with Zustand.

## Rationale

Privacy and memory safety are the primary constraints for an on device photo utility. Using the native system photo picker avoids scary permission alerts because the operating system grants access only to the user chosen photos.

Copying chosen photos to the app cache directory guarantees persistent local file access even if camera roll indices change. Generating 1080p proxies immediately on import solves the mobile memory bottleneck once and for all: every subsequent operation (face detection, Skia canvas preview, face selection carousel) uses the light proxy image, keeping the interface fluid at sixty frames per second while keeping the full resolution file safely on disk for the final save.

## Feature design

**Data model sketch**:

```typescript
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

export interface Session {
  id: string;
  createdAt: number;
  status: 'idle' | 'importing' | 'ready' | 'error';
  basePhotoId: string | null;
  photos: Photo[];
  errorMessage: string | null;
}
```

**State transitions**:
`idle` → `importing` (while copying and generating proxies) → `ready` (on success) or `error` (on failure). Calling `resetSession()` transitions back to `idle`.

**Directory structure**:
- Base session directory: `${FileSystem.cacheDirectory}sessions/${sessionId}/`
- Original copies: `${FileSystem.cacheDirectory}sessions/${sessionId}/originals/${photoId}.${ext}`
- Downscaled proxies: `${FileSystem.cacheDirectory}sessions/${sessionId}/proxies/${photoId}.jpg`

**Proxy resizing rules**:
- If `Math.max(origWidth, origHeight) <= 1080`: maintain original dimensions without downscaling.
- If `origWidth >= origHeight` (landscape or square): resize with `{ width: 1080 }` (height scales automatically preserving aspect ratio).
- If `origHeight > origWidth` (portrait): resize with `{ height: 1080 }` (width scales automatically preserving aspect ratio).
- Format: `SaveFormat.JPEG` with `compress: 0.85`.

**API surface / Store actions**:
- `importPhotos(assets: ImagePickerAsset[])`: processes 2 to 10 photos with bounded concurrency (concurrency limit 2), creates proxies, and sets session to `ready`.
- `setBasePhoto(photoId: string)`: updates `basePhotoId` to set the canvas foundation.
- `resetSession()`: cancels any in flight import via session generation token, deletes `${FileSystem.cacheDirectory}sessions/${sessionId}/`, and resets store to `idle`.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Create session | `Session.id`, `createdAt` | `Crypto.randomUUID()`, `Date.now()` |
| Create photo | `Photo.id`, `createdAt` | `Crypto.randomUUID()`, `Date.now()` |
| Launch picker | Selected asset array | `expo-image-picker` with `mediaTypes: ['images']`, `allowsMultipleSelection: true`, `selectionLimit: 10` |
| Copy photo | `originalUri`, `width`, `height` | `expo-file-system` destination path and image header metadata |
| Generate proxy | `proxyUri`, `proxyWidth`, `proxyHeight` | `expo-image-manipulator` resize output preserving aspect ratio |
| Handle cancel | Silent return to idle | `result.canceled === true` check |
| Validate count | Error notification message | Client validation check (`result.assets.length === 1`) |
| Display session | Active photos list and status | Zustand `useSessionStore` |

**Key invariants**:
- The `photos` array in a `ready` session must contain between 2 and 10 photos inclusive.
- Every `Photo` object must have both a reachable `originalUri` and a reachable `proxyUri` on disk.
- When `status` is `ready`, `basePhotoId` defaults to the first photo until face scoring or manual selection updates it.
- Ingestion processes images with bounded concurrency (at most 2 parallel tasks) to keep memory within safe mobile boundaries.
- On ingestion failure, all partial files for that session are deleted and status transitions to `error`.

**Security model**:
- Operates strictly offline with local device files.
- The system photo picker grants access only to user selected images.

**Critical test scenarios**:
- Happy path: user selects 3 photos from picker, copies complete, proxies generate, store status becomes `ready` with 3 photos, verifies **AC-1**, **AC-4**, **AC-5**, **AC-6**.
- Minimum count check: user selects 1 photo, app displays validation prompt, session stays `idle`, verifies **AC-2**.
- User cancellation: user opens picker and taps cancel, app remains `idle` with no error, verifies **AC-3**.
- Clamping check: user returns more than 10 photos, picker caps selection at 10 items, verifies **AC-1**.
- Session reset: user triggers reset, cached session directory is removed, store resets to `idle`, verifies **AC-6**.

## Build plan

1. Install `expo-image-picker`, `expo-image-manipulator`, `expo-crypto`, and `zustand`, satisfies **AC-1**, **AC-5**, **AC-6**
2. Define session and photo TypeScript interfaces, satisfies **AC-6**
3. Create the session store with Zustand including status transitions, generation token, and reset actions, satisfies **AC-6**
4. Build the image ingestion service that copies picked photos to session cache and generates 1080p proxies with aspect ratio preservation and bounded concurrency, satisfies **AC-4**, **AC-5**
5. Implement the gallery picker component with count validation, cancellation handling, and user feedback, satisfies **AC-1**, **AC-2**, **AC-3**

## Consequences

**Positive**:
- Smooth onboarding: users do not have to grant full photo library access to use the app.
- Complete memory protection: 1080p proxies and bounded concurrency prevent out of memory crashes across all mobile devices.
- Deterministic session directory structure simplifies cache cleanup.

**Negative / tradeoffs**:
- Generating proxies for 10 photos takes approximately 1 to 2 seconds on import.
- App cache holds proxy files until the session resets.

## Follow-up

- [ ] Add an automatic cache cleanup utility on app startup to remove orphan session directories from previous interrupted sessions.
