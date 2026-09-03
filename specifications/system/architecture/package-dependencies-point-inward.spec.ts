import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import {
  defineBoundEvidence,
  defineSpecification,
} from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification({
  requirement: "system/architecture/package-dependencies-point-inward",
  title: "Production package dependencies point inward, stay acyclic, and keep features isolated",
  statement:
    "Production package dependencies shall point only inward from the application through feature, kernel, integration, and contract levels, shall never form a cycle, and no feature package shall depend on another feature package.",
  class: "constraint",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed Nx and lint configuration shows that the module-boundary and manifest-fidelity gates are armed with the intended level constraints and cycle detection.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The module-boundary and manifest-fidelity lint gates run on every change through the required aggregate check.",
  ],
  openQuestions: [],
});

/**
 * The Nx project graph and the module-boundary lint gate verify this
 * requirement across every production project on every change. Their results
 * are evidence bound to this identity; the specification remains the sole
 * requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "lint: @nx/enforce-module-boundaries",
    verifies:
      "Rejects outward or feature-to-feature workspace imports, undeclared transitive dependencies, external imports outside a constrained package's budget, and dependency cycles across every production project.",
  },
  {
    gate: "lint: @nx/dependency-checks",
    verifies:
      "Keeps each buildable package manifest aligned with its actual imports so the graph Nx derives is truthful.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const readRepoFile = (relativePath: string): string =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

/**
 * Extracts the `onlyDependOnLibsWithTags` list of one `sourceTag` constraint
 * from the flat ESLint configuration without re-stating the whole matrix.
 */
const constraintAllowList = (configText: string, sourceTag: string): ReadonlyArray<string> => {
  const constraintPattern = new RegExp(
    `sourceTag:\\s*"${sourceTag}"[^}]*?onlyDependOnLibsWithTags:\\s*\\[([^\\]]*)\\]`,
    "s",
  );
  const match = constraintPattern.exec(configText);
  if (match?.[1] === undefined) {
    return [];
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1] ?? "");
};

describe("Inward, acyclic package dependencies with feature isolation", () => {
  // The obligation covers dependency direction across the application,
  // feature, kernel, integration, and contract levels; feature packages stay
  // peers, and no feature executes another feature's plans. Nx configuration
  // is the implementation policy; this projection asserts the gates that
  // supply the decisive verification remain armed rather than duplicating the
  // derived dependency graph as a second normative table.
  it.effect("the module-boundary gate stays registered for every project", () =>
    Effect.sync(() => {
      const nxConfig = readRepoFile("nx.json");
      expect(nxConfig).toContain("@nx/eslint/plugin");
      const eslintConfig = readRepoFile("eslint.config.mjs");
      expect(eslintConfig).toContain("@nx/enforce-module-boundaries");
      expect(eslintConfig).toContain("banTransitiveDependencies: true");
      expect(eslintConfig).toContain("@nx/dependency-checks");
    }),
  );

  it.effect("dependencies may point only inward and never back toward the application", () =>
    Effect.sync(() => {
      const eslintConfig = readRepoFile("eslint.config.mjs");
      expect(constraintAllowList(eslintConfig, "layer:app")).toEqual([
        "layer:feature",
        "layer:kernel",
        "layer:integration",
        "layer:contract",
      ]);
      expect(constraintAllowList(eslintConfig, "layer:kernel")).toEqual([
        "layer:kernel",
        "layer:contract",
      ]);
      expect(constraintAllowList(eslintConfig, "layer:integration")).toEqual([
        "layer:integration",
        "layer:contract",
      ]);
      expect(constraintAllowList(eslintConfig, "layer:contract")).toEqual(["layer:contract"]);
    }),
  );

  it.effect("a feature may depend on lower levels but never on another feature", () =>
    Effect.sync(() => {
      const eslintConfig = readRepoFile("eslint.config.mjs");
      const featureAllowList = constraintAllowList(eslintConfig, "layer:feature");
      expect(featureAllowList).toEqual(["layer:kernel", "layer:integration", "layer:contract"]);
      expect(featureAllowList).not.toContain("layer:feature");
    }),
  );

  it.effect("cycle detection stays enabled without ignored project pairs", () =>
    Effect.sync(() => {
      const eslintConfig = readRepoFile("eslint.config.mjs");
      expect(eslintConfig).not.toContain("ignoredCircularDependencies");
      expect(eslintConfig).not.toContain("allowCircularSelfDependency");
    }),
  );
});
