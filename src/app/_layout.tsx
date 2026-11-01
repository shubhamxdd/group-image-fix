import { Stack } from "expo-router";

export default function RootLayout() {
  return (
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
  );
}
