# 0005. Interactive Editor and Export (Rationale)

**Date**: 2026-11-01

## Context

After importing a burst of group photos and detecting all faces across the shots, the application clusters faces by person and equips the blending engine to transplant expressions. However, users need an intuitive visual surface to review the composite photo, select individual people, pick alternate facial expressions, inspect differences, and save the final result to their phone gallery.

Several forces shape this interface:
1. **Screen space constraints**: Mobile phone displays offer limited vertical space. Presenting a high quality composite image alongside multi person expression selectors without clutter requires careful layout.
2. **Direct manipulation expectation**: Users naturally expect to tap directly on a person on screen rather than hunting through abstract lists of names or numbers.
3. **Performance and responsiveness**: Swapping a face must trigger preview updates quickly without freezing touch interactions or causing layout jumps.
4. **Confidence through inspection**: Users need to see before and after differences easily to verify that skin tones, edges, and necklines look natural before saving.
5. **Storage and permissions**: Saving high resolution pictures to the camera roll requires handling platform permissions gracefully with clear progress indicators.

## Options considered

### Option 1: Dedicated Full Screen Editor Route with Direct Face Overlays, Bottom Expression Drawer, Hold to Compare Gesture, and Export Progress Modal (Chosen)

This option navigates the user from the import and detection screen to a dedicated full screen editor route (`src/app/editor.tsx`). The composite image occupies the primary canvas area, with subtle glowing circular rings positioned over each detected face. Tapping a face opens a bottom slide up drawer sheet showing horizontal cards of alternate expressions with smile scores and an explicit revert button. A hold to compare button in the toolbar allows rapid inspection of the base photo. An export button opens a clean progress modal while saving the full resolution photo to the device gallery.

**Pros**:
- Provides maximum screen area for examining facial details and blend boundaries.
- Direct face overlays offer an intuitive, touch first editing experience.
- The slide up sheet keeps expression choices focused on the selected individual without occluding the face being altered.
- The hold gesture offers effortless before and after comparison without needing split screen sliders.

**Cons**:
- Requires managing screen transition state and passing session identifiers cleanly across Expo Router.
- Requires calculating view scaling math to project normalized vision coordinates onto rendered image dimensions.

### Option 2: Inline Editor within Overview Screen with Bottom Strip

This option replaces the photo grid inside `src/app/index.tsx` with an inline preview canvas once face detection completes, displaying a static horizontal strip of person avatars beneath the photo.

**Pros**:
- Avoids creating a new navigation route in Expo Router.
- Keeps all session state in a single screen file.

**Cons**:
- Makes `src/app/index.tsx` excessively complex and crowded.
- Cramps the composite photo preview vertically between the header and bottom avatar strips.
- Avatar list does not allow users to tap directly on faces in the photo.

### Option 3: Center Modal Dialog Expression Switcher

This option opens a centered modal dialog pop up over the middle of the screen whenever a person is tapped, displaying alternate expressions in a grid.

**Pros**:
- Simple standard modal presentation pattern.

**Cons**:
- The center modal dialogue completely covers the composite photo and the person face being edited, preventing the user from seeing how the swap looks in context.
- Requires closing the dialog before seeing the composite result.

## Rationale

Option 1 is selected because it delivers the cleanest mobile first user experience. Separating the editor into a dedicated route (`src/app/editor.tsx`) keeps the import and detection overview light while granting the editor full screen real estate. Overlaid face rings give users direct touch control over faces on the photo itself. The bottom drawer sheet allows selecting alternate expressions while keeping the target person visible on canvas so users can immediately judge expression harmony. The hold to compare gesture gives instant reassurance without cluttering the screen with permanent split sliders.
