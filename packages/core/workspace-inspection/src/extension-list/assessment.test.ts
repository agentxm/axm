import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { TreeIntegritySchema } from "@agentxm/workspace-state";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { SourceHostProviders, type SourceHostProvidersService } from "@agentxm/extension-sources";
import { assessExtensionListItems, type ExtensionListItem } from "./assessment.js";
import { LOCKFILE_VERSION, type Lockfile, type Settings } from "@agentxm/workspace-state";
import { WorkspaceReadTest, type WorkspaceReadTestFacts } from "@agentxm/workspace-state/testing";
import { CodingAgentRepositoryLive } from "@agentxm/workspace-projection/live";
import {
  handle,
  RegistryClientFactoryTestLive,
  WorkspaceCatalogTestLive,
} from "../test-helpers.js";

const workspaceWithCatalogLayer = (
  facts: Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir"> = {},
) => {
  const readLayer = WorkspaceReadTest({
    baseDir: "/tmp",
    runtimeDir: "/tmp/.axm",
    settings: { agents: ["claude-code"], ...facts.settings } satisfies Settings,
    lockfile: {
      lockfileVersion: LOCKFILE_VERSION,
      skills: {},
      ...facts.lockfile,
    } satisfies Lockfile,
    ...(facts.records === undefined ? {} : { records: facts.records }),
    ...(facts.graph === undefined ? {} : { graph: facts.graph }),
  });
  return Layer.mergeAll(
    readLayer,
    RegistryClientFactoryTestLive(),
    WorkspaceCatalogTestLive.pipe(
      Layer.provide(readLayer),
      Layer.provide(CodingAgentRepositoryLive),
      Layer.provide(NodeServices.layer),
    ),
  );
};

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);

describe("extension list assessment", () => {
  it.effect("compares current Git commit and tree to accepted lock authority", () =>
    Effect.gen(function* () {
      const accepted = {
        type: "github" as const,
        sourceType: "github" as const,
        sourceName: "github",
        endpoint: new URL("https://github.com"),
        extensionType: "skill" as const,
        workspaceName: decodeExtensionNameSync("review"),
        packageFormat: "agentxm" as const,
        packageOwner: handle("@acme"),
        packageName: decodeExtensionNameSync("review"),
        owner: "acme",
        repo: "extensions",
        path: "skills/review",
        resolvedCommit: "commit-1",
        resolvedTree: "tree-1",
        contentIdentity,
        treeIntegrity,
      };
      const layer = workspaceWithCatalogLayer({
        lockfile: { lockfileVersion: LOCKFILE_VERSION, skills: { review: accepted } },
        settings: {
          agents: ["claude-code"],
          sources: [{ name: "github", type: "github", url: new URL("https://github.com") }],
        },
      });
      const ref: ExtensionRef = {
        type: "skill",
        refType: "git-hosted",
        owner: handle("@acme"),
        name: decodeExtensionNameSync("review"),
        skill: {
          name: decodeExtensionNameSync("review"),
          description: Option.none(),
          metadata: Option.none(),
        },
        source: {
          type: "github",
          name: "github",
          url: new URL("https://github.com"),
          owner: "acme",
          repo: "extensions",
          ref: Option.none(),
          subPath: Option.some("skills/review"),
        },
        location: "file:///tmp/review",
        sourcePath: "skills/review",
        gitCommitSha: "commit-1",
        gitTreeSha: "tree-1",
      };
      const providers: SourceHostProvidersService = {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: () => Effect.succeed([ref]),
        fetch: () => Effect.die(new Error("not used")),
        cloneUrl: () => Option.none(),
        origin: () => "https://github.com/acme/extensions",
      };
      const item: ExtensionListItem = {
        ref: "skills/review",
        type: "skill",
        name: "review",
        management: "configured",
        installed: true,
        enabled: true,
        source: "github:acme/extensions//skills/review",
        assessment: { state: "not-checked" },
      };
      const assessed = yield* Effect.scoped(assessExtensionListItems([item], "outdated")).pipe(
        Effect.provide(
          Layer.mergeAll(
            layer,
            Layer.succeed(SourceHostProviders, providers),
            Layer.merge(NodeServices.layer, FetchHttpClient.layer),
          ),
        ),
      );
      expect(assessed[0]?.assessment.state).toBe("current");
    }),
  );

  it.effect("reports missing accepted resolution as unknown", () =>
    Effect.gen(function* () {
      const providers: SourceHostProvidersService = {
        resolveNamedRegistry: () => Effect.die("not used"),
        find: () => Effect.succeed([]),
        fetch: () => Effect.die(new Error("not used")),
        cloneUrl: () => Option.none(),
        origin: () => "https://github.com/acme/extensions",
      };
      const item: ExtensionListItem = {
        ref: "skills/review",
        type: "skill",
        name: "review",
        management: "configured",
        installed: true,
        enabled: true,
        assessment: { state: "not-checked" },
      };
      const assessed = yield* assessExtensionListItems([item], "outdated").pipe(
        Effect.provide(
          Layer.mergeAll(
            workspaceWithCatalogLayer(),
            Layer.succeed(SourceHostProviders, providers),
            Layer.merge(NodeServices.layer, FetchHttpClient.layer),
          ),
        ),
      );
      expect(assessed[0]?.assessment.state).toBe("unknown");
    }),
  );
});
