import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useTheme } from "../store/themeStore";

export default function RootLayout() {
  const { colors } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: "Group Photo Fixer",
            headerStyle: { backgroundColor: colors.headerBg },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: { fontWeight: "700" },
          }}
        />
        <Stack.Screen
          name="editor"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
