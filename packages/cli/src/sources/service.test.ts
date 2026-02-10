/**
 * Tests for SourceProviders service and registry meta-provider.
 *
 * Tests scope routing, lazy config reads, 404 fallthrough,
 * and dispatch to correct provider by source type.
 */

import { createHash } from "node:crypto";
import { execSync, type ExecSyncOptions } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "vitest";

import type { SettingsError, SourceConfig } from "../settings/index.js";
import type { WorkspaceContextService } from "../workspace/service.js";
import { Workspace } from "../workspace/service.js";
import type { ExtensionIndex, VersionEntry } from "../registry/index.js";
import type { FindOptions } from "./provider.js";
import { SourceProviders, SourceProvidersLive } from "./service.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: "1.0.0",
  published: "2025-01-01T00:00:00Z",
  agents: ["claude-code"],
  checksum: "sha256:0000",
  ...overrides,
});

const makeIndex = (overrides?: Partial<ExtensionIndex>): ExtensionIndex => ({
  name: "my-skill",
  scope: "@test",
  type: "skill",
  versions: [makeVersionEntry()],
  ...overrides,
});

const defaultFindOptions: FindOptions = {
  names: [],
  agents: [],
  type: "skill",
};

const makeRegistryDir = (): string => mkdtempSync(nodePath.join(tmpdir(), "test-registry-"));

const createTestZip = (fileName: string, content: string): Uint8Array => {
  const dir = mkdtempSync(nodePath.join(tmpdir(), "test-zip-"));
  try {
    writeFileSync(nodePath.join(dir, fileName), content);
    const opts: ExecSyncOptions = { stdio: "pipe" };
    execSync(`cd "${dir}" && zip -q archive.zip "${fileName}"`, opts);
    return readFileSync(nodePath.join(dir, "archive.zip"));
  } finally {
    rmSync(dir, { recursive: true });
  }
};

const computeChecksum = (data: Uint8Array): string => {
  const hex = createHash("sha256").update(data).digest("hex");
  return `sha256:${hex}`;
};

/**
 * Create a minimal workspace service for testing.
 * Returns sources and registry sources as configured.
 */
const makeTestWorkspace = (sources: ReadonlyArray<SourceConfig>): WorkspaceContextService => ({
  global: false,
  path: "/tmp/test-workspace",
  nonInteractive: true,
  preview: false,
  resolvePlan: () => Effect.die("not implemented in test"),
  getConfiguredSources: () => Effect.succeed(sources),
  getConfiguredSourceByName: (name: string) =>
    Effect.succeed(Option.fromNullable(sources.find((s) => s.name === name))),
  getConfiguredRegistrySources: (scope: Option.Option<string>) =>
    Effect.succeed(
      (() => {
        const registrySources = sources.filter(
          (s): s is Extract<SourceConfig, { source: "registry" }> => s.source === "registry",
        );
        if (Option.isNone(scope)) return registrySources;
        const scopeValue = scope.value;
        const scopeMatched = registrySources.filter(
          (s) => s.scopes !== undefined && s.scopes.includes(scopeValue),
        );
        if (scopeMatched.length > 0) return scopeMatched;
        return registrySources.filter((s) => s.scopes === undefined);
      })(),
    ),
  getConfiguredScope: () => Effect.succeed("@test") as Effect.Effect<string, SettingsError>,
  addConfiguredSource: () => Effect.void,
  getInstalledSkills: () => Effect.succeed({}),
  getConfiguredAgents: () => Effect.succeed([]),
  getLockedSkills: () => Effect.succeed({}),
  getLockedSkill: () => Effect.succeed(Option.none()),
  setSkill: () => Effect.void,
  removeSkill: () => Effect.void,
  addConfiguredAgent: () => Effect.void,
});

/** Run an effect with SourceProviders service and NodeContext wired up. */
const runWithService = <A, E>(
  sources: ReadonlyArray<SourceConfig>,
  effect: Effect.Effect<A, E, SourceProviders | FileSystem.FileSystem | Path.Path | Scope.Scope>,
) => {
  const wsLayer = Layer.succeed(Workspace, makeTestWorkspace(sources));
  const spLayer = SourceProvidersLive.pipe(
    Layer.provide(wsLayer),
    Layer.provide(NodeContext.layer),
  );
  const fullLayer = Layer.merge(spLayer, NodeContext.layer);
  return Effect.runPromise(effect.pipe(Effect.provide(fullLayer), Effect.scoped));
};

// -----------------------------------------------------------------------------
// Registry meta-provider: scope routing
// -----------------------------------------------------------------------------

describe("registry meta-provider scope routing", () => {
  it("queries catch-all registry when no scope match", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    const archive = createTestZip("SKILL.md", "content");
    const checksum = computeChecksum(archive);

    return runWithService(
      [{ name: "local", source: "registry" as const, location: registryRoot }],
      Effect.gen(function* () {
        // Set up registry
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex({ versions: [makeVersionEntry({ checksum })] })),
        );

        const svc = yield* SourceProviders;
        const refs = yield* svc.resolveExtension(
          { source: "registry" },
          { ...defaultFindOptions, names: ["my-skill"] },
        );
        expect(refs).toHaveLength(1);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("returns empty when no registries configured", () =>
    runWithService(
      [],
      Effect.gen(function* () {
        const svc = yield* SourceProviders;
        const refs = yield* svc.resolveExtension(
          { source: "registry" },
          { ...defaultFindOptions, names: ["my-skill"] },
        );
        expect(refs).toHaveLength(0);
      }),
    ));
});

// -----------------------------------------------------------------------------
// SourceProviders dispatch
// -----------------------------------------------------------------------------

describe("SourceProviders dispatch", () => {
  it("dispatches to local provider for local source", () =>
    runWithService(
      [],
      Effect.gen(function* () {
        const svc = yield* SourceProviders;
        // Querying a nonexistent local path returns an error (not found)
        const result = yield* svc
          .resolveExtension({ source: "local", path: "/nonexistent/path" }, defaultFindOptions)
          .pipe(Effect.either);

        // Local provider will fail because the dir doesn't exist
        expect(result._tag).toBe("Left");
      }),
    ));

  it("dispatches to git stub for git source", () =>
    runWithService(
      [],
      Effect.gen(function* () {
        const svc = yield* SourceProviders;
        const result = yield* svc
          .resolveExtension(
            { source: "git", url: "git@example.com:repo.git", ref: Option.none() },
            defaultFindOptions,
          )
          .pipe(Effect.either);

        // Git provider is a stub that always fails
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.message).toContain("not yet supported");
        }
      }),
    ));

  it("dispatches to azurerepos stub", () =>
    runWithService(
      [],
      Effect.gen(function* () {
        const svc = yield* SourceProviders;
        const result = yield* svc
          .resolveExtension(
            {
              source: "azurerepos",
              organization: "org",
              project: "proj",
              repo: "repo",
              ref: Option.none(),
              subPath: Option.none(),
              name: "test",
              url: "https://dev.azure.com/org/proj/_git/repo",
            },
            defaultFindOptions,
          )
          .pipe(Effect.either);

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.message).toContain("not yet supported");
        }
      }),
    ));

  it("dispatches to registry for registry source", () => {
    const registryRoot = makeRegistryDir();

    return runWithService(
      [{ name: "local", source: "registry" as const, location: registryRoot }],
      Effect.gen(function* () {
        const svc = yield* SourceProviders;
        const refs = yield* svc.resolveExtension(
          { source: "registry" },
          { ...defaultFindOptions, names: ["nonexistent"] },
        );
        // Empty results, but no error (successful dispatch)
        expect(refs).toHaveLength(0);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});
