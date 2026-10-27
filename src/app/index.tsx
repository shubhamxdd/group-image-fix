import React from "react";
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
import { Photo } from "../types/session";

export default function Index() {
  const { openPicker, isPicking, session, resetSession, setBasePhoto } =
    useGalleryPicker();

  const isBusy = isPicking || session?.status === "importing";

  if (isBusy) {
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
    return (
      <View style={styles.container}>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.headerTitle}>Active Burst Session</Text>
            <Text style={styles.headerSubtitle}>
              {session.photos.length} photos ready for face detection
            </Text>
          </View>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => resetSession()}
          >
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>

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
            return (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setBasePhoto(item.id)}
                style={[styles.card, isBase && styles.cardActive]}
              >
                <Image
                  source={{ uri: item.proxyUri }}
                  style={styles.thumbnail}
                  contentFit="cover"
                  transition={200}
                />
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
          <TouchableOpacity
            style={styles.disabledActionButton}
            disabled={true}
          >
            <Text style={styles.disabledActionText}>
              Next: Detect Faces (Next Slice)
            </Text>
          </TouchableOpacity>
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
  thumbnail: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#0f172a",
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