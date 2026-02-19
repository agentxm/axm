import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AGENT_ICON_PATHS } from "./icons.js";
import { getAgentIds } from "./registry.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

describe("AGENT_ICON_PATHS", () => {
  it("has an icon path for every registered agent", () => {
    const agentIds = getAgentIds();
    expect(Object.keys(AGENT_ICON_PATHS).sort()).toEqual([...agentIds].sort());
  });

  it("references icon files that exist", () => {
    for (const [agentId, relativePath] of Object.entries(AGENT_ICON_PATHS)) {
      const iconPath = path.resolve(currentDir, relativePath);
      expect(fs.existsSync(iconPath), `Missing icon file for ${agentId}: ${relativePath}`).toBe(
        true,
      );
    }
  });
});
