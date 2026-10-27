# Rationale: Face Detection and Person Grouping

This document records the architectural context, evaluated options, and reasoning behind spec 0003.

## Context

Group burst photography captures multiple quick shots of the same gathering within seconds. When people take group photos, someone inevitably blinks, looks away, or makes an awkward expression in each shot. To fix this, an app must detect every face in every photo, identify which faces belong to the same human across all photos, and evaluate which expression looks best.

Two major technical challenges arise on mobile devices:
First, processing speed and memory safety. Running computer vision on multiple 12 megapixel photos can easily exhaust mobile memory. Using downscaled 1080p proxy images protects memory while retaining sufficient facial detail for Google ML Kit landmark and probability extraction. Furthermore, using React Native Skia to read pixel buffers in memory avoids writing temporary face crops to disk, preventing heavy disk I/O bottlenecks.
Second, cross photo person identity matching. In a group burst, people may shift slightly, tilt their heads, or step aside. Relying solely on horizontal X coordinates can fail if people move, while relying on cloud APIs violates user privacy. An offline embedding solution using quantized MobileFaceNet combined with bipartite photo matching guarantees that people are grouped accurately without exclusivity lockouts.

## Options considered

### Option 1: ML Kit Face Detection with In Memory Skia Crops and MobileFaceNet TFLite Embeddings (Chosen)

This option uses `@react-native-ml-kit/face-detection` on 1080p proxy images to extract normalized bounding boxes, facial landmarks, and eye and smile probabilities. Face crops with 15% margin padding are converted directly in memory to raw RGB float buffers using `@shopify/react-native-skia` and fed into a quantized MobileFaceNet model via `react-native-fast-tflite` to produce 192 dimensional L2 normalized feature vectors. Photo by photo bipartite matching with cosine similarity threshold 0.65 groups faces into person clusters.

**Pros**:
- High clustering accuracy even when people shift positions between shots.
- Zero disk churn: cropping and tensor buffer generation happen purely in memory via Skia.
- Bipartite matching avoids greedy exclusivity lockouts.
- Compact neural network model size (approximately 2 megabytes) running on device.

**Cons**:
- Running neural network inference across multiple faces takes approximately 1 to 2 seconds total across an entire burst.

### Option 2: Pure Spatial Ordering and Bounding Box Overlap

This option sorts detected faces in each photo from left to right by horizontal coordinate without neural network embeddings.

**Pros**:
- Instantaneous clustering with zero neural network execution overhead.

**Cons**:
- Fails when people move, lean across one another, or when subjects enter or leave the frame between shots.
- Cannot verify whether a face actually belongs to the same person.

### Option 3: Heavyweight FaceNet 512D Model

This option runs a full 512 dimensional FaceNet model on 160x160 face crops.

**Pros**:
- Marginal benchmark accuracy edge on large scale wild face datasets.

**Cons**:
- Binary size is 3 to 4 times larger (7 to 15 megabytes).
- Slower inference with higher thermal throttling risk on low tier mobile hardware.

## Decision

**Chosen option**: Option 1: ML Kit Face Detection with In Memory Skia Crops and MobileFaceNet TFLite Embeddings.

MobileFaceNet and in memory Skia pixel processing deliver the ideal combination of mobile performance, minimal binary overhead, low RAM consumption, and accurate cross photo person clustering.

## References

No external references recorded.
