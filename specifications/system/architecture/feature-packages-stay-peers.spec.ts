import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import {
  defineBoundEvidence,
  defineSpecification,
} from "@agentxm/extension-model/unstable/specifications";

import { readProductionPackages } from "../../support/production-packages.js";

export const specification = defineSpecification({
  requirement: "system/architecture/feature-packages-stay-peers",
  title: "Feature packages stay peers and never depend on one another",
  statement:
    "No feature package shall declare a dependency on another feature package, so that features remain peers composed only from kernel, integration, and contract packages.",
  class: "constraint",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed package manifests and project declarations show which packages are features and which production packages each feature depends on.",
  methods: ["contract"],
  derivedFrom: ["system/architecture/package-dependencies-point-inward"],
  supersedes: [],
  assumptions: [
    "Package manifests declare every production dependency; the manifest-fidelity lint gate bound as evidence keeps them truthful.",
    "The module-boundary lint gate runs on every change through the required aggregate check.",
  ],
  openQuestions: [],
});

/**
 * The module-boundary lint gate rejects feature-to-feature workspace imports
 * across every production project on every change. Its result is evidence
 * bound to this identity; the specification remains the sole requirements
 * authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "lint: @nx/enforce-module-boundaries",
    verifies:
      "Rejects any workspace import from one feature package into another feature package on every change.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const FEATURE_LEVEL = "feature";

describe("Feature packages stay peers", () => {
  it.effect("no feature package depends on another feature package", () =>
    Effect.sync(() => {
      const packages = readProductionPackages(repoRoot);
      const features = packages.filter((entry) => entry.levels.includes(FEATURE_LEVEL));
      expect(features.length).toBeGreaterThan(0);
      const featureNames = new Set(features.map((entry) => entry.name));
      const featureToFeature = features.flatMap((entry) =>
        entry.dependencies
          .filter((dependency) => featureNames.has(dependency))
          .map((dependency) => `${entry.name} -> ${dependency}`),
      );
      expect(featureToFeature).toEqual([]);
    }),
  );
});
