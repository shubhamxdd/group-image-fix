import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSessionStore } from "../store/sessionStore";
import { CompositeCanvas } from "../components/CompositeCanvas";
import { FaceSwitcherSheet } from "../components/FaceSwitcherSheet";
import { CompareButton } from "../components/CompareButton";
import { ExportModal, ExportStatus } from "../components/ExportModal";
import { exportFullResolutionComposite } from "../services/faceExportService";

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const session = useSessionStore((state) => state.session);
  const setFaceSwap = useSessionStore((state) => state.setFaceSwap);
  const removeFaceSwap = useSessionStore((state) => state.removeFaceSwap);
  const renamePerson = useSessionStore((state) => state.renamePerson);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [showOutlines, setShowOutlines] = useState<boolean>(true);

  // Export modal state
  const [exportModalVisible, setExportModalVisible] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStageText, setExportStageText] = useState<string>("");
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(
    null
  );

  if (!session || !session.basePhotoId || session.photos.length === 0) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Active Session</Text>
        <Text style={styles.emptySubtitle}>
          Please select burst photos from the gallery first.
        </Text>
        <TouchableOpacity
          style={styles.backHomeButton}
          onPress={() => router.replace("/")}
          activeOpacity={0.8}
        >
          <Text style={styles.backHomeButtonText}>Go to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const basePhoto = session.photos.find((p) => p.id === session.basePhotoId);
  if (!basePhoto) {
    return (
      <SafeAreaView style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Base Photo Missing</Text>
        <TouchableOpacity
          style={styles.backHomeButton}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.backHomeButtonText}>Return to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const activeSwaps = session.swaps || {};
  const activeSwapCount = Object.keys(activeSwaps).length;

  // Decide image URI to show
  const currentImageUri =
    isComparing || !session.activeBlendPreviewUri
      ? basePhoto.proxyUri
      : session.activeBlendPreviewUri;

  const selectedPerson = selectedPersonId
    ? session.persons.find((p) => p.id === selectedPersonId) || null
    : null;

  async function handleSelectFace(faceId: string) {
    if (!selectedPersonId) return;
    try {
      await setFaceSwap(selectedPersonId, faceId);
    } catch (err) {
      console.warn("Failed to apply face swap:", err);
    }
  }

  async function handleRevertFace() {
    if (!selectedPersonId) return;
    try {
      await removeFaceSwap(selectedPersonId);
    } catch (err) {
      console.warn("Failed to revert face swap:", err);
    }
  }

  async function handleStartExport() {
    if (!session) return;
    setExportModalVisible(true);
    setExportStatus("rendering");
    setExportProgress(10);
    setExportStageText("Preparing full resolution render...");
    setExportErrorMessage(null);

    try {
      const result = await exportFullResolutionComposite(
        session,
        (progress, stage) => {
          setExportProgress(progress);
          setExportStageText(stage);
        }
      );

      if (result.success) {
        setExportStatus("success");
        setExportProgress(100);
      } else {
        setExportStatus("error");
        setExportErrorMessage(result.error || "Could not save composite image.");
      }
    } catch (err: any) {
      setExportStatus("error");
      setExportErrorMessage(
        err?.message || "Unexpected failure during export rendering."
      );
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Top action header */}
      <View
        style={[
          styles.headerBar,
          { paddingTop: Math.max(12, insets.top) },
        ]}
      >
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => router.back()}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.headerIconText}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Expression Editor</Text>
          <Text style={styles.headerSubtitle}>
            {activeSwapCount > 0
              ? `${activeSwapCount} face ${activeSwapCount === 1 ? "swap" : "swaps"} active`
              : "Original base photo"}
          </Text>
        </View>

        <View style={styles.headerRightActions}>
          <CompareButton
            isComparing={isComparing}
            onCompareStart={() => setIsComparing(true)}
            onCompareEnd={() => setIsComparing(false)}
            disabled={activeSwapCount === 0}
          />

          <TouchableOpacity
            style={styles.exportButton}
            onPress={handleStartExport}
            activeOpacity={0.8}
          >
            <Text style={styles.exportButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Canvas with Letterbox Mapping */}
      <View style={styles.canvasContainer}>
        <CompositeCanvas
          imageUri={currentImageUri}
          basePhoto={basePhoto}
          detectedFaces={session.detectedFaces}
          persons={session.persons}
          activePersonId={selectedPersonId}
          isComparing={isComparing}
          showOutlines={showOutlines}
          onToggleOutlines={() => setShowOutlines((prev) => !prev)}
          activeSwaps={activeSwaps}
          onSelectPerson={(personId) => setSelectedPersonId(personId)}
        />
      </View>

      {/* Bottom Switcher Drawer or Prompt */}
      {selectedPerson ? (
        <FaceSwitcherSheet
          person={selectedPerson}
          allFaces={session.detectedFaces}
          photos={session.photos}
          basePhotoId={session.basePhotoId}
          activeSwap={activeSwaps[selectedPerson.id]}
          isBlending={session.isBlending}
          onSelectFace={handleSelectFace}
          onRevertFace={handleRevertFace}
          onRenamePerson={(newName) => renamePerson(selectedPerson.id, newName)}
          onClose={() => setSelectedPersonId(null)}
        />
      ) : (
        <View style={styles.hintDock}>
          <Text style={styles.hintDockIcon}>{showOutlines ? "👆" : "👁️"}</Text>
          <Text style={styles.hintDockText}>
            {showOutlines
              ? "Tap any highlighted face to pick an alternate expression"
              : "Outlines hidden for inspection. Tap Outlines On above to select faces"}
          </Text>
        </View>
      )}

      {/* Export progress modal */}
      <ExportModal
        visible={exportModalVisible}
        status={exportStatus}
        progress={exportProgress}
        stageText={exportStageText}
        errorMessage={exportErrorMessage}
        onClose={() => setExportModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#020617",
  },
  headerBar: {
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.2)",
  },
  headerIconButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(30, 41, 59, 0.8)",
  },
  headerIconText: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  headerTitleContainer: {
    alignItems: "center",
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  exportButton: {
    backgroundColor: "#0284c7",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  exportButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: "#020617",
  },
  hintDock: {
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.2)",
  },
  hintDockIcon: {
    fontSize: 16,
  },
  hintDockText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  emptySubtitle: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  backHomeButton: {
    backgroundColor: "#0284c7",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  backHomeButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
});
