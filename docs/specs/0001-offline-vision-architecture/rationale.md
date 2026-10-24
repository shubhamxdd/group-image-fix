# Rationale: 0001. Offline Vision Architecture

## Context

Group photos taken in bursts often suffer from closed eyes, awkward expressions, or people looking away. Combining the best faces from multiple shots into a single clean group photo requires a reliable on device computer vision pipeline. The application must process several high resolution photos (typically five to eight images with three to four people each) without sending any private photos to an external server.

Mobile devices present strict memory and compute boundaries. Loading multiple full resolution images concurrently causes out of memory crashes, especially on phones with strict memory limits. The face detection must happen fast enough to keep the user engaged, and switching faces in the editor must feel instantaneous. Additionally, cut and paste face swaps look artificial without proper alignment and seamless edge blending, yet full image gradient solving across massive photos is computationally heavy and causes color bleeding halos. Choosing the right native libraries, graphics engines, and processing pipeline is essential before building features.

## Options considered

### Option 1: Google ML Kit with MobileFaceNet TFLite, React Native Skia, and Proxy Multi Band Blending (Chosen)

This option uses Google ML Kit for native on device face detection, `react-native-fast-tflite` running MobileFaceNet for 128 dimension embeddings, React Native Skia for the interactive canvas on 1080p proxies, and localized multi band blending on export.

**Pros**:
- Google ML Kit provides built in eye open and smiling probabilities, eliminating separate emotion models.
- MobileFaceNet clustering handles posture changes, tilts, and position swaps cleanly.
- Proxy pipeline prevents mobile memory crashes while keeping 60 frames per second editing smooth.
- Localized multi band blending avoids the color bleed halos and slow execution of naive Poisson solvers.

**Cons**:
- Requires Expo development builds with native code compilation rather than standard Expo Go.
- Adds approximately 15 megabytes of native library binaries and model weights to the app package.

### Option 2: MediaPipe Face Mesh with Spatial Tracking and Feathered Blending Only

This option uses MediaPipe Face Mesh for dense 468 landmark detection, simple horizontal coordinate ordering to cluster people, and a single feathered oval blend for both preview and export.

**Pros**:
- MediaPipe offers dense 3D landmarks for facial contouring.
- No need to run an extra face embedding model because coordinate tracking requires no model weights.

**Cons**:
- Lacks built in smiling and eye open probability scores, requiring custom classification logic.
- Horizontal coordinate tracking fails if people shift positions, lean over, or swap places between shots.
- Feathered oval blending leaves noticeable seam lines and lighting mismatches on challenging outdoor photos.

### Option 3: Full Embedded OpenCV C++ Engine with Global Poisson Solving

This option compiles a custom native OpenCV C++ library inside the React Native project to handle face detection, feature matching, and global image Poisson cloning directly in C++.

**Pros**:
- Direct low level control over memory buffers and image matrix algorithms.
- Complete algorithmic flexibility without third party wrapper limitations.

**Cons**:
- Very high native maintenance burden with Android NDK and iOS Xcode build scripts.
- Global Poisson solving on full 12 megapixel images causes severe color bleeding halos and thermal throttling on mobile devices.
- Large binary size (over 30 megabytes) and slower development velocity compared to modular Expo config plugins.

## Rationale

Mobile group photos have subtle differences that break naive approaches. People frequently tilt their heads, lean across, or change spots, which makes simple coordinate tracking unreliable. A lightweight MobileFaceNet model generates compact embedding vectors, allowing the app to cluster faces accurately using cosine similarity at a threshold of 0.70. Enforcing photo exclusivity guarantees that two faces from the same photo are never assigned to the same person.

For face detection, Google ML Kit is already optimized for mobile hardware on both iOS and Android. It provides bounding boxes, landmarks, and crucial probabilities for open eyes and smiling out of the box, saving significant development effort and avoiding redundant neural network passes.

For rendering and blending, raw multi photo bursts consume hundreds of megabytes if loaded simultaneously. Generating 1080p downscaled proxies on import allows the UI and Skia canvas to run smoothly at sixty frames per second without out of memory risk. On export, the engine loads only the base image and decodes the cropped region of interest for donor faces, applying a 4-DOF similarity transform and multi band blending on a 30 percent padded bounding box. This prevents color bleed halos and produces crisp, natural looking group photos.
