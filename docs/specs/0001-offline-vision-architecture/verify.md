# Verify: Offline Vision Architecture · spec 0001 · updated 2026-10-24

_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [x] `bunx tsc --noEmit` → TypeScript checks cleanly with zero type errors → AC-1, AC-2, AC-3, AC-4, AC-5
- [x] `bun pm untrusted` or package check → Native modules `@react-native-ml-kit/face-detection`, `react-native-fast-tflite`, and `@shopify/react-native-skia` are present in package.json → AC-1, AC-2, AC-3
- [x] Metro asset check → `metro.config.js` includes `tflite` in `assetExts` → AC-2
- [x] App config check → `app.json` declares plugins for `expo-asset`, `react-native-fast-tflite`, and `expo-media-library` with permissions → AC-4, AC-5

## Acceptance criteria coverage
- AC-1 covered by face detection library integration (@react-native-ml-kit/face-detection)
- AC-2 covered by react-native-fast-tflite and metro tflite asset extension setup
- AC-3 covered by @shopify/react-native-skia integration
- AC-4 covered by expo-media-library configuration and permissions
- AC-5 covered by 100 percent local on device packages with no remote API dependencies
