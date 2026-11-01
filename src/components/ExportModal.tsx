import React from "react";
import {
  StyleSheet,
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";

export type ExportStatus =
  | "idle"
  | "rendering"
  | "saving"
  | "success"
  | "error";

interface ExportModalProps {
  visible: boolean;
  status: ExportStatus;
  progress: number;
  stageText?: string;
  errorMessage?: string | null;
  onClose: () => void;
}

export function ExportModal({
  visible,
  status,
  progress,
  stageText = "Preparing export...",
  errorMessage,
  onClose,
}: ExportModalProps) {
  if (!visible) return null;

  const isBusy = status === "rendering" || status === "saving";
  const isSuccess = status === "success";
  const isError = status === "error";
  const isPermissionError =
    errorMessage?.toLowerCase().includes("permission") ?? false;

  async function handleOpenSettings() {
    try {
      await Linking.openSettings();
    } catch (err) {
      console.warn("Could not open system settings:", err);
    }
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={isBusy ? undefined : onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {isBusy && (
            <View style={styles.body}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.title}>Exporting Group Photo</Text>
              <Text style={styles.subtitle}>{stageText}</Text>

              {/* Progress bar */}
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.max(5, Math.min(100, progress))}%` },
                  ]}
                />
              </View>
              <Text style={styles.percentageText}>{progress}%</Text>

              <Text style={styles.noteText}>
                Rendering at 100% original camera sensor resolution
              </Text>
            </View>
          )}

          {isSuccess && (
            <View style={styles.body}>
              <View style={styles.successIconCircle}>
                <Text style={styles.successIcon}>🎉</Text>
              </View>
              <Text style={styles.title}>Saved to Photo Gallery!</Text>
              <Text style={styles.subtitle}>
                Your seamless composite photo was saved to your device library at
                full camera resolution.
              </Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {isError && (
            <View style={styles.body}>
              <View style={styles.errorIconCircle}>
                <Text style={styles.errorIcon}>⚠️</Text>
              </View>
              <Text style={styles.errorTitle}>Export Issue</Text>
              <Text style={styles.subtitle}>
                {errorMessage || "An unexpected error occurred while saving."}
              </Text>

              <View style={styles.buttonRow}>
                {isPermissionError && (
                  <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={handleOpenSettings}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.settingsButtonText}>Open Settings</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.25)",
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  body: {
    width: "100%",
    alignItems: "center",
  },
  title: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 14,
    textAlign: "center",
  },
  errorTitle: {
    color: "#f87171",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 14,
    textAlign: "center",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  progressBarTrack: {
    width: "100%",
    height: 8,
    backgroundColor: "#1e293b",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 18,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#38bdf8",
    borderRadius: 4,
  },
  percentageText: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
  },
  noteText: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 8,
    textAlign: "center",
  },
  successIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  successIcon: {
    fontSize: 28,
  },
  errorIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  errorIcon: {
    fontSize: 28,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    width: "100%",
  },
  primaryButton: {
    backgroundColor: "#0284c7",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 20,
    width: "100%",
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  settingsButton: {
    backgroundColor: "#334155",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    flex: 1,
  },
  settingsButtonText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
});
