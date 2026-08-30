import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/architecture/packages-follow-permitted-dependency-graph",
  title: "Workspace packages depend on each other only along the permitted dependency graph",
  class: "architecture",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  methods: ["contract"],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

/**
 * The permitted dependency graph between the product packages. Dependencies
 * point strictly inward: the shared extension model depends on nothing, the
 * Registry protocol depends only on the model, extension management depends on
 * both, and the CLI application composes all three.
 */
const PERMITTED_PRODUCT_DEPENDENCIES: Record<string, ReadonlyArray<string>> = {
  "packages/extension-model/package.json": [],
  "packages/registry-protocol/package.json": ["@agentxm/extension-model"],
  "packages/extension-management/package.json": [
    "@agentxm/extension-model",
    "@agentxm/registry-protocol",
  ],
  "packages/cli/package.json": [
    "@agentxm/extension-model",
    "@agentxm/registry-protocol",
    "@agentxm/extension-management",
  ],
};

const PRODUCT_PACKAGE_NAMES = [
  "@agentxm/extension-model",
  "@agentxm/registry-protocol",
  "@agentxm/extension-management",
  "axm.sh",
] as const;

/**
 * The shared-kernel dependency budget: `@agentxm/extension-model` stays
 * platform-neutral and dependency-light. Adding a runtime dependency here is
 * an architecture decision, not a convenience.
 */
const EXTENSION_MODEL_DEPENDENCY_BUDGET = [
  "effect",
  "packageurl-js",
  "semver",
  "spdx-expression-parse",
] as const;

const readManifest = (manifestPath: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, manifestPath), "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${manifestPath} must be an object`);
  }
  return { ...parsed };
};

const runtimeDependencies = (manifest: Record<string, unknown>): ReadonlyArray<string> => {
  const dependencies = manifest["dependencies"];
  if (typeof dependencies !== "object" || dependencies === null) {
    return [];
  }
  return Object.keys(dependencies);
};

describe("Permitted package dependency graph", () => {
  it.effect("product packages declare only permitted product dependencies", () =>
    Effect.sync(() => {
      for (const [manifestPath, permitted] of Object.entries(PERMITTED_PRODUCT_DEPENDENCIES)) {
        const names = runtimeDependencies(readManifest(manifestPath));
        const productDependencies = names.filter((name) =>
          PRODUCT_PACKAGE_NAMES.some((product) => product === name),
        );
        for (const name of productDependencies) {
          expect(permitted, `${manifestPath} must not depend on ${name}`).toContain(name);
        }
      }
    }),
  );

  it.effect("the shared extension model stays inside its dependency budget", () =>
    Effect.sync(() => {
      const names = runtimeDependencies(readManifest("packages/extension-model/package.json"));
      for (const name of names) {
        expect(
          EXTENSION_MODEL_DEPENDENCY_BUDGET,
          `packages/extension-model runtime dependency ${name} is outside the shared-kernel budget`,
        ).toContain(name);
      }
    }),
  );
});
