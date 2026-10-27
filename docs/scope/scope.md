# Scope: Group Photo Face Swap

An offline mobile app that detects faces across a burst of group photos, lets you pick or auto suggests the best face for each person, and blends them seamlessly into one clean photo completely on device.

**Build approach:** Skateboard (ship the thinnest usable whole first, then grow it).
**Workflow:** Alpha (after develop, run check verify on the real device). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· GA`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Offline vision architecture | Foundation | done |
| 2 | Coding standards and tooling | Foundation | done |
| 3 | Gallery photo import and session state | Slice 1 | in-progress |
| 4 | Face detection and person grouping | Slice 1 | planned |
| 5 | Seamless face blend engine | Slice 1 | planned |
| 6 | Interactive editor and export | Slice 1 | planned |
| 7 | Before and after comparison | Slice 2 | planned |
| 8 | Built in burst camera | Slice 2 | planned |

## Foundations

### 1. Offline vision architecture · done
Decide the on device computer vision library, face landmark detector, and image blending strategy that runs completely offline in Expo React Native.
**Done when:** an architecture spec documents the chosen offline vision library, native config plugin setup, and image processing pipeline.
- [x] Design it (spec): `/architect offline vision architecture`
- [x] Configure native plugins from the decision: `/develop offline vision architecture`
- [x] Verify it: `/check verify offline vision architecture`
Spec [0001](../specs/0001-offline-vision-architecture/index.md)

### 2. Coding standards and tooling · done
Capture project conventions into root AGENTS.md and verify that lint and type checks run cleanly from the scaffolded project.
**Done when:** root AGENTS.md reflects the real project conventions and lint and typecheck commands run clean.
- [x] Capture conventions and tooling: `/audit`
- [x] Install and verify tooling: `/develop tooling`

## Slice 1: Core face swap loop

### 3. Gallery photo import and session state · in-progress
Allow selecting 2 to 10 group photos from the local photo gallery and manage the photo session state for processing.
**Done when:** a user can pick between 2 and 10 photos from their device library and see them loaded with downscaled 1080p proxies and valid file paths.
- [x] Design it (spec): `/architect gallery photo import and session state`
- [x] Build it: `/develop gallery photo import and session state`
  - [x] Install dependencies and define session and photo types (AC-1, AC-5, AC-6)
  - [x] Build the Zustand session store with status transitions and cache cleanup (AC-6)
  - [x] Build the image ingestion service with 1080p proxy generation and bounded concurrency (AC-4, AC-5)
  - [x] Implement the gallery picker component with count validation and cancellation UX (AC-1, AC-2, AC-3)
- [x] Verify it: `/check verify gallery photo import and session state`
Spec [0002](../specs/0002-gallery-photo-import-session-state/index.md) · code in `src/`

### 4. Face detection and person grouping · needs a decision
Detect all faces in selected photos, extract facial landmarks and quality scores (eyes open, smiles), and cluster faces belonging to the same person.
**Done when:** every photo has detected face bounds, each unique person is grouped across photos, and face quality scores are calculated offline.
- [ ] Design it (spec): `/architect face detection and person grouping`

### 5. Seamless face blend engine · needs a decision
Align chosen faces from alternate shots and blend them seamlessly onto the base photo without visible cut lines or skin tone mismatches.
**Done when:** replacing a face creates a natural looking composite image rendered at full resolution with smooth edges.
- [ ] Design it (spec): `/architect seamless face blend engine`

### 6. Interactive editor and export · needs a decision
Display the composite photo with tap targets over each person to pick alternative faces, and save the final image back to the photo gallery.
**Done when:** users can tap any person, switch their face using a thumbnail strip, see updates, and export the high resolution result to their photo library.
- [ ] Design it (spec): `/architect interactive editor and export`

## Slice 2: Comparison and burst capture

### 7. Before and after comparison · needs a decision
Add a quick toggle button and comparison view so users can compare the composite photo with the original unedited photo.
**Done when:** holding or tapping the comparison button immediately reveals the unedited original photo for quick comparison.
- [ ] Design it (spec): `/architect before and after comparison`

### 8. Built in burst camera · needs a decision
Provide an in app camera screen that shoots a rapid burst of 5 to 8 photos with one tap, feeding straight into the face swap pipeline.
**Done when:** tapping the shutter button captures a burst sequence quickly, saves them temporarily, and passes them to the face detection step.
- [ ] Design it (spec): `/architect built in burst camera`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Manual face landmark alignment**: manual control to nudge face alignment points when automatic alignment misses · needs a decision
- **Batch export and sharing**: export multiple variations or share directly to social apps · needs a decision
- **Background lighting correction**: automatic color grading adjustment across photos with very different exposures · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it: /develop <feature>` + 2 to 5 milestones; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | you, when you decide it is (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's Build plan, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre workflow) and `dropped` (de scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Prototype`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
