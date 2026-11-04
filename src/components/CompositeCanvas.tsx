import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  LayoutChangeEvent,
  Animated,
  GestureResponderEvent,
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
  showOutlines: boolean;
  onToggleOutlines: () => void;
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
  showOutlines,
  onToggleOutlines,
  activeSwaps = {},
  onSelectPerson,
}: CompositeCanvasProps) {
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const [zoomDisplay, setZoomDisplay] = useState<number>(1);

  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [panAnim] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));

  const gestureMetricsRef = useRef({
    currentScale: 1,
    currentPanX: 0,
    currentPanY: 0,
    grantPanX: 0,
    grantPanY: 0,
    startTouchX: 0,
    startTouchY: 0,
    initialPinchDist: null as number | null,
    initialPinchScale: 1,
    lastTapTime: 0,
  });

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
    const aspectScale = Math.min(
      containerSize.width / basePhoto.proxyWidth,
      containerSize.height / basePhoto.proxyHeight
    );
    renderedWidth = basePhoto.proxyWidth * aspectScale;
    renderedHeight = basePhoto.proxyHeight * aspectScale;
    offsetX = (containerSize.width - renderedWidth) / 2;
    offsetY = (containerSize.height - renderedHeight) / 2;
  }

  const animateTo = useCallback(
    (targetScale: number, targetX: number, targetY: number) => {
      gestureMetricsRef.current.currentScale = targetScale;
      gestureMetricsRef.current.currentPanX = targetX;
      gestureMetricsRef.current.currentPanY = targetY;
      setZoomDisplay(Math.round(targetScale * 10) / 10);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: targetScale,
          friction: 8,
          tension: 45,
          useNativeDriver: true,
        }),
        Animated.spring(panAnim, {
          toValue: { x: targetX, y: targetY },
          friction: 8,
          tension: 45,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [scaleAnim, panAnim]
  );

  function getPanBounds(s: number) {
    if (!containerSize || renderedWidth <= 0 || renderedHeight <= 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    const scaledW = renderedWidth * s;
    const scaledH = renderedHeight * s;
    const maxPanX = Math.max(0, (scaledW - containerSize.width) / 2);
    const maxPanY = Math.max(0, (scaledH - containerSize.height) / 2);
    return {
      minX: -maxPanX || 0,
      maxX: maxPanX || 0,
      minY: -maxPanY || 0,
      maxY: maxPanY || 0,
    };
  }

  function handleStartShouldSetResponder() {
    return false;
  }

  function handleMoveShouldSetResponder(evt: GestureResponderEvent) {
    if (evt.nativeEvent.touches.length >= 2) return true;
    if (gestureMetricsRef.current.currentScale > 1.05) {
      const dx = evt.nativeEvent.pageX - gestureMetricsRef.current.startTouchX;
      const dy = evt.nativeEvent.pageY - gestureMetricsRef.current.startTouchY;
      return Math.abs(dx) > 6 || Math.abs(dy) > 6;
    }
    return false;
  }

  function handleResponderGrant(evt: GestureResponderEvent) {
    const metrics = gestureMetricsRef.current;
    metrics.grantPanX = metrics.currentPanX;
    metrics.grantPanY = metrics.currentPanY;
    panAnim.setOffset({ x: metrics.currentPanX, y: metrics.currentPanY });
    panAnim.setValue({ x: 0, y: 0 });

    if (evt.nativeEvent.touches.length >= 2) {
      const [t0, t1] = evt.nativeEvent.touches;
      metrics.initialPinchDist = Math.hypot(
        t0.pageX - t1.pageX,
        t0.pageY - t1.pageY
      );
      metrics.initialPinchScale = metrics.currentScale;
    } else {
      metrics.initialPinchDist = null;
      metrics.startTouchX = evt.nativeEvent.pageX;
      metrics.startTouchY = evt.nativeEvent.pageY;
    }
  }

  function handleResponderMove(evt: GestureResponderEvent) {
    const metrics = gestureMetricsRef.current;
    if (evt.nativeEvent.touches.length >= 2) {
      const [t0, t1] = evt.nativeEvent.touches;
      const dist = Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY);
      if (metrics.initialPinchDist && metrics.initialPinchDist > 0) {
        const ratio = dist / metrics.initialPinchDist;
        const targetScale = Math.max(
          0.85,
          Math.min(4.5, metrics.initialPinchScale * ratio)
        );
        scaleAnim.setValue(targetScale);
        metrics.currentScale = targetScale;
        setZoomDisplay(Math.round(targetScale * 10) / 10);
      }
    } else if (metrics.currentScale > 1.02) {
      const dx = evt.nativeEvent.pageX - metrics.startTouchX;
      const dy = evt.nativeEvent.pageY - metrics.startTouchY;
      panAnim.setValue({ x: dx, y: dy });
    }
  }

  function handleResponderRelease(evt: GestureResponderEvent) {
    panAnim.flattenOffset();
    const metrics = gestureMetricsRef.current;
    const wasPinch = metrics.initialPinchDist !== null;
    metrics.initialPinchDist = null;

    const dx = evt.nativeEvent.pageX - metrics.startTouchX;
    const dy = evt.nativeEvent.pageY - metrics.startTouchY;

    const totalX = wasPinch
      ? metrics.grantPanX
      : metrics.grantPanX + dx;
    const totalY = wasPinch
      ? metrics.grantPanY
      : metrics.grantPanY + dy;

    let targetScale = metrics.currentScale;
    if (targetScale < 1.0) {
      animateTo(1.0, 0, 0);
      return;
    }
    if (targetScale > 4.0) {
      targetScale = 4.0;
    }

    const bounds = getPanBounds(targetScale);
    const clampedX = Math.min(bounds.maxX, Math.max(bounds.minX, totalX));
    const clampedY = Math.min(bounds.maxY, Math.max(bounds.minY, totalY));
    animateTo(targetScale, clampedX, clampedY);
  }

  function handleResponderTerminate() {
    panAnim.flattenOffset();
    const metrics = gestureMetricsRef.current;
    metrics.initialPinchDist = null;
    const s = Math.max(1.0, Math.min(4.0, metrics.currentScale));
    const bounds = getPanBounds(s);
    const clampedX = Math.min(
      bounds.maxX,
      Math.max(bounds.minX, metrics.grantPanX)
    );
    const clampedY = Math.min(
      bounds.maxY,
      Math.max(bounds.minY, metrics.grantPanY)
    );
    animateTo(s, clampedX, clampedY);
  }

  function handleBackgroundTap() {
    const now = Date.now();
    if (now - gestureMetricsRef.current.lastTapTime < 300) {
      // Double tap detected
      if (gestureMetricsRef.current.currentScale > 1.1) {
        animateTo(1.0, 0, 0);
      } else {
        animateTo(2.5, 0, 0);
      }
      gestureMetricsRef.current.lastTapTime = 0;
    } else {
      gestureMetricsRef.current.lastTapTime = now;
    }
  }

  // Find the base face for each person
  const baseFacesByPerson = new Map<string, DetectedFace>();
  for (const face of Object.values(detectedFaces)) {
    if (face.photoId === basePhoto.id && face.personId) {
      baseFacesByPerson.set(face.personId, face);
    }
  }

  return (
    <View
      style={styles.container}
      onLayout={handleLayout}
      onStartShouldSetResponder={handleStartShouldSetResponder}
      onMoveShouldSetResponder={handleMoveShouldSetResponder}
      onResponderGrant={handleResponderGrant}
      onResponderMove={handleResponderMove}
      onResponderRelease={handleResponderRelease}
      onResponderTerminate={handleResponderTerminate}
    >
      {renderedWidth > 0 && (
        <Animated.View
          style={[
            styles.canvasStage,
            {
              width: renderedWidth,
              height: renderedHeight,
              left: offsetX,
              top: offsetY,
              transform: [
                { translateX: panAnim.x },
                { translateY: panAnim.y },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          <Pressable
            style={styles.imagePressable}
            onPress={handleBackgroundTap}
          >
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              contentFit="contain"
              transition={100}
              cachePolicy="memory-disk"
            />
          </Pressable>

          {/* Render face indicator rings only when outlines are visible and not in compare mode */}
          {showOutlines &&
            !isComparing &&
            persons.map((person) => {
              const baseFace = baseFacesByPerson.get(person.id);
              if (!baseFace) return null;

              const isActive = person.id === activePersonId;
              const hasActiveSwap = !!activeSwaps[person.id];

              const centerX =
                (baseFace.bounds.x + baseFace.bounds.width / 2) * renderedWidth;
              const centerY =
                (baseFace.bounds.y + baseFace.bounds.height / 2) *
                renderedHeight;

              const radius =
                Math.max(
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
        </Animated.View>
      )}

      {/* Floating Outline Toggle Pill on Top Right */}
      <TouchableOpacity
        style={[
          styles.floatingPill,
          styles.outlineTogglePill,
          !showOutlines && styles.outlineTogglePillOff,
        ]}
        onPress={onToggleOutlines}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={
          showOutlines ? "Hide face outlines" : "Show face outlines"
        }
      >
        <Text style={styles.floatingPillIcon}>
          {showOutlines ? "👁️" : "🙈"}
        </Text>
        <Text
          style={[
            styles.floatingPillText,
            !showOutlines && styles.floatingPillTextOff,
          ]}
        >
          {showOutlines ? "Outlines On" : "Outlines Hidden"}
        </Text>
      </TouchableOpacity>

      {/* Floating Zoom Level and Reset Pill on Top Left */}
      {zoomDisplay > 1.05 && (
        <TouchableOpacity
          style={[styles.floatingPill, styles.zoomResetPill]}
          onPress={() => animateTo(1.0, 0, 0)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Reset zoom to 1.0x"
        >
          <Text style={styles.floatingPillIcon}>🔍</Text>
          <Text style={styles.floatingPillText}>
            {zoomDisplay.toFixed(1)}x · Reset
          </Text>
        </TouchableOpacity>
      )}
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
  canvasStage: {
    position: "absolute",
  },
  imagePressable: {
    width: "100%",
    height: "100%",
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
  floatingPill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  outlineTogglePill: {
    top: 14,
    right: 14,
    borderColor: "rgba(56, 189, 248, 0.4)",
  },
  outlineTogglePillOff: {
    borderColor: "rgba(148, 163, 184, 0.25)",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
  },
  zoomResetPill: {
    top: 14,
    left: 14,
    borderColor: "rgba(251, 191, 36, 0.45)",
  },
  floatingPillIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  floatingPillText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "600",
  },
  floatingPillTextOff: {
    color: "#94a3b8",
  },
});
