# Verify: interactive editor and export · spec 0005 · updated 2026-11-01
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Import 2 to 4 burst group photos and finish detection → tap "Open Expression Editor" → navigates cleanly to `/editor` → AC-1
- [ ] Inspect composite canvas → glowing indicator rings render centered over faces on the base photo without drift across aspect ratios → AC-2
- [ ] Tap a face indicator ring → selected person highlights and bottom drawer sheet docks at screen bottom without covering faces → AC-2, AC-3
- [ ] In bottom drawer sheet → observe alternate face cards with smile and quality percentages, photo labels, and original face marker → AC-3
- [ ] Tap an alternate face card → immediate card selection feedback and blended composite preview updates without stale image caching → AC-3, AC-4
- [ ] Rapidly tap between different face cards → request sequencing prevents out of order overwrite glitches → AC-4
- [ ] Tap "Revert" button → active face swap is removed and preview returns to original base shot → AC-3, AC-4
- [ ] Press and hold "Compare" button → face indicator rings hide and canvas displays untouched base photo; release restores composite and rings → AC-5
- [ ] Tap "Save" button → export progress modal displays milestone percentages and saves full resolution photo to device gallery → AC-6
- [ ] Deny media library permissions → export modal displays error message with "Open Settings" button launching system settings → AC-6

## Commands
- [ ] `bunx tsc --noEmit` → typecheck exits clean with 0 errors → AC-1 to AC-6
- [ ] `npx expo lint` → lint exits clean with 0 warnings or errors → AC-1 to AC-6

## Acceptance criteria coverage
- AC-1 (navigation and route): covered by steps 1, 11, 12
- AC-2 (letterbox projected face rings): covered by steps 2, 3, 11, 12
- AC-3 (bottom drawer sheet and revert): covered by steps 3, 4, 5, 7, 11, 12
- AC-4 (preview sync and sequencing): covered by steps 5, 6, 7, 11, 12
- AC-5 (hold to compare and overlay hiding): covered by steps 8, 11, 12
- AC-6 (gallery export and permissions): covered by steps 9, 10, 11, 12
