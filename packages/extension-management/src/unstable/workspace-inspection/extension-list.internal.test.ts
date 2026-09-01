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
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../source-resolution/index.js";
import { assessExtensionListItems, type ExtensionListItem } from "./extension-list.js";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock } from "@agentxm/workspace-state/testing";
import { WorkspaceCatalogLive } from "../cli-runtime/workspace-catalog-live.js";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";

const workspaceWithCatalogLayer = (ws: WorkspaceMutationsService) => {
  const wsLayer = Layer.succeed(WorkspaceMutations, ws);
  return Layer.merge(
    wsLayer,
    WorkspaceCatalogLive.pipe(
      Layer.provide(wsLayer),
      Layer.provide(CodingAgentRepositoryLive),
      Layer.provide(NodeServices.layer),
    ),
  );
};
import { handle } from "../test-helpers.js";

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
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getLockedSkill: () => Effect.succeed(Option.some(accepted)),
        getConfiguredSources: () =>
          Effect.succeed([{ name: "github", type: "github", url: new URL("https://github.com") }]),
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
            workspaceWithCatalogLayer(ws),
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
      const ws = makeBaseWorkspaceMock("/tmp/.axm");
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
            workspaceWithCatalogLayer(ws),
            Layer.succeed(SourceHostProviders, providers),
            Layer.merge(NodeServices.layer, FetchHttpClient.layer),
          ),
        ),
      );
      expect(assessed[0]?.assessment.state).toBe("unknown");
    }),
  );
});
