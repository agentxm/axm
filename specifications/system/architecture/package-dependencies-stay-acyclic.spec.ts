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
  requirement: "system/architecture/package-dependencies-stay-acyclic",
  title: "Production package dependencies never form a cycle",
  statement:
    "The dependencies declared between production packages shall never form a cycle, so that every production package can be built and released before the packages that depend on it.",
  class: "constraint",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed package manifests show which production packages each production package depends on, so a dependency cycle is observable there and nowhere in memory.",
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
 * The module-boundary lint gate detects circular workspace imports across
 * every production project on every change. Its result is evidence bound to
 * this identity; the specification remains the sole requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "lint: @nx/enforce-module-boundaries",
    verifies:
      "Rejects circular workspace imports across every production project on every change, with no ignored project pairs and no self-dependency allowance.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

/**
 * Walks the declared dependency graph depth-first and renders every chain
 * that returns to a package already on the current path.
 */
const findDependencyCycles = (
  dependencies: ReadonlyMap<string, ReadonlyArray<string>>,
): ReadonlyArray<string> => {
  const cycles: string[] = [];
  const finished = new Set<string>();
  const visit = (name: string, trail: ReadonlyArray<string>): void => {
    if (finished.has(name)) {
      return;
    }
    const position = trail.indexOf(name);
    if (position >= 0) {
      cycles.push([...trail.slice(position), name].join(" -> "));
      return;
    }
    for (const dependency of dependencies.get(name) ?? []) {
      visit(dependency, [...trail, name]);
    }
    finished.add(name);
  };
  for (const name of dependencies.keys()) {
    visit(name, []);
  }
  return cycles;
};

describe("Acyclic package dependencies", () => {
  it.effect("no chain of production package dependencies returns to its starting package", () =>
    Effect.sync(() => {
      const packages = readProductionPackages(repoRoot);
      expect(packages.length).toBeGreaterThan(0);
      const dependencies = new Map(packages.map((entry) => [entry.name, entry.dependencies]));
      expect(findDependencyCycles(dependencies)).toEqual([]);
    }),
  );
});
