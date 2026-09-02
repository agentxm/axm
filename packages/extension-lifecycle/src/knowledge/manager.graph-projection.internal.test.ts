/**
 * Regression tests for graph-derived Knowledge discovery rendering.
 *
 * The managed discovery region is an aggregate ownership unit: every write
 * renders every enabled reachable bundle, including Pack-contributed bundles
 * that never appear in settings.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import {
  applyPlannedProjections,
  observeProjectionPlans,
  KnowledgeManager,
} from "@agentxm/extension-workspace";
import { SourceHostProviders, SourceNotResolvable } from "@agentxm/extension-sources";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { DesiredExtensionNode, DesiredStateGraph } from "@agentxm/workspace-state";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock, TEST_CONTENT_IDENTITY } from "@agentxm/workspace-state/testing";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import {
  TestLifecycleFailureAdapter,
  WorkspaceCatalogTestLive,
  computeMaterializedTreeIntegritySync,
  extensionName,
  handle,
} from "../test-helpers.js";
import type { KnowledgeMap } from "@agentxm/workspace-state";
import { KnowledgeManagerLive } from "./manager.js";

const OWNER = "@acme";

const packKnowledgeNode = (name: string, pack: string): DesiredExtensionNode => ({
  type: "knowledge",
  name,
  identity: `${OWNER}/knowledge/${name}`,
  source: `${OWNER}/knowledge/${name}@^1.0.0`,
  enabled: true,
  constraints: ["^1.0.0"],
  origins: [
    {
      type: "pack",
      pack: `${OWNER}/packs/${pack}`,
      manifestPath: `/workspace/agent_extensions/${OWNER}/packs/${pack}/pack.json`,
      source: `${OWNER}/knowledge/${name}`,
      constraint: "^1.0.0",
      enabled: true,
    },
  ],
});

const completeGraph = (nodes: ReadonlyArray<DesiredExtensionNode>): DesiredStateGraph => ({
  complete: true,
  nodes,
  problems: [],
});

const localLock = (baseDir: string, name: string) => ({
  type: "local" as const,
  sourceType: "local" as const,
  sourceName: "local" as const,
  extensionType: "knowledge" as const,
  workspaceName: extensionName(name),
  packageFormat: "agentxm" as const,
  packageOwner: handle(OWNER),
  packageName: extensionName(name),
  path: decodeRelativePathSync(`sources/${name}`),
  contentIdentity: TEST_CONTENT_IDENTITY,
  treeIntegrity: computeMaterializedTreeIntegritySync(
    nodePath.join(baseDir, "agent_extensions", "local", "sources", name),
  ),
});

describe("KnowledgeManager graph-derived discovery projection", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-knowledge-projection-"));
  });

  afterEach(() => {
    nodeFs.rmSync(baseDir, { recursive: true, force: true });
  });

  const writeBundle = (name: string, instructionEntry?: boolean) => {
    const root = nodePath.join(baseDir, "agent_extensions", "local", "sources", name);
    nodeFs.mkdirSync(nodePath.join(root, "src"), { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(root, "knowledge.json"),
      JSON.stringify({
        owner: OWNER,
        type: "knowledge",
        name,
        version: "1.0.0",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
        ...(instructionEntry === undefined ? {} : { instructionEntry }),
      }),
    );
    nodeFs.writeFileSync(
      nodePath.join(root, "src", "index.md"),
      '---\nokf_version: "0.2"\n---\n# Knowledge\n',
    );
  };

  const makeTestLayer = (args: {
    readonly graph: DesiredStateGraph;
    readonly locked: Readonly<Record<string, ReturnType<typeof localLock>>>;
    readonly configured?: KnowledgeMap;
    readonly knowledgeInstructions?: boolean;
    readonly instructionFiles?: boolean;
  }) => {
    const wsMock = makeBaseWorkspaceMock(nodePath.join(baseDir, ".axm"), {
      getDesiredStateGraph: () => Effect.succeed(args.graph),
      getLockedKnowledge: () => Effect.succeed(args.locked),
      // The writer must never derive membership from settings entries.
      getConfiguredKnowledgeEntries: () => Effect.succeed(args.configured ?? {}),
      getKnowledgeDiscoveryConfig: () =>
        Effect.succeed({ instructions: args.knowledgeInstructions !== false }),
      getInstructionsConfig: () =>
        Effect.succeed(args.instructionFiles === false ? Option.none() : Option.some({})),
    });
    return KnowledgeManagerLive.pipe(
      Layer.provideMerge(WorkspaceCatalogTestLive),
      Layer.provideMerge(TestLifecycleFailureAdapter),
      Layer.provideMerge(CodingAgentRepositoryLive),
      Layer.provide(Layer.succeed(WorkspaceMutations, wsMock)),
      Layer.provide(
        Layer.succeed(SourceHostProviders, {
          resolveNamedRegistry: () => Effect.die("not used"),
          find: () => Effect.succeed([]),
          fetch: () =>
            Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
          cloneUrl: () => Option.none(),
          origin: () => "test",
        }),
      ),
      Layer.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
    );
  };

  it.effect("renders two packs' bundles into the discovery region exactly once each", () => {
    writeBundle("pack-a-bundle");
    writeBundle("pack-b-bundle");
    const layer = makeTestLayer({
      graph: completeGraph([
        packKnowledgeNode("pack-a-bundle", "pack-a"),
        packKnowledgeNode("pack-b-bundle", "pack-b"),
      ]),
      locked: {
        "pack-a-bundle": localLock(baseDir, "pack-a-bundle"),
        "pack-b-bundle": localLock(baseDir, "pack-b-bundle"),
      },
    });
    return Effect.gen(function* () {
      const manager = yield* KnowledgeManager;
      yield* applyPlannedProjections(manager);
      const instructions = nodeFs.readFileSync(nodePath.join(baseDir, "AGENTS.md"), "utf8");
      expect(instructions).toContain("region=knowledge");
      expect(instructions.split("[pack-a-bundle]").length - 1).toBe(1);
      expect(instructions.split("[pack-b-bundle]").length - 1).toBe(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("keeps the other pack's routing when one pack leaves the graph", () => {
    writeBundle("pack-a-bundle");
    writeBundle("pack-b-bundle");
    const before = makeTestLayer({
      graph: completeGraph([
        packKnowledgeNode("pack-a-bundle", "pack-a"),
        packKnowledgeNode("pack-b-bundle", "pack-b"),
      ]),
      locked: {
        "pack-a-bundle": localLock(baseDir, "pack-a-bundle"),
        "pack-b-bundle": localLock(baseDir, "pack-b-bundle"),
      },
    });
    const after = makeTestLayer({
      graph: completeGraph([packKnowledgeNode("pack-b-bundle", "pack-b")]),
      locked: { "pack-b-bundle": localLock(baseDir, "pack-b-bundle") },
    });
    const reconcile = Effect.gen(function* () {
      const manager = yield* KnowledgeManager;
      yield* applyPlannedProjections(manager);
    });
    return Effect.gen(function* () {
      yield* reconcile.pipe(Effect.provide(before));
      yield* reconcile.pipe(Effect.provide(after));
      const instructions = nodeFs.readFileSync(nodePath.join(baseDir, "AGENTS.md"), "utf8");
      expect(instructions).not.toContain("pack-a-bundle");
      expect(instructions.split("[pack-b-bundle]").length - 1).toBe(1);
    }).pipe(Effect.provide(after));
  });

  it.effect("does not infer currency from contributor anchors in the generated body", () => {
    writeBundle("pack-a-bundle");
    writeBundle("pack-b-bundle");
    const layer = makeTestLayer({
      graph: completeGraph([
        packKnowledgeNode("pack-a-bundle", "pack-a"),
        packKnowledgeNode("pack-b-bundle", "pack-b"),
      ]),
      locked: {
        "pack-a-bundle": localLock(baseDir, "pack-a-bundle"),
        "pack-b-bundle": localLock(baseDir, "pack-b-bundle"),
      },
    });
    return Effect.gen(function* () {
      const manager = yield* KnowledgeManager;
      yield* applyPlannedProjections(manager);
      const instructionsPath = nodePath.join(baseDir, "AGENTS.md");
      nodeFs.writeFileSync(
        instructionsPath,
        nodeFs
          .readFileSync(instructionsPath, "utf8")
          .replace("<!-- axm:point v=1 ext=@acme/knowledge/pack-b-bundle kind=knowledge -->\n", ""),
      );

      expect(yield* manager.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans))).toEqual(
        [
          expect.objectContaining({
            path: `${instructionsPath}#knowledge`,
            present: true,
            current: true,
            expectedContributors: [
              "@acme/knowledge/pack-a-bundle",
              "@acme/knowledge/pack-b-bundle",
            ],
            observedContributors: [
              "@acme/knowledge/pack-a-bundle",
              "@acme/knowledge/pack-b-bundle",
            ],
          }),
        ],
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect("applies manifest defaults and workspace overrides independently per bundle", () => {
    writeBundle("manifest-default");
    writeBundle("manifest-excluded", false);
    writeBundle("workspace-included", false);
    writeBundle("workspace-excluded", true);
    const names = [
      "manifest-default",
      "manifest-excluded",
      "workspace-included",
      "workspace-excluded",
    ];
    const layer = makeTestLayer({
      graph: completeGraph(names.map((name) => packKnowledgeNode(name, "knowledge-pack"))),
      locked: Object.fromEntries(names.map((name) => [name, localLock(baseDir, name)])),
      configured: {
        "workspace-included": {
          source: `${OWNER}/knowledge/workspace-included@^1.0.0`,
          enabled: true,
          instructionEntry: true,
        },
        "workspace-excluded": {
          source: `${OWNER}/knowledge/workspace-excluded@^1.0.0`,
          enabled: true,
          instructionEntry: false,
        },
      },
    });
    return Effect.gen(function* () {
      const manager = yield* KnowledgeManager;
      yield* applyPlannedProjections(manager);
      const instructions = nodeFs.readFileSync(nodePath.join(baseDir, "AGENTS.md"), "utf8");

      expect(instructions).toContain("[manifest-default]");
      expect(instructions).not.toContain("[manifest-excluded]");
      expect(instructions).toContain("[workspace-included]");
      expect(instructions).not.toContain("[workspace-excluded]");
    }).pipe(Effect.provide(layer));
  });

  it.effect("removes all rows when Knowledge instruction discovery is disabled", () => {
    writeBundle("platform");
    const enabled = makeTestLayer({
      graph: completeGraph([packKnowledgeNode("platform", "knowledge-pack")]),
      locked: { platform: localLock(baseDir, "platform") },
    });
    const disabled = makeTestLayer({
      graph: completeGraph([packKnowledgeNode("platform", "knowledge-pack")]),
      locked: { platform: localLock(baseDir, "platform") },
      knowledgeInstructions: false,
    });
    const reconcile = Effect.gen(function* () {
      const manager = yield* KnowledgeManager;
      yield* applyPlannedProjections(manager);
    });
    return Effect.gen(function* () {
      yield* reconcile.pipe(Effect.provide(enabled));
      yield* reconcile.pipe(Effect.provide(disabled));

      expect(nodeFs.existsSync(nodePath.join(baseDir, "AGENTS.md"))).toBe(false);
    }).pipe(Effect.provide(disabled));
  });
});
