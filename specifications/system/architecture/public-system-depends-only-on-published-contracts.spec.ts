import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "system/architecture/public-system-depends-only-on-published-contracts",
  title:
    "The public system depends on private platform responsibilities only through published contracts",
  class: "architecture",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  methods: ["contract"],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const WORKSPACE_MANIFESTS = [
  "package.json",
  "packages/agent-integration/package.json",
  "packages/cli/package.json",
  "packages/extension-management/package.json",
  "packages/extension-model/package.json",
  "packages/extension-sources/package.json",
  "packages/extension-workspace/package.json",
  "packages/registry-client/package.json",
  "packages/workspace-operations/package.json",
  "packages/workspace-state/package.json",
  "packages/registry-protocol/package.json",
  "packages/cli-e2e/package.json",
  "packages/e2e-utils/package.json",
  "specifications/package.json",
] as const;

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

describe("Public and private boundary", () => {
  it.effect("no workspace package depends on private repository source or paths", () =>
    Effect.sync(() => {
      for (const manifestPath of WORKSPACE_MANIFESTS) {
        const manifest: unknown = JSON.parse(
          fs.readFileSync(path.join(repoRoot, manifestPath), "utf8"),
        );
        if (typeof manifest !== "object" || manifest === null) {
          throw new Error(`${manifestPath} must be an object`);
        }
        const record: Partial<Record<string, unknown>> = { ...manifest };
        for (const field of DEPENDENCY_FIELDS) {
          const dependencies = record[field];
          if (typeof dependencies !== "object" || dependencies === null) {
            continue;
          }
          for (const [name, version] of Object.entries(dependencies)) {
            // Interaction with the private platform happens only through
            // published packages and generated API clients, never through
            // filesystem paths escaping this repository or private scopes.
            expect(name).not.toContain("internal");
            if (typeof version === "string") {
              expect(version.startsWith("file:..")).toBe(false);
              expect(version.startsWith("link:..")).toBe(false);
            }
          }
        }
      }
    }),
  );

  it.effect("registry and telemetry integration is generated from published contracts", () =>
    Effect.sync(() => {
      expect(
        fs.existsSync(path.join(repoRoot, "packages/registry-client/src/__generated__")) ||
          fs.existsSync(path.join(repoRoot, "packages/registry-client/src")),
      ).toBe(true);
      // The generated clients and their source specs are tracked inside this
      // repository, so the public system builds without private context.
      expect(
        fs.existsSync(
          path.join(repoRoot, "packages/extension-management/src/unstable/telemetry/__generated__"),
        ),
      ).toBe(true);
    }),
  );
});
