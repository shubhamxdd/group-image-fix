# Verify: Seamless Face Blend Engine · spec 0004 · updated 2026-10-29

Steps derived from spec 0004 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones.

## Automated Checks
- [x] `bunx tsc --noEmit` checks clean with zero type errors (covers AC-1 through AC-6)
- [x] `npx expo lint` checks clean with zero warnings or errors (covers AC-1 through AC-6)
- [x] `node --test` tests 3 point affine transformation matrix math, verifying that eye and mouth coordinates map accurately from donor space to base target space (covers AC-1)
- [x] `node --test` tests affine matrix bounding box fallback when eye landmarks are missing or degenerate (covers AC-1)
- [x] `node --test` tests statistical LAB color transfer calculation, verifying that output pixel distributions match target mean and variance (covers AC-2)
- [x] `node --test` tests session store swap actions, verifying non destructive addition, replacement, and revert of face swaps per person (covers AC-5)

## Interactive Real Device / Simulator Verifications
- [ ] AC-1: Select an alternate face for a person whose head is tilted; the donor face aligns cleanly onto the base person head with matching angle and scale
- [ ] AC-2: Swap a face between photos with different brightness or shadow levels; the donor face skin tone adjusts automatically to match base ambient lighting
- [ ] AC-3: Inspect the blended face perimeter; the elliptical feathered shader transitions smoothly without visible cut lines or harsh borders
- [ ] AC-4: Tap an alternate face thumbnail; the composite preview updates on screen in under 60 milliseconds
- [ ] AC-5: Toggle face swaps on and off for multiple people; each person updates independently, and reverting a swap restores the original base face
- [ ] AC-6: Tap save to export; the app requests photo library write permission and exports a crisp composite at full original camera resolution to the device gallery

## Acceptance criteria coverage
- AC-1 covered by faceAlignmentService 3 point affine landmark matrix computation with bounding box fallback
- AC-2 covered by faceColorMatchService statistical LAB skin tone transfer
- AC-3 covered by faceBlendingEngine Skia elliptical feathered shader
- AC-4 covered by faceBlendingEngine 1080p proxy preview pipeline
- AC-5 covered by sessionStore swap selection state actions and non destructive revert
- AC-6 covered by faceExportService full resolution rendering and expo-media-library asset creation
