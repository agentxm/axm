import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineBoundEvidence, defineSpecification } from "@agentxm/specification-metadata";

import { readProductionPackages } from "../../support/production-packages.js";

export const specification = defineSpecification({
  requirement: "system/architecture/e2e-observes-only-shipped-artifacts",
  title: "End-to-end suites reach the product only as a shipped artifact, never as imported code",
  statement:
    "End-to-end test projects shall exercise AXM only through its shipped artifacts and shall not declare a dependency on, or a project reference to, any product source package.",
  class: "process",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed package manifests and TypeScript project references of the end-to-end projects show whether they reach product source directly.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "The module-boundary lint gate declared as bound evidence runs on every change through the required aggregate check.",
  ],
  openQuestions: [],
});

/**
 * The module-boundary lint gate is the decisive verification for imports the
 * committed manifests and project references cannot show: relative imports
 * that cross a project root. Its result is evidence bound to this identity;
 * the specification remains the sole requirements authority.
 */
export const boundEvidence = defineBoundEvidence([
  {
    gate: "lint: @nx/enforce-module-boundaries",
    verifies:
      "Rejects workspace imports from end-to-end and test-support projects into product source packages, and relative imports that cross a project root, leaving the built CLI output path as the only sanctioned way to reach the shipped surface.",
  },
]);

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const E2E_PROJECT_ROOTS = ["apps/cli-e2e", "tools/e2e-utils"] as const;
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const readJson = (filePath: string): unknown => JSON.parse(fs.readFileSync(filePath, "utf8"));

const listTsconfigs = (directory: string): string[] => {
  const collected: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "out-tsc") {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collected.push(...listTsconfigs(entryPath));
    } else if (/^tsconfig.*\.json$/.test(entry.name)) {
      collected.push(entryPath);
    }
  }
  return collected;
};

/*
 * The forbidden packages and project roots are read from what the repository
 * declares: a production package is a workspace package whose project carries
 * a runtime `role:*` tag, so end-to-end and engineering-support projects are
 * excluded. The requirement names *any* product source package, and a roster
 * kept in this file would silently stop covering the packages it never learned
 * about as one is added, renamed, split, or retired.
 */
describe("End-to-end boundary", () => {
  it.effect.each([...E2E_PROJECT_ROOTS].map((projectRoot) => ({ projectRoot })))(
    "$projectRoot declares no dependency on product source packages",
    ({ projectRoot }) =>
      Effect.sync(() => {
        const packages = readProductionPackages(repoRoot);
        expect(packages.length).toBeGreaterThan(0);
        const forbiddenPackageNames = packages.map((entry) => entry.name);
        const manifest = readJson(path.join(repoRoot, projectRoot, "package.json"));
        if (typeof manifest !== "object" || manifest === null) {
          throw new Error(`${projectRoot}/package.json must be an object`);
        }
        const record: Partial<Record<string, unknown>> = { ...manifest };
        for (const field of DEPENDENCY_FIELDS) {
          const dependencies = record[field];
          if (typeof dependencies !== "object" || dependencies === null) {
            continue;
          }
          for (const name of Object.keys(dependencies)) {
            expect(forbiddenPackageNames, `${projectRoot} ${field}`).not.toContain(name);
          }
        }
      }),
  );

  it.effect.each([...E2E_PROJECT_ROOTS].map((projectRoot) => ({ projectRoot })))(
    "$projectRoot references no product source project from its TypeScript configuration",
    ({ projectRoot }) =>
      Effect.sync(() => {
        const packages = readProductionPackages(repoRoot);
        expect(packages.length).toBeGreaterThan(0);
        const forbiddenProjectRoots = packages.map((entry) => entry.directory);
        for (const tsconfigPath of listTsconfigs(path.join(repoRoot, projectRoot))) {
          const tsconfig = readJson(tsconfigPath);
          if (typeof tsconfig !== "object" || tsconfig === null) {
            continue;
          }
          const references: unknown = "references" in tsconfig ? tsconfig.references : undefined;
          if (!Array.isArray(references)) {
            continue;
          }
          for (const reference of references) {
            if (typeof reference !== "object" || reference === null || !("path" in reference)) {
              continue;
            }
            const referencePath = reference.path;
            if (typeof referencePath !== "string") {
              continue;
            }
            const resolved = path
              .relative(repoRoot, path.resolve(path.dirname(tsconfigPath), referencePath))
              .split(path.sep)
              .join("/");
            for (const forbidden of forbiddenProjectRoots) {
              expect(
                resolved === forbidden || resolved.startsWith(`${forbidden}/`),
                `${tsconfigPath} -> ${resolved}`,
              ).toBe(false);
            }
          }
        }
      }),
  );
});
