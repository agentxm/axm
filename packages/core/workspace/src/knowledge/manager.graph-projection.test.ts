/**
 * Regression tests for graph-derived Knowledge discovery rendering.
 *
 * The managed discovery region is an aggregate ownership unit: every write
 * renders every enabled reachable bundle, including Pack-contributed bundles
 * that never appear in settings.
 */

import { desiredConstraintOf } from "../desired-state/testing.js";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../transitions/settlement/live.js";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { KnowledgeManager } from "../materialization/managers.js";
import { applyPlannedProjections, observeProjectionPlans } from "../projection/index.js";
import { SourceHostProviders, SourceNotResolvable } from "../resolution/sources/index.js";
import {
  DesiredStateWriter,
  SettingsWriter,
  type DesiredExtensionNode,
  type DesiredStateGraph,
} from "../desired-state/index.js";
import { WorkspaceReadTest, MockWorkspaceTransactionScope } from "../desired-state/testing.js";
import { exactVersion } from "../desired-state/test-helpers.js";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
  WorkspaceCatalogLive,
} from "../projection/live.js";
import {
  computeMaterializedTreeIntegritySync,
  extensionName,
  handle,
} from "../materialization/test-helpers.js";
import type { KnowledgeMap } from "../desired-state/index.js";
import { KnowledgeManagerLive } from "./manager.js";

const OWNER = "@acme";

const packKnowledgeNode = (name: string, pack: string): DesiredExtensionNode => ({
  type: "knowledge",
  name,
  identity: {
    authority: "registry",
    fqn: `${OWNER}/knowledge/${name}`,
    registry: { sourceName: undefined, endpoint: undefined },
  },
  source: `${OWNER}/knowledge/${name}@^1.0.0`,
  enabled: true,
  constraint: desiredConstraintOf("^1.0.0"),
  origins: [
    {
      type: "pack",
      pack: { authority: "registry", fqn: `${OWNER}/packs/${pack}` },
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
  mcpSourceClosures: [],
  problems: [],
});

const localLock = (baseDir: string, name: string) => ({
  source: { type: "registry" as const, url: new URL("https://registry.agentxm.ai") },
  identity: { owner: handle(OWNER), name: extensionName(name) },
  resolved: {
    version: exactVersion("1.0.0"),
    integrity: "sha512-stub",
    publisherBindingId: "hbnd_test",
  },
  treeIntegrity: computeMaterializedTreeIntegritySync(
    nodePath.join(baseDir, "agent_extensions", "registry", OWNER, "knowledge", name),
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
    const root = nodePath.join(baseDir, "agent_extensions", "registry", OWNER, "knowledge", name);
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
    const axmDir = nodePath.join(baseDir, ".axm");
    return KnowledgeManagerLive.pipe(
      Layer.provideMerge(WorkspaceCatalogLive),
      Layer.provideMerge(CodingAgentRepositoryLive),
      Layer.provideMerge(
        Layer.mergeAll(
          WorkspaceReadTest({
            baseDir,
            runtimeDir: axmDir,
            settings: {
              knowledge: args.configured ?? {},
              ...(args.knowledgeInstructions === false
                ? { knowledgeConfig: { instructions: false } }
                : {}),
              ...(args.instructionFiles === false ? {} : { instructionFiles: {} }),
            },
            lockfile: { lockfileVersion: 8, skills: {}, knowledge: args.locked },
            graph: args.graph,
          }),
          Layer.mock(SettingsWriter, {}),
          Layer.mock(DesiredStateWriter, {}),
        ),
      ),
      Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
      Layer.provide(
        Layer.succeed(SourceHostProviders, {
          resolveNamedRegistry: () => Effect.die("not used"),
          find: () => Effect.succeed([]),
          fetch: () =>
            Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
          acquireForTransition: () =>
            Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
          cloneUrl: () => Option.none(),
          origin: () => "test",
        }),
      ),
      Layer.provideMerge(NativeWriteAuthorityLive),
      Layer.provideMerge(WorkspaceFileWriteLocksLive),
      Layer.provideMerge(
        Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), NodeServices.layer),
      ),
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
