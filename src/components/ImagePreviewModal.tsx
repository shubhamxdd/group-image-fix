import React, { useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  GestureResponderEvent,
  StatusBar,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Photo } from "../types/session";
import { useTheme } from "../store/themeStore";

interface ImagePreviewModalProps {
  photo: Photo | null;
  photoIndex?: number;
  totalPhotos?: number;
  visible: boolean;
  onClose: () => void;
}

export function ImagePreviewModal({
  photo,
  photoIndex,
  totalPhotos,
  visible,
  onClose,
}: ImagePreviewModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [zoomDisplay, setZoomDisplay] = useState<number>(1.0);

  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [panAnim] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));

  const gestureMetricsRef = useRef({
    currentScale: 1,
    currentPanX: 0,
    currentPanY: 0,
    startTouchX: 0,
    startTouchY: 0,
    grantPanX: 0,
    grantPanY: 0,
    initialPinchDist: null as number | null,
    initialPinchScale: 1,
    lastTapTime: 0,
  });

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

  const handleResetZoom = useCallback(() => {
    animateTo(1.0, 0, 0);
  }, [animateTo]);

  if (!visible || !photo) {
    return null;
  }

  // Calculate aspect-fit dimensions
  let renderedW = 0;
  let renderedH = 0;
  if (containerSize && photo.width > 0 && photo.height > 0) {
    const scale = Math.min(
      containerSize.width / photo.width,
      containerSize.height / photo.height
    );
    renderedW = photo.width * scale;
    renderedH = photo.height * scale;
  }

  function handleStartShouldSetResponder() {
    return true;
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

      // Double tap detector
      const now = Date.now();
      if (now - metrics.lastTapTime < 280) {
        if (metrics.currentScale > 1.05) {
          animateTo(1.0, 0, 0);
        } else {
          animateTo(2.4, 0, 0);
        }
        metrics.lastTapTime = 0;
        return;
      }
      metrics.lastTapTime = now;
    }
  }

  function handleResponderMove(evt: GestureResponderEvent) {
    const metrics = gestureMetricsRef.current;

    // Pinch-to-zoom
    if (evt.nativeEvent.touches.length >= 2 && metrics.initialPinchDist) {
      const [t0, t1] = evt.nativeEvent.touches;
      const dist = Math.hypot(t0.pageX - t1.pageX, t0.pageY - t1.pageY);
      const factor = dist / metrics.initialPinchDist;
      let nextScale = metrics.initialPinchScale * factor;
      nextScale = Math.max(0.9, Math.min(5.0, nextScale));
      metrics.currentScale = nextScale;
      scaleAnim.setValue(nextScale);
      setZoomDisplay(Math.round(nextScale * 10) / 10);
      return;
    }

    // Pan
    if (evt.nativeEvent.touches.length === 1 && metrics.currentScale > 1.02) {
      const dx = evt.nativeEvent.pageX - metrics.startTouchX;
      const dy = evt.nativeEvent.pageY - metrics.startTouchY;

      if (containerSize && renderedW > 0) {
        const scaledW = renderedW * metrics.currentScale;
        const scaledH = renderedH * metrics.currentScale;
        const maxPanX = Math.max(0, (scaledW - containerSize.width) / 2);
        const maxPanY = Math.max(0, (scaledH - containerSize.height) / 2);
        const nextX = Math.max(-maxPanX, Math.min(maxPanX, metrics.grantPanX + dx));
        const nextY = Math.max(-maxPanY, Math.min(maxPanY, metrics.grantPanY + dy));
        panAnim.setValue({ x: nextX - metrics.grantPanX, y: nextY - metrics.grantPanY });
      }
    }
  }

  function handleResponderRelease() {
    panAnim.flattenOffset();
    const metrics = gestureMetricsRef.current;

    if (metrics.currentScale < 1.02) {
      animateTo(1.0, 0, 0);
    } else {
      setZoomDisplay(Math.round(metrics.currentScale * 10) / 10);
    }
  }

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
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: colors.surfaceElevated }]}
            onPress={onClose}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Text style={[styles.closeIcon, { color: colors.textPrimary }]}>✕</Text>
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              {photoIndex !== undefined && totalPhotos !== undefined
                ? `Photo ${photoIndex + 1} of ${totalPhotos}`
                : "Photo Full Preview"}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {photo.width} × {photo.height} original resolution
            </Text>
          </View>

          {zoomDisplay > 1.05 ? (
            <TouchableOpacity
              style={[styles.resetButton, { backgroundColor: colors.accent }]}
              onPress={handleResetZoom}
              activeOpacity={0.8}
            >
              <Text style={styles.resetButtonText}>
                {zoomDisplay.toFixed(1)}x Reset
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        {/* Zoomable Canvas Stage */}
        <View
          style={styles.stage}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && height > 0) {
              setContainerSize({ width, height });
            }
          }}
          onStartShouldSetResponder={handleStartShouldSetResponder}
          onMoveShouldSetResponder={handleMoveShouldSetResponder}
          onResponderGrant={handleResponderGrant}
          onResponderMove={handleResponderMove}
          onResponderRelease={handleResponderRelease}
        >
          {containerSize && renderedW > 0 && renderedH > 0 && (
            <Animated.View
              style={[
                styles.imageStage,
                {
                  width: renderedW,
                  height: renderedH,
                  left: (containerSize.width - renderedW) / 2,
                  top: (containerSize.height - renderedH) / 2,
                  transform: [
                    { translateX: panAnim.x },
                    { translateY: panAnim.y },
                    { scale: scaleAnim },
                  ],
                },
              ]}
            >
              <Image
                source={{ uri: photo.originalUri || photo.proxyUri }}
                style={styles.fullImage}
                contentFit="contain"
                transition={150}
              />
            </Animated.View>
          )}

          {/* Floating Instructions Pill */}
          {zoomDisplay <= 1.05 && (
            <View
              style={[
                styles.floatingHint,
                {
                  backgroundColor: colors.pillBg,
                  borderColor: colors.pillBorder,
                },
              ]}
            >
              <Text style={[styles.floatingHintText, { color: colors.textSecondary }]}>
                Pinch or double tap to zoom anywhere
              </Text>
            </View>
          )}
        </View>
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
    zIndex: 10,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerInfo: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  headerSpacer: {
    width: 36,
  },
  resetButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  resetButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  stage: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  imageStage: {
    position: "absolute",
  },
  fullImage: {
    width: "100%",
    height: "100%",
  },
  floatingHint: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingHintText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
