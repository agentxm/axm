import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "cli/upgrade/installer-availability-gates-mutation",
  title: "Installer availability gates upgrade mutation",
  statement:
    "Before mutating an npm-, pnpm-, Yarn-, or Homebrew-owned installation, upgrade shall establish that the selected stable version is available through that installer; lagging, leading, unavailable, or indeterminate publication state shall leave the installation unchanged and report recovery guidance.",
  class: "constraint",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  boundary: "repository",
  boundaryRationale:
    "The committed upgrade orchestration shows that the availability decision precedes and gates every manager-owned mutation branch.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Installer availability gate", () => {
  it.effect("checks manager publication before selecting the mutation branch", () =>
    Effect.sync(() => {
      const source = fs.readFileSync(
        path.join(repoRoot, "packages", "cli", "src", "root", "upgrade", "handler.ts"),
        "utf8",
      );
      const availability = source.indexOf("const availability: InstallerAvailability");
      const actionGate = source.indexOf('availability.state !== "ready"');
      const mutation = source.indexOf('case "mutate":', actionGate);
      expect(availability).toBeGreaterThan(0);
      expect(actionGate).toBeGreaterThan(availability);
      expect(mutation).toBeGreaterThan(actionGate);
    }),
  );
});
