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
import { makeAppError } from "../app-error/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { decodeRelativePathSync } from "../utils/path-types.js";
import type { DesiredExtensionNode, DesiredStateGraph } from "../workspace/desired-state-graph.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { makeBaseWorkspaceMock, TEST_CONTENT_IDENTITY } from "../workspace/test-stubs.js";
import { KnowledgeManager, KnowledgeManagerLive } from "./manager.js";

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

const localLock = (name: string) => ({
  type: "local" as const,
  path: decodeRelativePathSync(`sources/${name}`),
  contentIdentity: TEST_CONTENT_IDENTITY,
});

describe("KnowledgeManager graph-derived discovery projection", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-knowledge-projection-"));
  });

  afterEach(() => {
    nodeFs.rmSync(baseDir, { recursive: true, force: true });
  });

  const writeBundle = (name: string) => {
    const root = nodePath.join(baseDir, ".axm/extensions/external/knowledge", name);
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
  }) => {
    const wsMock = makeBaseWorkspaceMock(nodePath.join(baseDir, ".axm"), {
      getDesiredStateGraph: () => Effect.succeed(args.graph),
      getLockedKnowledge: () => Effect.succeed(args.locked),
      // The writer must never derive membership from settings entries.
      getConfiguredKnowledgeEntries: () => Effect.succeed({}),
      getInstructionsConfig: () => Effect.succeed(Option.some({})),
    });
    return KnowledgeManagerLive.pipe(
      Layer.provide(Layer.succeed(WorkspaceMutations, wsMock)),
      Layer.provide(
        Layer.succeed(SourceHostProviders, {
          resolveNamedRegistry: () => Effect.die("not used"),
          find: () => Effect.succeed([]),
          fetch: () => Effect.fail(makeAppError({ code: "validation", detail: "not used" })),
          cloneUrl: () => Option.none(),
          origin: () => "test",
        }),
      ),
      Layer.provide(NodeServices.layer),
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
        "pack-a-bundle": localLock("pack-a-bundle"),
        "pack-b-bundle": localLock("pack-b-bundle"),
      },
    });
    return Effect.gen(function* () {
      const manager = yield* KnowledgeManager;
      if (manager.reconcileProjections === undefined) {
        throw new Error("Knowledge reconcileProjections is unavailable");
      }
      yield* manager.reconcileProjections();
      const instructions = nodeFs.readFileSync(nodePath.join(baseDir, "AGENTS.md"), "utf8");
      expect(instructions).toContain("region=knowledge-base");
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
        "pack-a-bundle": localLock("pack-a-bundle"),
        "pack-b-bundle": localLock("pack-b-bundle"),
      },
    });
    const after = makeTestLayer({
      graph: completeGraph([packKnowledgeNode("pack-b-bundle", "pack-b")]),
      locked: { "pack-b-bundle": localLock("pack-b-bundle") },
    });
    const reconcile = Effect.gen(function* () {
      const manager = yield* KnowledgeManager;
      if (manager.reconcileProjections !== undefined) {
        yield* manager.reconcileProjections();
      }
    });
    return Effect.gen(function* () {
      yield* reconcile.pipe(Effect.provide(before));
      yield* reconcile.pipe(Effect.provide(after));
      const instructions = nodeFs.readFileSync(nodePath.join(baseDir, "AGENTS.md"), "utf8");
      expect(instructions).not.toContain("pack-a-bundle");
      expect(instructions.split("[pack-b-bundle]").length - 1).toBe(1);
    }).pipe(Effect.provide(after));
  });
});
