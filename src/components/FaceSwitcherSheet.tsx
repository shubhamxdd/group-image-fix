import React, { useEffect, useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { DetectedFace, Person } from "../types/detection";
import { Photo } from "../types/session";
import { FaceSwapSelection } from "../types/blend";
import { getOrGenerateFaceCropUri } from "../services/faceCropService";

interface FaceSwitcherSheetProps {
  person: Person;
  allFaces: Record<string, DetectedFace>;
  photos: Photo[];
  basePhotoId: string;
  activeSwap?: FaceSwapSelection;
  isBlending?: boolean;
  onSelectFace: (faceId: string) => void;
  onRevertFace: () => void;
  onRenamePerson?: (newName: string) => void;
  onClose: () => void;
}

export function FaceSwitcherSheet({
  person,
  allFaces,
  photos,
  basePhotoId,
  activeSwap,
  isBlending = false,
  onSelectFace,
  onRevertFace,
  onRenamePerson,
  onClose,
}: FaceSwitcherSheetProps) {
  const [cropUris, setCropUris] = useState<Record<string, string>>({});
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(person.label);

  const photoIndexMap = useMemo(
    () => new Map<string, number>(photos.map((p, idx) => [p.id, idx + 1])),
    [photos]
  );

  const faceList: DetectedFace[] = useMemo(
    () => person.faceIds.map((id) => allFaces[id]).filter(Boolean),
    [person.faceIds, allFaces]
  );

  // Pre-load or generate missing crop thumbnails for faces in this person
  useEffect(() => {
    let isCancelled = false;
    const photoMap = new Map<string, Photo>(photos.map((p) => [p.id, p]));

    async function loadCrops() {
      const newUris: Record<string, string> = {};
      for (const face of faceList) {
        if (face.cropUri) {
          newUris[face.id] = face.cropUri;
        } else {
          const photo = photoMap.get(face.photoId);
          if (photo) {
            const uri = await getOrGenerateFaceCropUri(face, photo);
            if (uri) {
              newUris[face.id] = uri;
            }
          }
        }
      }
      if (!isCancelled) {
        setCropUris((prev) => ({ ...prev, ...newUris }));
      }
    }
    loadCrops();
    return () => {
      isCancelled = true;
    };
  }, [faceList, photos]);

  const hasActiveSwap = !!activeSwap;

  function handleSaveName() {
    const trimmed = nameInput.trim();
    if (trimmed && onRenamePerson) {
      onRenamePerson(trimmed);
    }
    setIsRenaming(false);
  }

  return (
    <View style={styles.sheetContainer}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrapper}>
          <TouchableOpacity
            style={styles.nameTouchButton}
            onPress={() => {
              setNameInput(person.label);
              setIsRenaming(true);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Rename ${person.label}`}
          >
            <Text style={styles.personTitle}>👤 {person.label}</Text>
            <View style={styles.editBadge}>
              <Text style={styles.editBadgeText}>✏️</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.subTitle}>
            {faceList.length} shots
          </Text>
        </View>

        <View style={styles.actionsRow}>
          {hasActiveSwap && (
            <TouchableOpacity
              style={styles.revertButton}
              onPress={onRevertFace}
              activeOpacity={0.7}
              disabled={isBlending}
            >
              <Text style={styles.revertButtonText}>↺ Revert</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {faceList.map((face) => {
          const isBaseFace = face.photoId === basePhotoId;
          const isSelected = activeSwap
            ? activeSwap.donorFaceId === face.id
            : isBaseFace;

          const photoNum = photoIndexMap.get(face.photoId) || 1;
          const cropUri = cropUris[face.id] || face.cropUri;

          const smilePct =
            face.smilingProbability !== undefined && face.smilingProbability !== null
              ? Math.round(face.smilingProbability * 100)
              : Math.round(face.qualityScore * 100);

          return (
            <TouchableOpacity
              key={face.id}
              style={[
                styles.faceCard,
                isSelected && styles.faceCardSelected,
                isBaseFace && !isSelected && styles.faceCardBase,
              ]}
              onPress={() => onSelectFace(face.id)}
              activeOpacity={0.75}
              disabled={isBlending}
            >
              <View style={styles.avatarWrapper}>
                {cropUri ? (
                  <Image
                    source={{ uri: cropUri }}
                    style={styles.faceAvatar}
                    contentFit="cover"
                    transition={150}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <ActivityIndicator size="small" color="#38bdf8" />
                  </View>
                )}

                {isSelected && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>✓</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardDetails}>
                <View style={styles.scoreRow}>
                  <Text style={styles.scoreText}>
                    {face.smilingProbability !== undefined && face.smilingProbability > 0.5
                      ? "😊"
                      : "🙂"}{" "}
                    {smilePct}%
                  </Text>
                </View>
                <Text style={styles.photoLabel}>
                  {isBaseFace ? "Original" : `Photo #${photoNum}`}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isBlending && (
        <View style={styles.blendingOverlay}>
          <ActivityIndicator size="small" color="#38bdf8" />
          <Text style={styles.blendingText}>Blending expression...</Text>
        </View>
      )}

      {/* Rename Person Modal */}
      <Modal
        visible={isRenaming}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRenaming(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename Person</Text>
            <Text style={styles.modalSubtitle}>
              Give this person a recognizable name like Rahul or Mom.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="e.g. Rahul, Priya, Dad"
              placeholderTextColor="#64748b"
              autoFocus
              selectTextOnFocus
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsRenaming(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleSaveName}
                activeOpacity={0.8}
              >
                <Text style={styles.modalSaveText}>Save Name</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    backgroundColor: "#0f172a",
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.2)",
    paddingTop: 10,
    paddingBottom: 16,
    position: "relative",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  titleWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nameTouchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(30, 41, 59, 0.8)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
  },
  personTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  editBadge: {
    paddingLeft: 2,
  },
  editBadgeText: {
    fontSize: 12,
  },
  subTitle: {
    color: "#94a3b8",
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  revertButton: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  revertButtonText: {
    color: "#f87171",
    fontSize: 12,
    fontWeight: "600",
  },
  closeButton: {
    backgroundColor: "rgba(51, 65, 85, 0.6)",
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  faceCard: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 6,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(148, 163, 184, 0.2)",
    minWidth: 80,
  },
  faceCardSelected: {
    borderColor: "#38bdf8",
    backgroundColor: "rgba(56, 189, 248, 0.1)",
  },
  faceCardBase: {
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  avatarWrapper: {
    position: "relative",
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: "hidden",
  },
  faceAvatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: "#0284c7",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#ffffff",
  },
  selectedBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  cardDetails: {
    alignItems: "center",
    marginTop: 4,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreText: {
    color: "#f1f5f9",
    fontSize: 11,
    fontWeight: "600",
  },
  photoLabel: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 1,
  },
  blendingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  blendingText: {
    color: "#38bdf8",
    fontSize: 13,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.25)",
    padding: 20,
    width: "100%",
    maxWidth: 340,
  },
  modalTitle: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: "#94a3b8",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: "#1e293b",
    color: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.3)",
    marginBottom: 18,
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: "#334155",
  },
  modalCancelText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "600",
  },
  modalSaveButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: "#0284c7",
  },
  modalSaveText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
});
