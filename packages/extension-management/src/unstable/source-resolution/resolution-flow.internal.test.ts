/**
 * Tests verifying the resolution flow:
 * resolveSource(input) -> Source, then SourceHostProviders.find(source, options) -> ExtensionRef[]
 */

import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { resolveSource } from "./resolve-source.js";
import { SourceHostProviders } from "./service.js";
import type { SourceHostProvidersService } from "./service.js";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitHubSource } from "@agentxm/extension-model/unstable/sources/types";
import type { SourceHostConfig } from "@agentxm/workspace-state";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock } from "@agentxm/workspace-state/testing";
import { WorkspaceCatalogLive } from "../cli-runtime/workspace-catalog-live.js";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { at, extensionName, handle } from "../test-helpers.js";

// -----------------------------------------------------------------------------
// Test helpers
// -----------------------------------------------------------------------------

const BUILT_IN_SOURCES: ReadonlyArray<SourceHostConfig> = [
  { name: "agentxm", type: "registry", location: new URL("https://registry.agentxm.ai") },
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

const makeWorkspaceLayer = (sources: ReadonlyArray<SourceHostConfig> = BUILT_IN_SOURCES) => {
  const wsLayer = Layer.succeed(
    WorkspaceMutations,
    makeBaseWorkspaceMock("/tmp/axm", {
      getConfiguredSources: () => Effect.succeed(sources),
      getLockedSkills: () => Effect.succeed({}),
      getRegistrySourceHosts: () =>
        Effect.succeed(
          sources.filter(
            (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
          ),
        ),
    }),
  );
  const catalogLayer = WorkspaceCatalogLive.pipe(
    Layer.provide(wsLayer),
    Layer.provide(CodingAgentRepositoryLive),
    Layer.provide(NodeServices.layer),
  );
  return Layer.merge(
    Layer.merge(wsLayer, catalogLayer),
    Layer.merge(NodeServices.layer, FetchHttpClient.layer),
  );
};

const expectStringOption = (value: unknown): Option.Option<string> => {
  if (typeof value === "object" && value !== null && "_tag" in value && value._tag === "None") {
    return Option.none();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "_tag" in value &&
    value._tag === "Some" &&
    "value" in value &&
    typeof value.value === "string"
  ) {
    return Option.some(value.value);
  }

  throw new Error("Expected Option<string>");
};

const expectGitHubSource = (source: { readonly type: string }): GitHubSource => {
  if (source.type !== "github") {
    throw new Error("Expected GitHub source");
  }

  const url = "url" in source ? source.url : undefined;
  const owner = "owner" in source ? source.owner : undefined;
  const repo = "repo" in source ? source.repo : undefined;
  const ref = expectStringOption("ref" in source ? source.ref : Option.none<string>());
  const subPath = expectStringOption("subPath" in source ? source.subPath : Option.none<string>());

  if (!(url instanceof URL) || typeof owner !== "string" || typeof repo !== "string") {
    throw new Error("Expected GitHub source fields");
  }

  return { type: "github", name: "github", url, owner, repo, ref, subPath };
};

/** Create a mock SourceHostProviders that records find() calls. */
const makeMockProviders = (
  findResult: ReadonlyArray<ExtensionRef> = [],
): {
  service: SourceHostProvidersService;
  findCalls: Array<{ source: unknown; options: FindOptions }>;
} => {
  const findCalls: Array<{ source: unknown; options: FindOptions }> = [];
  const service: SourceHostProvidersService = {
    resolveNamedRegistry: () => Effect.die("not used"),
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
        const ghSource = expectGitHubSource(source);
        const mockRef: ExtensionRef = {
          type: "skill",
          refType: "git-hosted",
          owner: handle("@test"),
          name: extensionName("test-skill"),
          source: ghSource,
          skill: {
            name: extensionName("test-skill"),
            description: Option.some("A test skill"),
            metadata: Option.none(),
          },
          location: "file:///tmp/cloned",
          gitTreeSha: "tree-1",
          gitCommitSha: "commit-1",
        };
        const { service, findCalls } = makeMockProviders([mockRef]);
        const providers = Layer.succeed(SourceHostProviders, service);

        const refs = yield* Effect.gen(function* () {
          const svc = yield* SourceHostProviders;
          return yield* svc.find(source, {
            names: [],
            type: "skill",
            owner: Option.none(),
            versionRange: Option.none(),
          });
        }).pipe(Effect.provide(providers), Effect.scoped);

        expect(refs).toHaveLength(1);
        expect(at(refs, 0).type).toBe("skill");
        expect(findCalls).toHaveLength(1);
        expect(at(findCalls, 0).source).toEqual(source);
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
});
