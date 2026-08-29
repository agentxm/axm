import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/process/pre-launch-changes-stay-coherent",
  title: "Pre-launch contract changes land as one coherent break without compatibility paths",
  class: "process",
  intents: ["dependable-change-process"],
  boundary: "repository",
  methods: ["contract"],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

describe("Pre-launch change policy", () => {
  it.effect("repository instructions bind every change to the clean-break policy", () =>
    Effect.sync(() => {
      // The obligation is review-enforced; its executable projection is that
      // the policy remains declared where every change is instructed from.
      const instructions = fs
        .readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8")
        .replace(/\s+/g, " ");
      expect(instructions).toContain("Pre-launch backward compatibility");
      expect(instructions).toContain(
        "backward compatibility is out of scope unless the task explicitly requires it",
      );
      expect(instructions).toContain("Do not add shims");
    }),
  );
});
