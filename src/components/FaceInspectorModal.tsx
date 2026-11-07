import React, { useState } from "react";
import {
  StyleSheet,
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Photo } from "../types/session";
import { DetectedFace } from "../types/detection";
import { useSessionStore } from "../store/sessionStore";
import { useTheme } from "../store/themeStore";

interface FaceInspectorModalProps {
  photo: Photo | null;
  photoIndex?: number;
  totalPhotos?: number;
  visible: boolean;
  onClose: () => void;
}

export function FaceInspectorModal({
  photo,
  photoIndex,
  totalPhotos,
  visible,
  onClose,
}: FaceInspectorModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const detectedFaces = useSessionStore((state) => state.session?.detectedFaces || {});
  const persons = useSessionStore((state) => state.session?.persons || []);
  const toggleFaceExcluded = useSessionStore((state) => state.toggleFaceExcluded);

  const [imageContainerWidth, setImageContainerWidth] = useState<number>(0);
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);

  if (!visible || !photo) {
    return null;
  }

  // Find all faces detected for this photo
  const photoFaces: DetectedFace[] = Object.values(detectedFaces).filter(
    (face) => face.photoId === photo.id
  );

  // Map person names for quick lookup
  const personMap = new Map<string, string>();
  for (const person of persons) {
    personMap.set(person.id, person.label);
  }

  // Display aspect-fit height for image container
  const aspectRatio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1.33;
  const displayImageHeight = imageContainerWidth > 0 ? Math.min(260, imageContainerWidth / aspectRatio) : 220;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.modalScreen, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

        {/* Top Header */}
        <View
          style={[
            styles.modalHeader,
            {
              paddingTop: Math.max(14, insets.top),
              backgroundColor: colors.headerBg,
              borderBottomColor: colors.headerBorder,
            },
          ]}
        >
          <View style={styles.headerTitleGroup}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Manage Detected Faces
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {photoIndex !== undefined && totalPhotos !== undefined
                ? `Photo ${photoIndex + 1} of ${totalPhotos} · `
                : ""}
              {photoFaces.length} {photoFaces.length === 1 ? "face" : "faces"} detected
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: colors.accent }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Photo with Bounding Boxes */}
          <View
            style={[
              styles.imageContainer,
              {
                height: displayImageHeight,
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.cardBorder,
              },
            ]}
            onLayout={(e) => {
              const { width } = e.nativeEvent.layout;
              if (width > 0) setImageContainerWidth(width);
            }}
          >
            <Image
              source={{ uri: photo.proxyUri }}
              style={styles.annotatedImage}
              contentFit="contain"
              transition={150}
            />

            {/* Overlaid Face Bounding Boxes */}
            {imageContainerWidth > 0 &&
              photoFaces.map((face, idx) => {
                const isSelected = selectedFaceId === face.id;
                const isExcluded = !!face.excluded;

                // Letterbox mapping calculation
                const containerW = imageContainerWidth;
                const containerH = displayImageHeight;
                const imgW = photo.width;
                const imgH = photo.height;

                const scale = Math.min(containerW / imgW, containerH / imgH);
                const renderedW = imgW * scale;
                const renderedH = imgH * scale;
                const offsetX = (containerW - renderedW) / 2;
                const offsetY = (containerH - renderedH) / 2;

                const left = offsetX + face.bounds.x * renderedW;
                const top = offsetY + face.bounds.y * renderedH;
                const width = face.bounds.width * renderedW;
                const height = face.bounds.height * renderedH;

                return (
                  <TouchableOpacity
                    key={face.id}
                    style={[
                      styles.faceBox,
                      {
                        left,
                        top,
                        width,
                        height,
                        borderColor: isExcluded
                          ? "#ef4444"
                          : isSelected
                          ? "#38bdf8"
                          : "#10b981",
                        borderStyle: isExcluded ? "dashed" : "solid",
                        backgroundColor: isExcluded
                          ? "rgba(239, 68, 68, 0.15)"
                          : isSelected
                          ? "rgba(56, 189, 248, 0.2)"
                          : "rgba(16, 185, 129, 0.12)",
                      },
                    ]}
                    onPress={() => setSelectedFaceId(face.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.faceBoxBadge,
                        {
                          backgroundColor: isExcluded ? "#dc2626" : "#059669",
                        },
                      ]}
                    >
                      <Text style={styles.faceBoxBadgeText}>
                        {isExcluded ? "✕" : `#${idx + 1}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
          </View>

          {/* Helper instructions */}
          <View
            style={[
              styles.helperBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text style={[styles.helperHeadline, { color: colors.textPrimary }]}>
              Decide which faces to keep or exclude
            </Text>
            <Text style={[styles.helperBody, { color: colors.textSecondary }]}>
              Toggle off any accidental detections, background bystanders, or faces you do not want to swap expressions for.
            </Text>
          </View>

          {/* List of Detected Faces */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Faces in this photo ({photoFaces.length})
          </Text>

          {photoFaces.length === 0 ? (
            <View
              style={[
                styles.emptyFaceBox,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <Text style={styles.emptyFaceIcon}>🔍</Text>
              <Text style={[styles.emptyFaceTitle, { color: colors.textPrimary }]}>
                No faces detected in this photo
              </Text>
              <Text style={[styles.emptyFaceSubtitle, { color: colors.textSecondary }]}>
                Ensure the face is clear, well lit, and facing towards the camera.
              </Text>
            </View>
          ) : (
            photoFaces.map((face, index) => {
              const isSelected = selectedFaceId === face.id;
              const isExcluded = !!face.excluded;
              const personLabel = face.personId ? personMap.get(face.personId) : null;

              const smileScore = Math.round(face.smilingProbability * 100);
              const eyesScore = Math.round(
                ((face.leftEyeOpenProbability + face.rightEyeOpenProbability) / 2) * 100
              );
              const qualityPercent = Math.round(face.qualityScore * 100);

              return (
                <View
                  key={face.id}
                  style={[
                    styles.faceCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: isSelected
                        ? colors.accent
                        : isExcluded
                        ? colors.danger
                        : colors.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.faceCardHeader}>
                    {/* Face crop avatar */}
                    {face.cropUri ? (
                      <Image
                        source={{ uri: face.cropUri }}
                        style={[
                          styles.faceCrop,
                          {
                            opacity: isExcluded ? 0.5 : 1,
                            borderColor: isExcluded ? colors.danger : colors.accent,
                          },
                        ]}
                        contentFit="cover"
                        transition={100}
                      />
                    ) : (
                      <View
                        style={[
                          styles.faceCropPlaceholder,
                          { backgroundColor: colors.surfaceElevated },
                        ]}
                      >
                        <Text style={styles.faceCropPlaceholderText}>👤</Text>
                      </View>
                    )}

                    {/* Face Details */}
                    <View style={styles.faceInfoColumn}>
                      <View style={styles.faceTitleRow}>
                        <Text style={[styles.faceIndexLabel, { color: colors.textPrimary }]}>
                          Face #{index + 1}
                        </Text>
                        {personLabel && !isExcluded && (
                          <View
                            style={[
                              styles.personTag,
                              { backgroundColor: colors.accentMuted },
                            ]}
                          >
                            <Text
                              style={[
                                styles.personTagText,
                                { color: colors.accent },
                              ]}
                            >
                              👥 {personLabel}
                            </Text>
                          </View>
                        )}
                        {isExcluded && (
                          <View
                            style={[
                              styles.excludedTag,
                              { backgroundColor: colors.dangerBg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.excludedTagText,
                                { color: colors.danger },
                              ]}
                            >
                              Excluded
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Expression Metrics */}
                      <View style={styles.metricsRow}>
                        <Text style={[styles.metricText, { color: colors.textSecondary }]}>
                          😊 Smile {smileScore}%
                        </Text>
                        <Text style={[styles.metricDot, { color: colors.textMuted }]}>•</Text>
                        <Text style={[styles.metricText, { color: colors.textSecondary }]}>
                          👀 Eyes {eyesScore}%
                        </Text>
                        <Text style={[styles.metricDot, { color: colors.textMuted }]}>•</Text>
                        <Text style={[styles.metricText, { color: colors.textSecondary }]}>
                          ⭐ {qualityPercent}%
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Keep / Exclude Action Toggle */}
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                      {
                        backgroundColor: isExcluded
                          ? colors.surfaceElevated
                          : colors.successBg,
                        borderColor: isExcluded
                          ? colors.cardBorder
                          : colors.success,
                      },
                    ]}
                    onPress={() => toggleFaceExcluded(face.id)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.toggleButtonText,
                        {
                          color: isExcluded
                            ? colors.textSecondary
                            : colors.success,
                        },
                      ]}
                    >
                      {isExcluded
                        ? "✕ Excluded from Swaps (Tap to Keep)"
                        : "✓ Keeping Face (Tap to Exclude)"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScreen: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleGroup: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  doneButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  doneButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  imageContainer: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  annotatedImage: {
    width: "100%",
    height: "100%",
  },
  faceBox: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 6,
  },
  faceBoxBadge: {
    position: "absolute",
    top: -10,
    left: -4,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  faceBoxBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
  },
  helperBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  helperHeadline: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  helperBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 10,
  },
  emptyFaceBox: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyFaceIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyFaceTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptyFaceSubtitle: {
    fontSize: 12,
    textAlign: "center",
  },
  faceCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  faceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  faceCrop: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
  },
  faceCropPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  faceCropPlaceholderText: {
    fontSize: 22,
  },
  faceInfoColumn: {
    flex: 1,
    marginLeft: 12,
  },
  faceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  faceIndexLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  personTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  personTagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  excludedTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  excludedTagText: {
    fontSize: 11,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  metricText: {
    fontSize: 11,
    fontWeight: "500",
  },
  metricDot: {
    fontSize: 11,
  },
  toggleButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
