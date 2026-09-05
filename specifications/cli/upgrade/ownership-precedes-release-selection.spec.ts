import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/upgrade/ownership-precedes-release-selection",
  title: "Upgrade establishes ownership before release selection",
  statement:
    "Upgrade shall identify the installation owner before performing canonical release selection so unresolved ownership fails without an unnecessary release-authority request and every later availability and mutation decision is installer-specific.",
  class: "constraint",
  role: "supporting",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  boundary: "repository",
  boundaryRationale:
    "The application orchestration order is the observable invariant: ownership detection must be composed before the latest or exact selection branch.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Upgrade orchestration order", () => {
  it.effect("detects and resolves ownership before entering release selection", () =>
    Effect.sync(() => {
      const source = fs.readFileSync(
        path.join(repoRoot, "packages", "cli", "src", "root", "upgrade", "handler.ts"),
        "utf8",
      );
      const handler = source.indexOf('export const handleUpgrade = Effect.fn("Upgrade.handle")');
      const detect = source.indexOf("installMethod.detect()", handler);
      const resolveOwnership = source.indexOf("resolveAmbiguousPackageManager", detect);
      const releaseSelection = source.indexOf("const resolution =", resolveOwnership);
      expect(handler).toBeGreaterThan(0);
      expect(detect).toBeGreaterThan(handler);
      expect(resolveOwnership).toBeGreaterThan(detect);
      expect(releaseSelection).toBeGreaterThan(resolveOwnership);
    }),
  );
});
