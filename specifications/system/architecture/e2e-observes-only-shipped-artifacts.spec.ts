import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/architecture/e2e-observes-only-shipped-artifacts",
  title: "End-to-end suites reach the product only as a shipped artifact, never as imported code",
  class: "architecture",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  methods: ["contract"],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const E2E_PROJECT_ROOTS = ["packages/cli-e2e", "packages/e2e-utils"] as const;
const FORBIDDEN_PACKAGE_NAMES = [
  "@agentxm/agent-integration",
  "@agentxm/extension-model",
  "@agentxm/registry-client",
  "@agentxm/registry-protocol",
  "@agentxm/extension-management",
  "@agentxm/extension-workspace",
  "@agentxm/workspace-operations",
  "@agentxm/workspace-state",
  "axm.sh",
] as const;
const FORBIDDEN_PROJECT_ROOTS = [
  "packages/agent-integration",
  "packages/extension-model",
  "packages/registry-client",
  "packages/registry-protocol",
  "packages/extension-management",
  "packages/extension-workspace",
  "packages/workspace-operations",
  "packages/workspace-state",
  "packages/cli",
] as const;
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

describe("End-to-end boundary", () => {
  it.effect.each([...E2E_PROJECT_ROOTS].map((projectRoot) => ({ projectRoot })))(
    "$projectRoot declares no dependency on product source packages",
    ({ projectRoot }) =>
      Effect.sync(() => {
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
            expect(FORBIDDEN_PACKAGE_NAMES).not.toContain(name);
          }
        }
      }),
  );

  it.effect.each([...E2E_PROJECT_ROOTS].map((projectRoot) => ({ projectRoot })))(
    "$projectRoot references no product source project from its TypeScript configuration",
    ({ projectRoot }) =>
      Effect.sync(() => {
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
            for (const forbidden of FORBIDDEN_PROJECT_ROOTS) {
              expect(resolved === forbidden || resolved.startsWith(`${forbidden}/`)).toBe(false);
            }
          }
        }
      }),
  );
});
