// TODO: (#51) Uses node:fs/node:path directly. Migrate to @effect/platform
// test utilities when available.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "@effect/vitest";

import { AXM_SKILL_JSON, AXM_SKILL_MD } from "./bundled-axm-skill.js";

describe("bundled AXM skill", () => {
  it("matches the canonical workspace files", () => {
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const repoRoot = path.resolve(testDir, "../../../../../");

    expect(
      fs.readFileSync(
        path.join(repoRoot, ".axm", "extensions", "@agentxm", "skills", "axm", "skill.json"),
        "utf-8",
      ),
    ).toBe(AXM_SKILL_JSON);
    expect(
      fs.readFileSync(
        path.join(repoRoot, ".axm", "extensions", "@agentxm", "skills", "axm", "src", "SKILL.md"),
        "utf-8",
      ),
    ).toBe(AXM_SKILL_MD);
  });
});
