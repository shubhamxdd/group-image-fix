import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useGalleryPicker } from "../hooks/useGalleryPicker";
import { useSessionStore } from "../store/sessionStore";
import { Photo } from "../types/session";

export default function Index() {
  const { openPicker, isPicking, session, resetSession, setBasePhoto } =
    useGalleryPicker();
  const activeToken = useSessionStore((state) => state.activeToken);
  const [isProcessing, setIsProcessing] = useState(false);

  const isImporting = isPicking || session?.status === "importing";

  async function handleStartDetection() {
    if (!session || isProcessing) return;
    try {
      setIsProcessing(true);
      const { runFaceDetectionPipeline } = await import(
        "../services/facePipelineService"
      );
      await runFaceDetectionPipeline(session.id, activeToken);
    } finally {
      setIsProcessing(false);
    }
  }

  if (isImporting) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.busyTitle}>Importing Group Photos</Text>
        <Text style={styles.busySubtitle}>
          Copying originals and creating 1080p proxies on device...
        </Text>
      </View>
    );
  }

  if (session?.status === "error") {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Import Failed</Text>
          <Text style={styles.errorMessage}>
            {session.errorMessage || "An unexpected error occurred."}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => resetSession()}
          >
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (session?.status === "ready") {
    const progress = session.detectionProgress;
    const isDetecting =
      isProcessing ||
      progress.stage === "detecting" ||
      progress.stage === "embedding" ||
      progress.stage === "clustering";
    const isDone = progress.stage === "done";
    const hasError = progress.stage === "error";

    // Count detected faces per photo
    const faceCountByPhoto = new Map<string, number>();
    for (const face of Object.values(session.detectedFaces || {})) {
      const count = faceCountByPhoto.get(face.photoId) || 0;
      faceCountByPhoto.set(face.photoId, count + 1);
    }

    return (
      <View style={styles.container}>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.headerTitle}>Burst Group Session</Text>
            <Text style={styles.headerSubtitle}>
              {session.photos.length} photos loaded
            </Text>
          </View>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => resetSession()}
          >
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {isDetecting && (
          <View style={styles.progressBanner}>
            <ActivityIndicator size="small" color="#38bdf8" />
            <View style={styles.progressTextWrapper}>
              <Text style={styles.progressHeadline}>
                {progress.stage === "detecting" &&
                  `Detecting faces in photo ${progress.currentPhotoIndex} of ${progress.totalPhotos || session.photos.length}...`}
                {progress.stage === "embedding" &&
                  `Generating neural embeddings (${progress.currentPhotoIndex} of ${progress.totalPhotos})...`}
                {progress.stage === "clustering" &&
                  "Matching persons across burst shots..."}
              </Text>
              <Text style={styles.progressSubtext}>
                Computing 100% offline using MobileFaceNet
              </Text>
            </View>
          </View>
        )}

        {hasError && (
          <View style={styles.detectionErrorBanner}>
            <Text style={styles.detectionErrorTitle}>Detection Issue</Text>
            <Text style={styles.detectionErrorSubtitle}>
              {progress.errorMessage || "Detection encountered an unexpected issue."}
            </Text>
          </View>
        )}

        {isDone && (
          <View style={styles.personsCard}>
            <View style={styles.personsHeaderRow}>
              <Text style={styles.personsTitle}>
                👥 {session.persons.length} People Grouped
              </Text>
              <Text style={styles.facesTotalCount}>
                {Object.keys(session.detectedFaces).length} total faces
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {session.persons.map((person) => {
                const bestFace = person.bestFaceId
                  ? session.detectedFaces[person.bestFaceId]
                  : null;
                const scorePercent = bestFace
                  ? Math.round(bestFace.qualityScore * 100)
                  : null;

                const thumbnail =
                  person.thumbnailUri || bestFace?.cropUri;

                return (
                  <View key={person.id} style={styles.personPill}>
                    <Text style={styles.personLabel}>{person.label}</Text>

                    {thumbnail ? (
                      <Image
                        source={{ uri: thumbnail }}
                        style={styles.personAvatar}
                        contentFit="cover"
                        transition={150}
                      />
                    ) : (
                      <View style={styles.personAvatarPlaceholder}>
                        <Text style={styles.avatarPlaceholderText}>👤</Text>
                      </View>
                    )}

                    <Text style={styles.personCount}>
                      {person.faceIds.length} shots
                    </Text>
                    {scorePercent !== null && (
                      <View style={styles.scoreBadge}>
                        <Text style={styles.scoreText}>
                          Best: {scorePercent}%
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        <Text style={styles.instructionNote}>
          Tap any thumbnail below to choose the primary base photo.
        </Text>

        <FlatList
          data={session.photos}
          keyExtractor={(item: Photo) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item, index }) => {
            const isBase = item.id === session.basePhotoId;
            const photoFaces = faceCountByPhoto.get(item.id) || 0;

            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setBasePhoto(item.id)}
                style={[styles.card, isBase && styles.cardActive]}
              >
                <View style={styles.imageWrapper}>
                  <Image
                    source={{ uri: item.proxyUri }}
                    style={styles.thumbnail}
                    contentFit="cover"
                    transition={200}
                  />
                  {photoFaces > 0 && (
                    <View style={styles.faceCountBadge}>
                      <Text style={styles.faceCountBadgeText}>
                        👥 {photoFaces}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.cardFooter}>
                  <View style={styles.badgeRow}>
                    <Text style={styles.photoIndexText}>Photo #{index + 1}</Text>
                    {isBase && (
                      <View style={styles.baseBadge}>
                        <Text style={styles.baseBadgeText}>Base</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.metaText}>
                    {item.width} x {item.height}
                  </Text>
                  <Text style={styles.metaSubText}>
                    Proxy: {item.proxyWidth} x {item.proxyHeight}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        <View style={styles.actionBar}>
          {!isDone ? (
            <TouchableOpacity
              style={[
                styles.primaryActionButton,
                isDetecting && styles.disabledActionButton,
              ]}
              disabled={isDetecting}
              onPress={handleStartDetection}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryActionText}>
                {isDetecting
                  ? "Detecting & Grouping Faces..."
                  : "Detect Faces & Group People"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.disabledActionButton}
              disabled={true}
            >
              <Text style={styles.disabledActionText}>
                Next: Face Blend Engine (Feature 5)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.idleScrollContent}>
      <View style={styles.heroSection}>
        <View style={styles.iconPlaceholder}>
          <Text style={styles.iconSymbol}>👥</Text>
        </View>
        <Text style={styles.heroTitle}>Group Photo Expression Fixer</Text>
        <Text style={styles.heroSubtitle}>
          Fix blinking eyes and awkward faces across burst shots. Select 2 to 10
          burst photos of the same group to blend the best expressions.
        </Text>
      </View>

      <View style={styles.cardContainer}>
        <View style={styles.featureItem}>
          <Text style={styles.featureBullet}>🔒</Text>
          <View style={styles.featureTextWrapper}>
            <Text style={styles.featureHeadline}>100% On Device & Private</Text>
            <Text style={styles.featureBody}>
              No photos or faces are ever uploaded to cloud servers.
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureBullet}>⚡</Text>
          <View style={styles.featureTextWrapper}>
            <Text style={styles.featureHeadline}>Memory Protected</Text>
            <Text style={styles.featureBody}>
              High resolution originals are preserved while 1080p proxies keep
              device processing fast and responsive.
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={openPicker}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>Select Group Photos</Text>
      </TouchableOpacity>
      <Text style={styles.helperNotice}>
        Requires 2 to 10 photos from the same burst or scene.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b0f17",
  },
  idleScrollContent: {
    flexGrow: 1,
    backgroundColor: "#0b0f17",
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#0b0f17",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconSymbol: {
    fontSize: 34,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#f8fafc",
    textAlign: "center",
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 15,
    color: "#94a3b8",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  cardContainer: {
    width: "100%",
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  featureBullet: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  featureTextWrapper: {
    flex: 1,
  },
  featureHeadline: {
    fontSize: 15,
    fontWeight: "600",
    color: "#f1f5f9",
    marginBottom: 2,
  },
  featureBody: {
    fontSize: 13,
    color: "#94a3b8",
    lineHeight: 18,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "600",
  },
  helperNotice: {
    marginTop: 12,
    fontSize: 12,
    color: "#64748b",
  },
  busyTitle: {
    marginTop: 18,
    fontSize: 18,
    fontWeight: "600",
    color: "#f8fafc",
  },
  busySubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "#1e1e2d",
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dc2626",
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ef4444",
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: "#fca5a5",
    textAlign: "center",
    marginBottom: 20,
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#f8fafc",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#94a3b8",
  },
  instructionNote: {
    fontSize: 12,
    color: "#64748b",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  progressBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#13233b",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1d4ed8",
  },
  progressTextWrapper: {
    marginLeft: 12,
    flex: 1,
  },
  progressHeadline: {
    color: "#f0f9ff",
    fontSize: 13,
    fontWeight: "600",
  },
  progressSubtext: {
    color: "#93c5fd",
    fontSize: 11,
    marginTop: 2,
  },
  detectionErrorBanner: {
    backgroundColor: "#2e1217",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#b91c1c",
  },
  detectionErrorTitle: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "700",
  },
  detectionErrorSubtitle: {
    color: "#fca5a5",
    fontSize: 12,
    marginTop: 2,
  },
  personsCard: {
    backgroundColor: "#161e2e",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f293d",
  },
  personsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  personsTitle: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
  },
  facesTotalCount: {
    color: "#94a3b8",
    fontSize: 12,
  },
  personPill: {
    backgroundColor: "#0f172a",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    minWidth: 84,
  },
  personLabel: {
    color: "#f1f5f9",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
  },
  personAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1e293b",
    borderWidth: 2,
    borderColor: "#38bdf8",
    marginBottom: 6,
  },
  personAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#475569",
  },
  avatarPlaceholderText: {
    fontSize: 22,
  },
  personCount: {
    color: "#94a3b8",
    fontSize: 10,
    marginBottom: 4,
  },
  scoreBadge: {
    backgroundColor: "#0284c7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scoreText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "700",
  },
  gridContent: {
    padding: 10,
  },
  card: {
    flex: 1,
    margin: 6,
    backgroundColor: "#161e2e",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardActive: {
    borderColor: "#38bdf8",
  },
  imageWrapper: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#0f172a",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  faceCountBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  faceCountBadgeText: {
    color: "#38bdf8",
    fontSize: 11,
    fontWeight: "600",
  },
  cardFooter: {
    padding: 8,
  },
  badgeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  photoIndexText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#f1f5f9",
  },
  baseBadge: {
    backgroundColor: "#0284c7",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  baseBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
    textTransform: "uppercase",
  },
  metaText: {
    fontSize: 11,
    color: "#94a3b8",
  },
  metaSubText: {
    fontSize: 10,
    color: "#64748b",
  },
  actionBar: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0b0f17",
  },
  primaryActionButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryActionText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  disabledActionButton: {
    backgroundColor: "#1e293b",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  disabledActionText: {
    color: "#64748b",
    fontSize: 15,
    fontWeight: "600",
  },
});
