import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { readWorkspacePackageDirectories } from "./workspace-packages.js";

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

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * The repository manifest and every workspace package manifest, enumerated
 * from the pnpm workspace globs rather than from a list kept in this file.
 * The requirement is about *no* workspace package, so a roster maintained by
 * hand would quietly stop covering packages added, renamed, or split after it
 * was written.
 */
const workspaceManifestPaths = (): ReadonlyArray<string> => [
  "package.json",
  ...readWorkspacePackageDirectories(repoRoot).map((directory) => `${directory}/package.json`),
];

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
      const manifestPaths = workspaceManifestPaths();
      expect(manifestPaths.length).toBeGreaterThan(1);
      for (const manifestPath of manifestPaths) {
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
            const site = `${manifestPath} ${field} ${name}`;
            expect(name, site).not.toContain("internal");
            if (typeof version === "string") {
              expect(version.startsWith("file:.."), site).toBe(false);
              expect(version.startsWith("link:.."), site).toBe(false);
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
