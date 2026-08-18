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
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { HooksLockMapSchema, type HooksLockMap } from "../lockfile/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type { DesiredExtensionNode, DesiredStateGraph } from "../workspace/desired-state-graph.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import { HookManager, HookManagerLive } from "./manager.js";

const OWNER = "@acme";

const providersStub: SourceHostProvidersService = {
  resolveNamedRegistry: () => Effect.die("not used"),
  find: () => Effect.die("not used"),
  fetch: () => Effect.die("not used"),
  cloneUrl: () => Option.none(),
  origin: () => "registry",
};

const decodeLockMap = Schema.decodeUnknownSync(HooksLockMapSchema);

const registryLock = (name: string) => ({
  type: "registry",
  owner: OWNER,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-stub",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
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
      source: `${OWNER}/hooks/${name}`,
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

describe("HookManager graph-derived unit projection", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-hooks-projection-"));
  });

  afterEach(() => {
    nodeFs.rmSync(baseDir, { recursive: true, force: true });
  });

  const writeHookPackage = (name: string) => {
    const root = nodePath.join(baseDir, ".axm/extensions", OWNER, "hooks", name);
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
    readonly configuredAgents: ReadonlyArray<string>;
  }) => {
    const wsMock = makeBaseWorkspaceMock(nodePath.join(baseDir, ".axm"), {
      getDesiredStateGraph: () => Effect.succeed(args.graph),
      getLockedHooks: () => Effect.succeed(args.locked),
      getConfiguredAgents: () => Effect.succeed(args.configuredAgents),
      // The writer must never derive membership from settings entries.
      getConfiguredHookEntries: () => Effect.succeed({}),
      getInstructionsConfig: () => Effect.succeed(Option.some({})),
    });
    return HookManagerLive.pipe(
      Layer.provide(Layer.succeed(WorkspaceMutations, wsMock)),
      Layer.provide(Layer.succeed(SourceHostProviders, providersStub)),
      Layer.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
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
        "pack-a-hook": registryLock("pack-a-hook"),
        "pack-b-hook": registryLock("pack-b-hook"),
      }),
      configuredAgents: ["claude-code"],
    });
    return Effect.gen(function* () {
      const manager = yield* HookManager;
      yield* manager.reconcileProjections();
      const raw = nodeFs.readFileSync(nodePath.join(baseDir, ".claude", "settings.json"), "utf8");
      expect(raw.split("pack-a-hook/src/hook.sh").length - 1).toBe(1);
      expect(raw.split("pack-b-hook/src/hook.sh").length - 1).toBe(1);
      expect(yield* manager.hooksProjectionCurrent).toBe(true);
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
        "pack-a-hook": registryLock("pack-a-hook"),
        "pack-b-hook": registryLock("pack-b-hook"),
      }),
      configuredAgents: ["claude-code"],
    });
    const after = makeTestLayer({
      graph: completeGraph([packHookNode("pack-b-hook", "pack-b")]),
      locked: decodeLockMap({ "pack-b-hook": registryLock("pack-b-hook") }),
      configuredAgents: ["claude-code"],
    });
    return Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const manager = yield* HookManager;
        yield* manager.reconcileProjections();
      }).pipe(Effect.provide(before));
      yield* Effect.gen(function* () {
        const manager = yield* HookManager;
        yield* manager.reconcileProjections();
      }).pipe(Effect.provide(after));
      const raw = nodeFs.readFileSync(nodePath.join(baseDir, ".claude", "settings.json"), "utf8");
      expect(raw).not.toContain("pack-a-hook");
      expect(raw.split("pack-b-hook/src/hook.sh").length - 1).toBe(1);
    }).pipe(Effect.provide(after));
  });

  it.effect("renders both packs' hooks into the fallback region for writer-less agents", () => {
    writeHookPackage("pack-a-hook");
    writeHookPackage("pack-b-hook");
    const layer = makeTestLayer({
      graph: completeGraph([
        packHookNode("pack-a-hook", "pack-a"),
        packHookNode("pack-b-hook", "pack-b"),
      ]),
      locked: decodeLockMap({
        "pack-a-hook": registryLock("pack-a-hook"),
        "pack-b-hook": registryLock("pack-b-hook"),
      }),
      configuredAgents: ["windsurf"],
    });
    return Effect.gen(function* () {
      const manager = yield* HookManager;
      yield* manager.reconcileProjections();
      const instructions = nodeFs.readFileSync(nodePath.join(baseDir, "AGENTS.md"), "utf8");
      expect(instructions).toContain("region=hook-fallbacks");
      expect(instructions.split("pack-a-hook/src/hook.sh").length - 1).toBe(1);
      expect(instructions.split("pack-b-hook/src/hook.sh").length - 1).toBe(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("refuses to write from an incomplete desired-state graph", () => {
    writeHookPackage("pack-a-hook");
    const settingsPath = nodePath.join(baseDir, ".claude", "settings.json");
    const layer = makeTestLayer({
      graph: {
        complete: false,
        nodes: [packHookNode("pack-a-hook", "pack-a")],
        problems: [
          {
            type: "pack-manifest-unavailable",
            pack: `${OWNER}/packs/pack-a`,
            path: ".axm/extensions/@acme/packs/pack-a/pack.json",
          },
        ],
      },
      locked: decodeLockMap({ "pack-a-hook": registryLock("pack-a-hook") }),
      configuredAgents: ["claude-code"],
    });
    return Effect.gen(function* () {
      const manager = yield* HookManager;
      // The lifecycle reconcile defers without writing; a mid-closure graph
      // completes later in the same plan.
      yield* manager.reconcileProjections();
      expect(nodeFs.existsSync(settingsPath)).toBe(false);
      // The strict sync reconcile reports the incomplete graph instead.
      const error = yield* manager.reconcileHooksProjections.pipe(Effect.flip);
      expect(error.code).toBe("conflict");
      expect(nodeFs.existsSync(settingsPath)).toBe(false);
    }).pipe(Effect.provide(layer));
  });
});
