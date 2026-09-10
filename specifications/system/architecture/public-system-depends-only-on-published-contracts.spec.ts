import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "system/architecture/public-system-depends-only-on-published-contracts",
  title:
    "The public system depends on private platform responsibilities only through published contracts",
  statement:
    "The public AXM system shall depend on private platform responsibilities only through published packages and through clients generated from contract documents tracked in this repository, and no workspace package shall reference a private package or a filesystem path outside the repository.",
  class: "constraint",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "repository",
  boundaryRationale:
    "Only the committed package manifests, the tracked contract documents, and the tracked generated clients show what the public system actually depends on.",
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const WORKSPACE_MANIFESTS = [
  "package.json",
  "packages/supporting/agent-integration/package.json",
  "apps/cli/package.json",
  "packages/core/extension-authoring/package.json",
  "packages/core/extension-discovery/package.json",
  "packages/core/extension-lifecycle/package.json",
  "packages/core/extension-model/package.json",
  "packages/core/extension-publish/package.json",
  "packages/supporting/extension-sources/package.json",
  "packages/core/extension-workspace/package.json",
  "packages/core/knowledge-query/package.json",
  "packages/supporting/registry-auth/package.json",
  "packages/supporting/registry-client/package.json",
  "packages/core/workspace-configuration/package.json",
  "packages/core/workspace-inspection/package.json",
  "packages/core/workspace-lint/package.json",
  "packages/core/workspace-operations/package.json",
  "packages/core/workspace-state/package.json",
  "packages/core/workspace-sync/package.json",
  "packages/core/registry-protocol/package.json",
  "apps/cli-e2e/package.json",
  "tools/e2e-utils/package.json",
  "specifications/package.json",
] as const;

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/**
 * Every private platform interaction reaches the public system through a
 * client generated from a contract document tracked in this repository.
 */
const GENERATED_CLIENTS = [
  {
    client: "registry",
    contract: "packages/supporting/registry-client/specs/registry-openapi.json",
    generated: "packages/supporting/registry-client/src/__generated__/registry-client.ts",
  },
  {
    client: "telemetry",
    contract: "apps/cli/specs/telemetry-openapi.json",
    generated: "apps/cli/src/telemetry/__generated__/telemetry-client.ts",
  },
] as const;

const trackedFiles = (paths: ReadonlyArray<string>): ReadonlySet<string> =>
  new Set(
    execFileSync("git", ["ls-files", "--", ...paths], { cwd: repoRoot, encoding: "utf8" })
      .split("\n")
      .filter((file) => file.length > 0),
  );

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

  it.effect.each([...GENERATED_CLIENTS])(
    "the $client client is generated from a contract document tracked in this repository",
    ({ contract, generated }) =>
      Effect.sync(() => {
        const tracked = trackedFiles([contract, generated]);
        expect(tracked.has(contract), contract).toBe(true);
        expect(tracked.has(generated), generated).toBe(true);

        // The contract is a published API document, not private source.
        const document: unknown = JSON.parse(
          fs.readFileSync(path.join(repoRoot, contract), "utf8"),
        );
        if (typeof document !== "object" || document === null) {
          throw new Error(`${contract} must be a JSON object`);
        }
        const record: Partial<Record<string, unknown>> = { ...document };
        expect(
          typeof record["openapi"] === "string" || typeof record["swagger"] === "string",
          contract,
        ).toBe(true);

        // The generated client declares the tracked contract it was generated
        // from, so the public system builds without private context.
        const header = fs
          .readFileSync(path.join(repoRoot, generated), "utf8")
          .split("\n")
          .slice(0, 8)
          .join("\n")
          .replace(/\s+/g, " ");
        expect(header).toContain("@generated");
        expect(header).toContain(`Source: ${contract}`);
      }),
  );
});
