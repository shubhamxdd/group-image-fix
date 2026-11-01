import React from "react";
import { StyleSheet, Text, Pressable, View } from "react-native";

interface CompareButtonProps {
  isComparing: boolean;
  onCompareStart: () => void;
  onCompareEnd: () => void;
  disabled?: boolean;
}

export function CompareButton({
  isComparing,
  onCompareStart,
  onCompareEnd,
  disabled = false,
}: CompareButtonProps) {
  return (
    <Pressable
      onPressIn={onCompareStart}
      onPressOut={onCompareEnd}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        (pressed || isComparing) && styles.buttonActive,
        disabled && styles.buttonDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Hold to compare composite with original photo"
      accessibilityState={{ selected: isComparing, disabled }}
    >
      <View style={styles.contentRow}>
        <Text style={styles.icon}>{isComparing ? "👁️" : "👀"}</Text>
        <Text
          style={[
            styles.label,
            (isComparing) && styles.labelActive,
            disabled && styles.labelDisabled,
          ]}
        >
          {isComparing ? "Showing Original" : "Hold to Compare"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.25)",
  },
  buttonActive: {
    backgroundColor: "rgba(245, 158, 11, 0.25)",
    borderColor: "#f59e0b",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  icon: {
    fontSize: 14,
  },
  label: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "600",
  },
  labelActive: {
    color: "#fbbf24",
  },
  labelDisabled: {
    color: "#64748b",
  },
});
