/**
 * Tests for SourceHostProviders service and registry meta-provider.
 *
 * Tests owner routing, lazy config reads, 404 fallthrough,
 * and dispatch to correct provider by source type.
 */

import { createHash } from "node:crypto";
import { execSync, type ExecSyncOptions } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "@effect/vitest";

import type { SourceHostConfig } from "../settings/index.js";
import type { WorkspaceMutationsService } from "../workspace/index.js";
import { WorkspaceMutations } from "../workspace/index.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import type { ExtensionIndex, VersionEntry } from "../registry/index.js";
import type { FindOptions } from "../sources/index.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { SourceHostProviders, SourceHostProvidersLive } from "./service.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: exactVersion("1.0.0"),
  published: "2025-01-01T00:00:00Z",
  integrity: "sha512-AAAA==",
  ...overrides,
});

const makeIndex = (overrides?: Partial<ExtensionIndex>): ExtensionIndex => ({
  name: extensionName("my-skill"),
  owner: handle("@test"),
  type: "skill",
  versions: [makeVersionEntry()],
  ...overrides,
});

const defaultFindOptions: FindOptions = {
  names: [],
  type: "skill",
  owner: Option.none(),
  versionConstraint: Option.none(),
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

const computeIntegrity = (data: Uint8Array): string => {
  const b64 = createHash("sha512").update(data).digest("base64");
  return `sha512-${b64}`;
};

/**
 * Create a minimal workspace service for testing.
 * Returns registry sources without owner filtering.
 */
const makeTestWorkspace = (
  sources: ReadonlyArray<SourceHostConfig>,
): WorkspaceMutationsService => ({
  ...makeBaseWorkspaceMock("/tmp/test-workspace"),
  getConfiguredSources: () => Effect.succeed(sources),
  getConfiguredSourceByName: (name: string) =>
    Effect.succeed(Option.fromUndefinedOr(sources.find((s) => s.name === name))),
  getRegistrySourceHosts: () =>
    Effect.succeed(
      sources.filter(
        (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
      ),
    ),
  getConfiguredOwner: () => Effect.succeed(Option.some(handle("@test"))),
});

/** Run an effect with SourceHostProviders service and NodeContext wired up. */
const runWithService = <A, E>(
  sources: ReadonlyArray<SourceHostConfig>,
  effect: Effect.Effect<
    A,
    E,
    SourceHostProviders | FileSystem.FileSystem | Path.Path | Scope.Scope
  >,
) => {
  const wsLayer = Layer.succeed(WorkspaceMutations, makeTestWorkspace(sources));
  const spLayer = SourceHostProvidersLive.pipe(
    Layer.provide(wsLayer),
    Layer.provide(NodeServices.layer),
  );
  const fullLayer = Layer.mergeAll(spLayer, NodeServices.layer);
  return effect.pipe(Effect.provide(fullLayer), Effect.scoped);
};

// -----------------------------------------------------------------------------
// Registry meta-provider: owner routing
// -----------------------------------------------------------------------------

describe("registry meta-provider owner routing", () => {
  it.effect("queries catch-all registry when no owner match", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    const archive = createTestZip("SKILL.md", "content");
    const integrity = computeIntegrity(archive);

    return runWithService(
      [
        {
          name: "local",
          type: "registry" as const,
          location: new URL(`file://${registryRoot}`),
        },
      ],
      Effect.gen(function* () {
        // Set up registry
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex({ versions: [makeVersionEntry({ integrity })] })),
        );

        const svc = yield* SourceHostProviders;
        const refs = yield* svc.find(
          {
            type: "registry",
            location: new URL(`file://${registryRoot}`),
            owner: Option.none(),
          },
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

  it.effect("returns empty when no registries configured", () =>
    runWithService(
      [],
      Effect.gen(function* () {
        const svc = yield* SourceHostProviders;
        const refs = yield* svc.find(
          {
            type: "registry",
            location: new URL("file:///tmp/registry"),
            owner: Option.none(),
          },
          { ...defaultFindOptions, names: ["my-skill"] },
        );
        expect(refs).toHaveLength(0);
      }),
    ),
  );

  it.effect("filters registry discovery to the requested owner", () => {
    const registryRoot = makeRegistryDir();
    const scopedSkillDir = nodePath.join(registryRoot, "extensions", "@acme", "skills", "my-skill");
    const otherScopeSkillDir = nodePath.join(
      registryRoot,
      "extensions",
      "@other",
      "skills",
      "my-skill",
    );

    const archive = createTestZip("SKILL.md", "content");
    const integrity = computeIntegrity(archive);

    return runWithService(
      [
        {
          name: "local",
          type: "registry" as const,
          location: new URL(`file://${registryRoot}`),
        },
      ],
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(scopedSkillDir, { recursive: true });
        yield* fs.makeDirectory(otherScopeSkillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(scopedSkillDir, "index.json"),
          JSON.stringify(
            makeIndex({
              owner: handle("@acme"),
              name: extensionName("my-skill"),
              versions: [makeVersionEntry({ integrity })],
            }),
          ),
        );
        yield* fs.writeFileString(
          nodePath.join(otherScopeSkillDir, "index.json"),
          JSON.stringify(
            makeIndex({
              owner: handle("@other"),
              name: extensionName("my-skill"),
              versions: [makeVersionEntry({ integrity, version: exactVersion("2.0.0") })],
            }),
          ),
        );

        const svc = yield* SourceHostProviders;
        const refs = yield* svc.find(
          {
            type: "registry",
            location: new URL(`file://${registryRoot}`),
            owner: Option.none(),
          },
          { ...defaultFindOptions, owner: Option.some(handle("@acme")) },
        );
        expect(refs).toHaveLength(1);
        const ref = refs[0];
        if (ref?.refType === "registry") {
          expect(ref.owner).toBe("@acme");
        }
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it.effect("uses the provided registry source and ignores other configured registries", () => {
    const registryRoot = makeRegistryDir();

    return runWithService(
      [
        {
          name: "remote",
          type: "registry" as const,
          location: new URL("http://localhost:4300"),
        },
        {
          name: "local",
          type: "registry" as const,
          location: new URL(`file://${registryRoot}`),
        },
      ],
      Effect.gen(function* () {
        const svc = yield* SourceHostProviders;
        const refs = yield* svc.find(
          {
            type: "registry",
            location: new URL(`file://${registryRoot}`),
            owner: Option.some(handle("@test")),
          },
          { ...defaultFindOptions, names: ["missing"] },
        );
        expect(refs).toHaveLength(0);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});

// -----------------------------------------------------------------------------
// SourceHostProviders dispatch
// -----------------------------------------------------------------------------

describe("SourceHostProviders dispatch", () => {
  it.effect("dispatches to local provider for local source", () =>
    runWithService(
      [],
      Effect.gen(function* () {
        const svc = yield* SourceHostProviders;
        // Querying a nonexistent local path returns an error (not found)
        const result = yield* svc
          .find({ type: "local", path: "/nonexistent/path" }, defaultFindOptions)
          .pipe(Effect.result);

        // Local provider will fail because the dir doesn't exist
        expect(result._tag).toBe("Failure");
      }),
    ),
  );

  it.effect("dispatches to git stub for git source", () =>
    runWithService(
      [],
      Effect.gen(function* () {
        const svc = yield* SourceHostProviders;
        const result = yield* svc
          .find(
            { type: "git", url: new URL("https://example.com/repo.git"), ref: Option.none() },
            defaultFindOptions,
          )
          .pipe(Effect.result);

        // Git provider is a stub that always fails
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.message).toContain("not yet supported");
        }
      }),
    ),
  );

  it.effect("dispatches to azurerepos stub", () =>
    runWithService(
      [],
      Effect.gen(function* () {
        const svc = yield* SourceHostProviders;
        const result = yield* svc
          .find(
            {
              type: "azurerepos",
              organization: "org",
              project: "proj",
              repo: "repo",
              ref: Option.none(),
              subPath: Option.none(),
              // Use an unreachable local URL to avoid credential prompts against live hosts.
              url: new URL("https://127.0.0.1:1/org/proj/_git/repo"),
            },
            defaultFindOptions,
          )
          .pipe(Effect.result);

        expect(result._tag).toBe("Failure");
      }),
    ),
  );

  it.effect("dispatches to registry for registry source", () => {
    const registryRoot = makeRegistryDir();

    return runWithService(
      [
        {
          name: "local",
          type: "registry" as const,
          location: new URL(`file://${registryRoot}`),
        },
      ],
      Effect.gen(function* () {
        const svc = yield* SourceHostProviders;
        const refs = yield* svc.find(
          {
            type: "registry",
            location: new URL(`file://${registryRoot}`),
            owner: Option.none(),
          },
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
