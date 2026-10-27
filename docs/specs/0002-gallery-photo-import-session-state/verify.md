# Verify: Gallery Photo Import and Session State · spec 0002 · updated 2026-10-28

Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones.

## Automated Checks
- [x] `bunx tsc --noEmit` checks clean with zero type errors (covers AC-1, AC-4, AC-5, AC-6)
- [x] `npx expo lint` checks clean with zero lint warnings or errors (covers AC-1 through AC-6)
- [x] `npx expo-doctor` confirms dependencies and project configuration pass all checks

## Interactive Real Device / Simulator Verifications
- [ ] AC-1: Tap "Select Group Photos", native system picker opens with multiple selection enabled up to 10 photos
- [ ] AC-2: Choose only 1 photo from the gallery, an alert titled "Selection Needed" prompts for at least 2 photos, and session returns to idle
- [ ] AC-3: Open photo picker and tap Cancel, picker dismisses cleanly back to idle state with no error toast or alert
- [ ] AC-4: Choose 3 photos from gallery, originals copy into cache under `sessions/{sessionId}/originals/`
- [ ] AC-5: 1080p downscaled JPEG proxies generate in cache under `sessions/{sessionId}/proxies/` preserving aspect ratio
- [ ] AC-6: Session transitions to ready state displaying imported photo cards, base photo selection toggles on tap, and tapping Reset clears state and deletes cached session directory

## Acceptance criteria coverage
- AC-1 covered by useGalleryPicker launchImageLibraryAsync with selectionLimit 10
- AC-2 covered by useGalleryPicker asset count validation Alert
- AC-3 covered by useGalleryPicker cancellation handling returning cleanly to idle
- AC-4 covered by imageIngestionService copying assets into session originals cache
- AC-5 covered by imageIngestionService 1080p downscaled proxy generation via expo-image-manipulator
- AC-6 covered by useSessionStore Zustand state management and resetSession cache cleanup
