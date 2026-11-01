import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  LayoutChangeEvent,
} from "react-native";
import { Image } from "expo-image";
import { Photo } from "../types/session";
import { DetectedFace, Person } from "../types/detection";

interface CompositeCanvasProps {
  imageUri: string;
  basePhoto: Photo;
  detectedFaces: Record<string, DetectedFace>;
  persons: Person[];
  activePersonId: string | null;
  isComparing: boolean;
  activeSwaps?: Record<string, any>;
  onSelectPerson: (personId: string) => void;
}

export function CompositeCanvas({
  imageUri,
  basePhoto,
  detectedFaces,
  persons,
  activePersonId,
  isComparing,
  activeSwaps = {},
  onSelectPerson,
}: CompositeCanvasProps) {
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  function handleLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setContainerSize({ width, height });
    }
  }

  // Calculate letterbox placement
  let renderedWidth = 0;
  let renderedHeight = 0;
  let offsetX = 0;
  let offsetY = 0;

  if (containerSize && basePhoto.proxyWidth > 0 && basePhoto.proxyHeight > 0) {
    const scale = Math.min(
      containerSize.width / basePhoto.proxyWidth,
      containerSize.height / basePhoto.proxyHeight
    );
    renderedWidth = basePhoto.proxyWidth * scale;
    renderedHeight = basePhoto.proxyHeight * scale;
    offsetX = (containerSize.width - renderedWidth) / 2;
    offsetY = (containerSize.height - renderedHeight) / 2;
  }

  // Find the base face for each person
  const baseFacesByPerson = new Map<string, DetectedFace>();
  for (const face of Object.values(detectedFaces)) {
    if (face.photoId === basePhoto.id && face.personId) {
      baseFacesByPerson.set(face.personId, face);
    }
  }

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Image
        source={{ uri: imageUri }}
        style={styles.image}
        contentFit="contain"
        transition={100}
        cachePolicy="memory-disk"
      />

      {/* Render face indicator rings only when not in compare mode */}
      {!isComparing &&
        containerSize &&
        renderedWidth > 0 &&
        persons.map((person) => {
          const baseFace = baseFacesByPerson.get(person.id);
          if (!baseFace) return null;

          const isActive = person.id === activePersonId;
          const hasActiveSwap = !!activeSwaps[person.id];

          const centerX =
            offsetX +
            (baseFace.bounds.x + baseFace.bounds.width / 2) * renderedWidth;
          const centerY =
            offsetY +
            (baseFace.bounds.y + baseFace.bounds.height / 2) * renderedHeight;

          const radius = Math.max(
            baseFace.bounds.width * renderedWidth,
            baseFace.bounds.height * renderedHeight
          ) * 0.58;

          const diameter = Math.round(radius * 2);
          const left = Math.round(centerX - radius);
          const top = Math.round(centerY - radius);

          return (
            <Pressable
              key={person.id}
              onPress={() => onSelectPerson(person.id)}
              hitSlop={12}
              style={[
                styles.faceRing,
                {
                  left,
                  top,
                  width: diameter,
                  height: diameter,
                  borderRadius: diameter / 2,
                },
                isActive && styles.faceRingActive,
                hasActiveSwap && !isActive && styles.faceRingSwapped,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${person.label}${hasActiveSwap ? " (swapped)" : ""}`}
              accessibilityState={{ selected: isActive }}
            >
              {hasActiveSwap && (
                <View style={styles.swapSparkleBadge}>
                  <Text style={styles.swapSparkleText}>✨</Text>
                </View>
              )}
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    backgroundColor: "#020617",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  faceRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(255, 255, 255, 0.45)",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  faceRingActive: {
    borderStyle: "solid",
    borderColor: "#38bdf8",
    borderWidth: 2,
    backgroundColor: "transparent",
    shadowColor: "#38bdf8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 6,
  },
  faceRingSwapped: {
    borderStyle: "solid",
    borderColor: "#10b981",
    borderWidth: 1.5,
    backgroundColor: "transparent",
  },
  swapSparkleBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#065f46",
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#10b981",
    alignItems: "center",
    justifyContent: "center",
  },
  swapSparkleText: {
    fontSize: 9,
  },
});
