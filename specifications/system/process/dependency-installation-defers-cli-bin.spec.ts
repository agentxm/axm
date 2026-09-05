import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/dependency-installation-defers-cli-bin",
  title: "Dependency installation defers the compiled CLI bin to package creation",
  statement:
    "Workspace dependency installation shall not advertise the unbuilt CLI executable for bin linking, while release package creation shall expose axm at its compiled entry point.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process", "trustworthy-distribution"],
  boundary: "repository",
  boundaryRationale:
    "The source and publication manifest fields establish when the executable is advertised; actual clean-install and packed-artifact checks provide additional release evidence.",
  methods: ["static"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["The pinned pnpm package manager applies publishConfig.bin during packing."],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("CLI package bin ownership", () => {
  it.effect("defers the compiled executable mapping to publication", () =>
    Effect.sync(() => {
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(repoRoot, "packages/cli/package.json"), "utf8"),
      );
      expect(manifest).not.toHaveProperty("bin");
      expect(manifest).toHaveProperty("publishConfig.bin.axm", "./dist/src/main.js");
      expect(manifest).toHaveProperty("files", expect.arrayContaining(["dist/src/"]));
    }),
  );
});
