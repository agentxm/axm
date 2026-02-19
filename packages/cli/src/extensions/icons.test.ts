import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXTENSION_TYPE_ICON_PATHS } from "./icons.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const extensionTypes = ["skill", "command", "pack", "mcp-server"] as const;

describe("EXTENSION_TYPE_ICON_PATHS", () => {
  it("has an icon path for every extension type", () => {
    expect(Object.keys(EXTENSION_TYPE_ICON_PATHS).sort()).toEqual([...extensionTypes].sort());
  });

  it("references icon files that exist", () => {
    for (const [extensionType, relativePath] of Object.entries(EXTENSION_TYPE_ICON_PATHS)) {
      const iconPath = path.resolve(currentDir, relativePath);
      expect(
        fs.existsSync(iconPath),
        `Missing icon file for ${extensionType}: ${relativePath}`,
      ).toBe(true);
    }
  });
});
