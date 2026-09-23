/**
 * Regression tests for graph-derived hook unit rendering.
 *
 * Both hook ownership units are aggregates: the AXM-owned entries in one
 * agent's hook configuration and the fallback region each render the complete
 * contributor set the desired-state graph reaches, including Pack-contributed
 * hooks that never appear in settings.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { WorkspaceFileWriteLocksLive } from "../transitions/settlement/live.js";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { HooksLockMapSchema, type HooksLockMap } from "../desired-state/index.js";
import {
  WorkspaceCatalogTestLive,
  computeMaterializedTreeIntegritySync,
} from "../materialization/test-helpers.js";
import { HookManager } from "../materialization/managers.js";
import { applyPlannedProjections, observeProjectionPlans } from "../projection/index.js";
import { SourceHostProviders } from "../resolution/sources/index.js";
import type { SourceHostProvidersService } from "../resolution/sources/index.js";
import type { DesiredExtensionNode, DesiredStateGraph } from "../desired-state/index.js";
import type { Settings } from "../desired-state/index.js";
import { WorkspaceReadTest, MockWorkspaceTransactionScope } from "../desired-state/testing.js";
import { CodingAgentRepositoryLive, NativeWriteAuthorityLive } from "../projection/live.js";
import { HookManagerLive } from "./manager.js";

const OWNER = "@acme";

const providersStub: SourceHostProvidersService = {
  resolveNamedRegistry: () => Effect.die("not used"),
  find: () => Effect.die("not used"),
  fetch: () => Effect.die("not used"),
  acquireForTransition: () => Effect.die("not used"),
  cloneUrl: () => Option.none(),
  origin: () => "registry",
};

const decodeLockMap = Schema.decodeUnknownSync(HooksLockMapSchema);

const registryLock = (baseDir: string, name: string) => ({
  source: { type: "registry", url: "https://registry.agentxm.ai" },
  identity: { owner: OWNER, name },
  resolved: {
    version: "1.0.0",
    integrity: "sha512-stub",
    publisherBindingId: "hbnd_test",
  },
  treeIntegrity: computeMaterializedTreeIntegritySync(
    nodePath.join(baseDir, "agent_extensions", "registry", OWNER, "hooks", name),
  ),
});

const packHookNode = (name: string, pack: string): DesiredExtensionNode => ({
  type: "hook",
  name,
  identity: `${OWNER}/hooks/${name}`,
  source: `${OWNER}/hooks/${name}@^1.0.0`,
  enabled: true,
  constraints: ["^1.0.0"],
  origins: [
    {
      type: "pack",
      pack: `${OWNER}/packs/${pack}`,
      manifestPath: `/workspace/agent_extensions/registry/${OWNER}/packs/${pack}/pack.json`,
      source: `${OWNER}/hooks/${name}`,
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

describe("HookManager graph-derived unit projection", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-hooks-projection-"));
  });

  afterEach(() => {
    nodeFs.rmSync(baseDir, { recursive: true, force: true });
  });

  const writeHookPackage = (name: string) => {
    const root = nodePath.join(baseDir, "agent_extensions", "registry", OWNER, "hooks", name);
    nodeFs.mkdirSync(nodePath.join(root, "src"), { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(root, "hook.json"),
      JSON.stringify({
        owner: OWNER,
        type: "hook",
        name,
        version: "1.0.0",
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "tool.pre", matcherRaw: "Write|Edit" }],
      }),
    );
    nodeFs.writeFileSync(nodePath.join(root, "src", "hook.sh"), "#!/usr/bin/env bash\n");
  };

  const makeTestLayer = (args: {
    readonly graph: DesiredStateGraph;
    readonly locked: HooksLockMap;
    readonly configuredAgents: NonNullable<Settings["agents"]>;
  }) => {
    const axmDir = nodePath.join(baseDir, ".axm");
    return HookManagerLive.pipe(
      Layer.provideMerge(WorkspaceCatalogTestLive),
      Layer.provideMerge(CodingAgentRepositoryLive),
      Layer.provideMerge(
        WorkspaceReadTest({
          baseDir,
          runtimeDir: axmDir,
          settings: { agents: [...args.configuredAgents], instructionFiles: {} },
          lockfile: { lockfileVersion: 8, skills: {}, hooks: args.locked },
          graph: args.graph,
        }),
      ),
      Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
      Layer.provide(Layer.succeed(SourceHostProviders, providersStub)),
      Layer.provideMerge(NativeWriteAuthorityLive),
      Layer.provideMerge(WorkspaceFileWriteLocksLive),
      Layer.provideMerge(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
    );
  };

  it.effect("renders two packs' hooks into one native config exactly once each", () => {
    writeHookPackage("pack-a-hook");
    writeHookPackage("pack-b-hook");
    const layer = makeTestLayer({
      graph: completeGraph([
        packHookNode("pack-a-hook", "pack-a"),
        packHookNode("pack-b-hook", "pack-b"),
      ]),
      locked: decodeLockMap({
        "pack-a-hook": registryLock(baseDir, "pack-a-hook"),
        "pack-b-hook": registryLock(baseDir, "pack-b-hook"),
      }),
      configuredAgents: ["claude-code"],
    });
    return Effect.gen(function* () {
      const manager = yield* HookManager;
      yield* applyPlannedProjections(manager);
      const raw = nodeFs.readFileSync(nodePath.join(baseDir, ".claude", "settings.json"), "utf8");
      expect(raw.split("pack-a-hook/src/hook.sh").length - 1).toBe(1);
      expect(raw.split("pack-b-hook/src/hook.sh").length - 1).toBe(1);
      expect(
        (yield* manager.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans))).every(
          ({ current }) => current,
        ),
      ).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("keeps the other pack's native entry when one pack leaves the graph", () => {
    writeHookPackage("pack-a-hook");
    writeHookPackage("pack-b-hook");
    const before = makeTestLayer({
      graph: completeGraph([
        packHookNode("pack-a-hook", "pack-a"),
        packHookNode("pack-b-hook", "pack-b"),
      ]),
      locked: decodeLockMap({
        "pack-a-hook": registryLock(baseDir, "pack-a-hook"),
        "pack-b-hook": registryLock(baseDir, "pack-b-hook"),
      }),
      configuredAgents: ["claude-code"],
    });
    const after = makeTestLayer({
      graph: completeGraph([packHookNode("pack-b-hook", "pack-b")]),
      locked: decodeLockMap({ "pack-b-hook": registryLock(baseDir, "pack-b-hook") }),
      configuredAgents: ["claude-code"],
    });
    return Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const manager = yield* HookManager;
        yield* applyPlannedProjections(manager);
      }).pipe(Effect.provide(before));
      yield* Effect.gen(function* () {
        const manager = yield* HookManager;
        yield* applyPlannedProjections(manager);
      }).pipe(Effect.provide(after));
      const raw = nodeFs.readFileSync(nodePath.join(baseDir, ".claude", "settings.json"), "utf8");
      expect(raw).not.toContain("pack-a-hook");
      expect(raw.split("pack-b-hook/src/hook.sh").length - 1).toBe(1);
    }).pipe(Effect.provide(after));
  });

  it.effect("reads an incomplete contributor set from a native hook unit", () => {
    writeHookPackage("pack-a-hook");
    writeHookPackage("pack-b-hook");
    const layer = makeTestLayer({
      graph: completeGraph([
        packHookNode("pack-a-hook", "pack-a"),
        packHookNode("pack-b-hook", "pack-b"),
      ]),
      locked: decodeLockMap({
        "pack-a-hook": registryLock(baseDir, "pack-a-hook"),
        "pack-b-hook": registryLock(baseDir, "pack-b-hook"),
      }),
      configuredAgents: ["claude-code"],
    });
    return Effect.gen(function* () {
      const manager = yield* HookManager;
      yield* applyPlannedProjections(manager);
      const settingsPath = nodePath.join(baseDir, ".claude", "settings.json");
      const edited = nodeFs
        .readFileSync(settingsPath, "utf8")
        .replace("pack-b-hook/src/hook.sh", "missing-hook/src/hook.sh");
      nodeFs.writeFileSync(
        settingsPath,
        edited.replace(
          /\}\s*$/u,
          ',\n  "note": "bash agent_extensions/registry/@acme/hooks/pack-b-hook/src/hook.sh"\n}\n',
        ),
      );

      expect(
        yield* manager.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans)),
      ).toContainEqual(
        expect.objectContaining({
          unitId: "hook:agent-hook-entries",
          current: false,
          present: true,
          expectedContributors: ["@acme/hooks/pack-a-hook", "@acme/hooks/pack-b-hook"],
          observedContributors: ["@acme/hooks/pack-a-hook"],
        }),
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect("preserves repository rewrites in the fallback region for writer-less agents", () => {
    writeHookPackage("pack-a-hook");
    writeHookPackage("pack-b-hook");
    const layer = makeTestLayer({
      graph: completeGraph([
        packHookNode("pack-a-hook", "pack-a"),
        packHookNode("pack-b-hook", "pack-b"),
      ]),
      locked: decodeLockMap({
        "pack-a-hook": registryLock(baseDir, "pack-a-hook"),
        "pack-b-hook": registryLock(baseDir, "pack-b-hook"),
      }),
      configuredAgents: ["windsurf"],
    });
    return Effect.gen(function* () {
      const manager = yield* HookManager;
      yield* applyPlannedProjections(manager);
      const instructionsPath = nodePath.join(baseDir, "AGENTS.md");
      const instructions = nodeFs.readFileSync(instructionsPath, "utf8");
      expect(instructions).toContain("region=hook-fallbacks");
      expect(instructions.split("pack-a-hook/src/hook.sh").length - 1).toBe(1);
      expect(instructions.split("pack-b-hook/src/hook.sh").length - 1).toBe(1);

      const rewritten = instructions.replace(
        "pack-a-hook/src/hook.sh",
        "repository-formatted-fallback",
      );
      expect(rewritten).not.toBe(instructions);
      nodeFs.writeFileSync(instructionsPath, rewritten);

      expect(yield* manager.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans))).toEqual(
        [expect.objectContaining({ present: true, current: true })],
      );
      yield* applyPlannedProjections(manager);
      expect(nodeFs.readFileSync(instructionsPath, "utf8")).toBe(rewritten);
    }).pipe(Effect.provide(layer));
  });

  it.effect("refuses to write from an incomplete desired-state graph", () => {
    writeHookPackage("pack-a-hook");
    const settingsPath = nodePath.join(baseDir, ".claude", "settings.json");
    const layer = makeTestLayer({
      graph: {
        complete: false,
        nodes: [packHookNode("pack-a-hook", "pack-a")],
        mcpSourceClosures: [],
        problems: [
          {
            type: "pack-manifest-unavailable",
            pack: `${OWNER}/packs/pack-a`,
            path: "agent_extensions/@acme/packs/pack-a/pack.json",
          },
        ],
      },
      locked: decodeLockMap({ "pack-a-hook": registryLock(baseDir, "pack-a-hook") }),
      configuredAgents: ["claude-code"],
    });
    return Effect.gen(function* () {
      const manager = yield* HookManager;
      const error = yield* applyPlannedProjections(manager).pipe(Effect.flip);
      expect(error._tag).toBe("DesiredStateIncomplete");
      expect(nodeFs.existsSync(settingsPath)).toBe(false);
    }).pipe(Effect.provide(layer));
  });
});
