import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import YAML from "yaml";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/process/dual-typescript-alias-retained",
  title: "The dual TypeScript alias stays in place until its recorded exit condition",
  statement:
    "Until the recorded TypeScript 7.1 exit condition is met, the workspace shall resolve tsc to native TypeScript 7 and shall keep the typescript package resolving to the TypeScript 6 compatibility package.",
  class: "constraint",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed workspace catalog in pnpm-workspace.yaml shows which packages the two TypeScript aliases resolve to.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The evidence establishes only that the committed workspace catalog declares the two aliases; it cannot observe whether the exit condition recorded in the dual TypeScript alias decision (docs/architecture/decisions/typescript-dual-alias.md) has been reached.",
      retirementCondition:
        "TypeScript 7.1 or a later release removes the need for the compatibility split, the dual TypeScript alias decision record is superseded, and the workspace collapses to a single TypeScript dependency, retiring this constraint in the same change.",
    },
  ],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Dual TypeScript alias", () => {
  it.effect(
    "the workspace catalog aliases native TypeScript 7 and the TypeScript 6 compatibility package",
    () =>
      Effect.sync(() => {
        const workspace: unknown = YAML.parse(
          fs.readFileSync(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8"),
        );
        if (typeof workspace !== "object" || workspace === null || !("catalog" in workspace)) {
          throw new Error("pnpm-workspace.yaml must declare a catalog");
        }
        const catalog = workspace.catalog;
        if (typeof catalog !== "object" || catalog === null) {
          throw new Error("catalog must be an object");
        }
        const entries: Partial<Record<string, unknown>> = { ...catalog };

        // `tsc` is the native TypeScript 7 compiler.
        expect(entries["@typescript/native"]).toMatch(/^npm:typescript@\^7\./);
        // `require("typescript")` resolves to the TypeScript 6 compatibility
        // package until the recorded TypeScript 7.1 exit condition is met.
        expect(entries["typescript"]).toMatch(/^npm:@typescript\/typescript6@/);
      }),
  );
});
