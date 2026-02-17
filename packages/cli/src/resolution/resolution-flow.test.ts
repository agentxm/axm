/**
 * Tests verifying the new resolution flow:
 * resolveSource(input) -> Source, then SourceHostProviders.find(source, options) -> SourceExtensionRef[]
 *
 * Phase 6: Resolution module cleanup — the resolution module no longer produces
 * SourceExtensionRef. Extension discovery is exclusively through SourceHostProviders.find().
 */

import { describe, expect, it } from "@effect/vitest";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { resolveSource } from "../sources/resolve-source.js";
import { SourceHostProviders } from "../sources/service.js";
import type { SourceHostProvidersService } from "../sources/service.js";
import type { FindOptions } from "../sources/provider.js";
import type { SourceHostConfig } from "../settings/index.js";
import type { SourceExtensionRef, GitHubSource } from "../sources/types.js";
import { Workspace } from "../workspace/index.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

const BUILT_IN_SOURCES: ReadonlyArray<SourceHostConfig> = [
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

const makeWorkspaceLayer = (sources: ReadonlyArray<SourceHostConfig> = BUILT_IN_SOURCES) =>
  Layer.merge(
    Layer.succeed(Workspace, {
      getConfiguredSources: () => Effect.succeed(sources),
      getLockedSkills: () => Effect.succeed({}),
      getConfiguredSkills: () => Effect.succeed({}),
      getConfiguredRegistrySources: () =>
        Effect.succeed(
          sources.filter(
            (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
          ),
        ),
    } as unknown as Workspace["Type"]),
    NodeContext.layer,
  );

/** Create a mock SourceHostProviders that records find() calls. */
const makeMockProviders = (
  findResult: ReadonlyArray<SourceExtensionRef> = [],
): {
  service: SourceHostProvidersService;
  findCalls: Array<{ source: unknown; options: FindOptions }>;
} => {
  const findCalls: Array<{ source: unknown; options: FindOptions }> = [];
  const service: SourceHostProvidersService = {
    find: (source, options) => {
      findCalls.push({ source, options });
      return Effect.succeed(findResult);
    },
    fetch: () => Effect.succeed({ directory: "/tmp/test" }),
    cloneUrl: () => Option.none(),
    origin: () => "test",
  };
  return { service, findCalls };
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("resolution flow: resolveSource + SourceHostProviders.find()", () => {
  it.effect(
    "resolveSource produces Source, then find() discovers extensions",
    () =>
      Effect.gen(function* () {
        // Step 1: resolveSource classifies input -> Source
        const source = yield* resolveSource("github:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer()),
        );

        expect(source.type).toBe("github");
        // Narrow to access github-specific fields
        if (source.type === "github") {
          expect(source.owner).toBe("owner");
          expect(source.repo).toBe("repo");
        }

        // Step 2: SourceHostProviders.find() discovers extensions from Source
        const ghSource = source as GitHubSource;
        const mockRef: SourceExtensionRef = {
          type: "skill",
          source: ghSource,
          skill: {
            name: "test-skill",
            description: "A test skill",
            metadata: Option.none(),
          },
          location: "file:///tmp/cloned",
          gitTreeSha: Option.some("abc123"),
        };
        const { service, findCalls } = makeMockProviders([mockRef]);
        const providers = Layer.succeed(SourceHostProviders, service);

        const refs = yield* Effect.gen(function* () {
          const svc = yield* SourceHostProviders;
          return yield* svc.find(source, { names: [], type: "skill" });
        }).pipe(Effect.provide(providers), Effect.scoped);

        expect(refs).toHaveLength(1);
        expect(refs[0]!.type).toBe("skill");
        expect(findCalls).toHaveLength(1);
        expect(findCalls[0]!.source).toEqual(source);
      }),
    { timeout: 10_000 },
  );

  it.effect(
    "resolveSource produces LocalSource for file paths",
    () =>
      Effect.gen(function* () {
        const source = yield* resolveSource("/tmp/test-skills").pipe(
          Effect.provide(makeWorkspaceLayer()),
        );

        expect(source.type).toBe("local");
        if (source.type === "local") {
          expect(source.path).toBe("/tmp/test-skills");
        }
      }),
    { timeout: 10_000 },
  );

  it.effect(
    "resolveSource produces GitLabSource for gitlab: shorthand",
    () =>
      Effect.gen(function* () {
        const source = yield* resolveSource("gitlab:owner/repo").pipe(
          Effect.provide(makeWorkspaceLayer()),
        );

        expect(source.type).toBe("gitlab");
        if (source.type === "gitlab") {
          expect(source.owner).toBe("owner");
          expect(source.repo).toBe("repo");
        }
      }),
    { timeout: 10_000 },
  );

  it.effect(
    "resolution module no longer exports resolveExtension",
    () =>
      Effect.gen(function* () {
        // Verify the resolution barrel no longer has resolveExtension
        const barrel = yield* Effect.promise(async () => import("./index.js"));
        expect("resolveExtension" in barrel).toBe(false);
        expect("defaultResolutionOptions" in barrel).toBe(false);
      }),
    { timeout: 10_000 },
  );
});
