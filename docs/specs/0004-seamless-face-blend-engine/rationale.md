# Rationale: Seamless Face Blend Engine

## Context

In group photography, capturing a moment where all subjects are smiling simultaneously with open eyes is rare. Burst shots solve this by capturing multiple frames in rapid succession. While people maintain roughly the same pose, individual facial expressions, minor head tilts, eye blinks, and micro lighting conditions vary from frame to frame.

To create a natural group portrait, the application must take a chosen face from an alternate shot and place it onto the primary base photograph. However, naive rectangular cut and paste produces jarring, unrealistic results due to three primary physical challenges:
1. **Pose and Angle Discrepancy**: Even small head turns or tilts misalign facial features (eyes, nose, mouth) relative to the neck and shoulders.
2. **Illumination and Skin Tone Variance**: Camera exposure, flash recharge cycles, or transient shadows cause skin luminance and color temperature to differ between burst frames.
3. **Boundary Seams**: A hard or poorly feathered cut line across foreheads, cheeks, and chins immediately catches the human eye as an artificial composite.

Furthermore, mobile phones impose strict performance constraints. Generating composites must feel immediate and responsive during interactive editing (less than 100 milliseconds latency), while preserving the pristine resolution of multi megapixel camera originals when exporting the final result.

## Options considered

### Option 1: 3 Point Affine Landmark Alignment with LAB Color Transfer and Skia Elliptical Feathered Shader (Recommended)

This approach computes an affine transformation matrix from three reference points: the left eye, right eye, and mouth or nose coordinates extracted by ML Kit. The matrix scales, rotates, and translates the donor face so that facial features lock precisely onto the base target. 

Before drawing, pixel values in the facial crop undergo statistical color transfer in CIE LAB space, matching the lightness, green red, and blue yellow distributions to the base face. The donor face is then rendered onto the target canvas using an elliptical feathered alpha mask with smooth cosine falloff via Skia shaders. 

Interactive editing runs on 1080p proxies for sub 60 millisecond response, while export applies the identical normalized transform to original full resolution camera photos.

**Pros**:
- Hardware accelerated on device rendering via Skia GPU pipelines provides real time interactive frame rates.
- 3 point affine geometry handles head tilt, rotation, and facial scaling naturally without stretching non rigid features.
- LAB color transfer harmonizes illumination shifts, sunlight reflections, and shadow variations without destroying facial skin texture.
- Elliptical falloff fits human face geography closely, avoiding complex polygon clipping.

**Cons**:
- 2D affine transforms cannot correct out of plane 3D yaw rotations exceeding 45 degrees.

### Option 2: Multi Band Laplacian Pyramid Blending

Laplacian pyramid blending decomposes both the base image and the donor face into multiple frequency octave bands. Low frequency components (overall illumination and color gradients) are blended over large spatial distances, while high frequency components (sharp details like skin pores, eyelashes, and hair strands) are blended over narrow spatial windows.

**Pros**:
- Highest theoretical seamlessness for complex uneven lighting gradients.
- Excellent preservation of fine edge details while smoothing broad lighting transitions.

**Cons**:
- Substantial computational overhead: constructing and collapsing 5 or 6 levels of Gaussian and Laplacian pyramids in JavaScript or Skia CPU buffers takes 800 to 2000 milliseconds per face on mobile devices, making real time interactive scrubbing impossible.
- Substantially higher memory usage, creating serious risk of out of memory crashes on budget mobile devices.

### Option 3: Convex Landmark Polygon with Gaussian Blur

This method builds a tight polygon bounding the outer facial landmarks (eyebrows, jawline contours, chin) and applies a uniform Gaussian blur along the polygon perimeter.

**Pros**:
- Restricts the blended region strictly to facial skin, leaving surrounding background and hair intact.
- Conceptually straightforward to implement.

**Cons**:
- In burst group shots, ML Kit face mesh points are not always detected reliably along jawlines when heads turn.
- A blurred boundary along sharp jawlines often produces noticeable ghosting halos or duplicate chin borders when the target head angle differs slightly from the donor.

## Rationale

Option 1 is selected because it delivers the optimal balance of visual realism, speed, and rock solid mobile reliability.

Group photos in a burst sequence feature people standing in near identical positions with subtle expression changes. In this operating regime, a 3 point affine transformation matrix aligns facial features cleanly, preserving rigid bone structure without the distortion risks of non linear warps. 

Pairing this geometric alignment with statistical LAB color transfer directly resolves the common problem of burst exposure flickering. The donor skin tone automatically adapts to the base photo ambient warmth and brightness before compositing.

Finally, rendering the composite through a hardware accelerated Skia elliptical feathered shader keeps preview latency under 60 milliseconds. This enables users to tap alternate expressions and see instantaneous updates on screen, while the normalized matrix ensures that final exports reproduce the exact same blend at full original camera resolution.
