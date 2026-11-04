import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: "Group Photo Fixer",
            headerStyle: { backgroundColor: "#0f172a" },
            headerTintColor: "#ffffff",
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
