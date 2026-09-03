import * as fs from "node:fs";
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
  requirement: "system/architecture/package-dependencies-point-inward",
  title: "Production package dependencies point inward from the application",
  statement:
    "Every dependency between production packages shall point inward, from the application through the feature level and the peer kernel and integration levels to the contract level, and shall never point toward a level nearer the application.",
  class: "constraint",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed package manifests and project declarations show which production packages exist, which level each declares, and which production packages each depends on.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Package manifests declare every production dependency; the manifest-fidelity lint gate bound as evidence keeps them truthful.",
    "The module-boundary and manifest-fidelity lint gates run on every change through the required aggregate check.",
  ],
  openQuestions: [],
});

/**
 * The module-boundary lint gate is the decisive per-change verification of
 * dependency direction across every production project, and the
 * manifest-fidelity gate keeps the manifests this specification observes
 * truthful. Their results are evidence bound to this identity; the
 * specification remains the sole requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "lint: @nx/enforce-module-boundaries",
    verifies:
      "Rejects any workspace import from a production package toward a level nearer the application, and any undeclared transitive dependency, on every change.",
  },
  {
    gate: "lint: @nx/dependency-checks",
    verifies:
      "Keeps each production package manifest aligned with its actual imports so the dependency structure this specification observes is truthful.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

/**
 * Dependency levels by distance from the application: the application is the
 * outermost level, contracts are the innermost, and kernels and integrations
 * are peers. A dependency points inward when its target is at least as far
 * from the application as its source.
 */
const LEVEL_DEPTH = {
  app: 0,
  feature: 1,
  kernel: 2,
  integration: 2,
  contract: 3,
} as const;

const isKnownLevel = (level: string): level is keyof typeof LEVEL_DEPTH =>
  Object.hasOwn(LEVEL_DEPTH, level);

const depthByPackage = (): ReadonlyMap<string, number> =>
  new Map(
    readProductionPackages(repoRoot).map((entry) => {
      const level = entry.levels[0];
      if (level === undefined || !isKnownLevel(level)) {
        throw new Error(`${entry.name} declares no known dependency level`);
      }
      return [entry.name, LEVEL_DEPTH[level]];
    }),
  );

describe("Inward package dependencies", () => {
  it.effect("every production package declares exactly one known dependency level", () =>
    Effect.sync(() => {
      const packages = readProductionPackages(repoRoot);
      expect(packages.length).toBeGreaterThan(0);
      for (const entry of packages) {
        expect(entry.levels, entry.name).toHaveLength(1);
        expect(Object.keys(LEVEL_DEPTH), entry.name).toContain(entry.levels[0]);
      }
    }),
  );

  it.effect("no production package depends on a package at a level nearer the application", () =>
    Effect.sync(() => {
      const depth = depthByPackage();
      const outward = readProductionPackages(repoRoot).flatMap((entry) =>
        entry.dependencies
          .filter((dependency) => (depth.get(dependency) ?? 0) < (depth.get(entry.name) ?? 0))
          .map((dependency) => `${entry.name} -> ${dependency}`),
      );
      expect(outward).toEqual([]);
    }),
  );

  it.effect("the module-boundary gate stays armed for every project", () =>
    Effect.sync(() => {
      const nxConfig: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, "nx.json"), "utf8"));
      if (typeof nxConfig !== "object" || nxConfig === null || !("plugins" in nxConfig)) {
        throw new Error("nx.json must register plugins");
      }
      const registeredPlugins = Array.isArray(nxConfig.plugins)
        ? nxConfig.plugins.flatMap((entry: unknown) => {
            if (typeof entry !== "object" || entry === null || !("plugin" in entry)) {
              return [];
            }
            return typeof entry.plugin === "string" ? [entry.plugin] : [];
          })
        : [];
      // The inferred lint task reaches every project, and the boundary and
      // manifest-fidelity rules are registered in the shared configuration.
      expect(registeredPlugins).toContain("@nx/eslint/plugin");
      const eslintConfig = fs.readFileSync(path.join(repoRoot, "eslint.config.mjs"), "utf8");
      expect(eslintConfig).toContain("@nx/enforce-module-boundaries");
      expect(eslintConfig).toContain("@nx/dependency-checks");
    }),
  );
});
