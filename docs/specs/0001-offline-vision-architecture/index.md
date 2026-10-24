# 0001. Offline Vision Architecture

**Date**: 2026-10-24
**Status**: Accepted

## Summary

This architecture establishes a completely offline computer vision engine for group photo face swapping in React Native. The system detects faces, measures smile and open eyes quality scores using Google ML Kit, and groups each person across shots using a compact MobileFaceNet model running on react-native-fast-tflite. Interactive editing runs at sixty frames per second using React Native Skia on downscaled proxies, while final export uses multi band blending on localized regions of interest to produce natural photos with no visible seams. All processing happens locally on device with zero network traffic.

## Requirements

**User stories**:
- As a user taking group photos, I want the app to detect all faces in my photos completely offline so that my personal photos remain private.
- As a user with multiple burst photos, I want the app to automatically know which faces belong to the same person even if people switch sides so that I can easily browse expression options.
- As a user editing a group photo, I want instant feedback when tapping different expressions and a clean final photo without weird cutout edges or memory crashes.

**Acceptance criteria**:
- **AC-1**: Face detection locates all faces in an imported group photo, returning bounding boxes, eye landmarks, and expression probabilities on device in under 500 milliseconds per photo.
- **AC-2**: Face clustering groups faces of the same person across all imported photos using MobileFaceNet embeddings with cosine similarity at or above 0.70, enforcing strict photo exclusivity so no cluster holds duplicate faces from one photo.
- **AC-3**: The interactive editor updates face expression changes within 16 milliseconds (60 frames per second) using React Native Skia on downscaled 1080p proxy images.
- **AC-4**: High resolution export performs localized multi band blending on 30 percent padded face regions, producing smooth boundaries without color bleeding halos or out of memory crashes.
- **AC-5**: The entire computer vision pipeline runs 100 percent offline with zero network requests or background uploads.

## Decision

**Chosen option**: Option 1: Google ML Kit with MobileFaceNet TFLite, React Native Skia, and Proxy Multi Band Blending.

The application will use Google ML Kit for face detection and expression scoring, `react-native-fast-tflite` with MobileFaceNet for face clustering, React Native Skia for interactive editing on 1080p proxies, and localized multi band blending on 30 percent padded face bounds for final export.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Face detection and landmarks | Google ML Kit Face Detection (`@react-native-ml-kit/face-detection`) | Native on iOS and Android, runs offline, returns bounding boxes, facial landmarks, and open eye and smiling scores. |
| Face embedding inference | `react-native-fast-tflite` with MobileFaceNet (4 megabytes) | Runs hardware accelerated inference on GPU or NPU, producing 128 dimension identity vectors for reliable clustering. |
| Person clustering across photos | Constrained Agglomerative Clustering with photo exclusivity | Groups faces of the same person using a cosine similarity threshold of 0.70; prevents two faces from the same photo sharing a cluster. |
| Interactive preview canvas | React Native Skia (`@shopify/react-native-skia`) | High performance 2D hardware accelerated canvas for smooth matrix transforms and real time feathered mask rendering. |
| Face alignment | 4-DOF Similarity Transform (rotation, uniform scale, translation) | Centers, scales, and rotates alternate faces based on eye coordinates in normalized unit space without shearing distortion. |
| Memory and image pipeline | Proxy workflow (1080p preview) with region of interest export | Downscales photos to 1080p for preview and detection, keeping full resolution images on disk until export. |
| Blending engine | Multi band Laplacian pyramid blending and feathered mask | Feathered elliptical mask for live preview; multi band localized blending on 30 percent padded face regions on export. |
| Base photo selection | Automated quality scoring with manual override | Auto selects the photo with the highest aggregate eye open and smile score as default base, with manual tap selection. |
| Local cache and storage | Expo FileSystem (`expo-file-system`) and MediaLibrary (`expo-media-library`) | Stores intermediate cropped faces in app cache and saves the final composite image into the camera roll. |

## Rationale
Reasoning and options: see rationale.md

## Consequences

**Positive**:
- 100 percent offline operation guarantees user privacy and zero server hosting expenses.
- Fluid user experience in the editor with immediate visual response when testing different expressions.
- Robust grouping ensures faces are never mixed up even when group members shift positions.
- Proxy pipeline and localized blending safeguard against out of memory crashes on low end mobile hardware.

**Negative / tradeoffs**:
- Expo Go cannot run this project; developers must use Expo development builds (`npx expo run:ios` and `npx expo run:android`) or EAS development builds.
- App binary size increases by around 15 megabytes to accommodate native libraries and model weights.
- Face alignment requires donor and base faces to have head yaw and pitch within 15 degrees to avoid perspective distortion.

## Follow-up

- [ ] Add `.tflite` to `metro.config.js` asset extensions and bundle `mobilefacenet.tflite` in `assets/models/`.
- [ ] Set up Expo config plugins for `@react-native-ml-kit/face-detection`, `react-native-fast-tflite`, and `@shopify/react-native-skia` in `app.json`.
- [ ] Measure memory footprint and export rendering times for 12 megapixel photos on mid tier Android and iOS devices.
