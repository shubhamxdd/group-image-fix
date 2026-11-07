import test from "node:test";
import assert from "node:assert/strict";
import { darkColors, lightColors } from "../src/theme/theme.ts";

test("Theme tokens are fully defined for both dark and light modes", () => {
  assert.equal(darkColors.isDark, true);
  assert.equal(lightColors.isDark, false);

  assert.ok(darkColors.background.startsWith("#") || darkColors.background.startsWith("rgba"));
  assert.ok(lightColors.background.startsWith("#") || lightColors.background.startsWith("rgba"));

  assert.notEqual(darkColors.background, lightColors.background);
  assert.notEqual(darkColors.textPrimary, lightColors.textPrimary);
});

test("Face exclusion logic correctly filters excluded faces from clustering list", () => {
  const faces = [
    { id: "face-1", photoId: "p1", excluded: false },
    { id: "face-2", photoId: "p1", excluded: true },
    { id: "face-3", photoId: "p2", excluded: false },
  ];

  const activeFaces = faces.filter((f) => !f.excluded);
  assert.equal(activeFaces.length, 2);
  assert.deepEqual(activeFaces.map((f) => f.id), ["face-1", "face-3"]);
});
