import { toAppError } from "../app-error/conversions.js";
/**
 * Regression tests for graph-derived Rules region rendering.
 *
 * The managed Rules region is an aggregate ownership unit: every write must
 * render the complete contributor set from the desired-state graph, including
 * Pack-contributed rules that never appear in settings. These tests cover the
 * multi-pack install, cross-pack removal, authored-edit staleness, and
 * incomplete-graph cases behind the last-writer-wins projection defect.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as Schema from "effect/Schema";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { RulesLockMapSchema, type RulesLockMap } from "@agentxm/workspace-state";
import { computeMaterializedTreeIntegritySync } from "../test-helpers.js";
import { SourceHostProviders } from "@agentxm/extension-sources";
import {
  applyPlannedProjections,
  observeProjectionPlans,
  RuleManager,
} from "@agentxm/extension-workspace";
import type { SourceHostProvidersService } from "@agentxm/extension-sources";
import type { DesiredExtensionNode, DesiredStateGraph } from "@agentxm/workspace-state";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock } from "@agentxm/workspace-state/testing";
import { WorkspaceCatalogLive } from "../cli-runtime/workspace-catalog-live.js";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { RuleManagerLive } from "./manager.js";

const OWNER = "@acme";

const providersStub: SourceHostProvidersService = {
  resolveNamedRegistry: () => Effect.die("not used"),
  find: () => Effect.die("not used"),
  fetch: () => Effect.die("not used"),
  cloneUrl: () => Option.none(),
  origin: () => "registry",
};

const decodeLockMap = Schema.decodeUnknownSync(RulesLockMapSchema);

const registryLock = (baseDir: string, name: string, version = "1.0.0") => ({
  type: "registry",
  sourceType: "registry",
  endpoint: "https://registry.agentxm.ai",
  extensionType: "rule",
  workspaceName: name,
  packageFormat: "agentxm",
  owner: OWNER,
  name,
  resolvedVersion: version,
  integrity: "sha512-stub",
  sourceName: "agentxm",
  publisherBindingId: "hbnd_test",
  treeIntegrity: computeMaterializedTreeIntegritySync(
    nodePath.join(baseDir, "agent_extensions", "agentxm", OWNER, "rules", name),
  ),
});

const settingsRuleNode = (name: string): DesiredExtensionNode => ({
  type: "rule",
  name,
  identity: `${OWNER}/rules/${name}`,
  source: `agentxm:${OWNER}/rules/${name}`,
  enabled: true,
  constraints: [],
  origins: [{ type: "settings", source: `agentxm:${OWNER}/rules/${name}`, enabled: true }],
});

const workspaceRuleNode = (name: string): DesiredExtensionNode => ({
  type: "rule",
  name,
  identity: `workspace:${OWNER}/rules/${name}`,
  source: "workspace",
  enabled: true,
  constraints: [],
  origins: [{ type: "settings", source: "workspace", enabled: true }],
});

const packRuleNode = (name: string, pack: string): DesiredExtensionNode => ({
  type: "rule",
  name,
  identity: `${OWNER}/rules/${name}`,
  source: `${OWNER}/rules/${name}@^1.0.0`,
  enabled: true,
  constraints: ["^1.0.0"],
  origins: [
    {
      type: "pack",
      pack: `${OWNER}/packs/${pack}`,
      manifestPath: `/workspace/agent_extensions/agentxm/${OWNER}/packs/${pack}/pack.json`,
      source: `${OWNER}/rules/${name}`,
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

describe("RuleManager graph-derived region projection", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-rules-projection-"));
  });

  afterEach(() => {
    nodeFs.rmSync(baseDir, { recursive: true, force: true });
  });

  const writeRulePackage = (
    name: string,
    options?: {
      readonly version?: string;
      readonly priority?: number;
      readonly body?: string;
    },
  ) => {
    const root = nodePath.join(baseDir, "agent_extensions", "agentxm", OWNER, "rules", name);
    nodeFs.mkdirSync(nodePath.join(root, "src"), { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(root, "rule.json"),
      JSON.stringify({
        type: "rule",
        owner: OWNER,
        name,
        version: options?.version ?? "1.0.0",
        ...(options?.priority === undefined ? {} : { priority: options.priority }),
      }),
    );
    nodeFs.writeFileSync(
      nodePath.join(root, "src", "RULE.md"),
      options?.body ?? `Guidance for ${name}.`,
    );
  };

  const writeAuthoredRulePackage = (
    name: string,
    options?: {
      readonly version?: string;
      readonly body?: string;
    },
  ) => {
    const root = nodePath.join(baseDir, "rules", name);
    nodeFs.mkdirSync(nodePath.join(root, "src"), { recursive: true });
    nodeFs.writeFileSync(
      nodePath.join(root, "rule.json"),
      JSON.stringify({
        type: "rule",
        owner: OWNER,
        name,
        version: options?.version ?? "1.0.0",
      }),
    );
    nodeFs.writeFileSync(
      nodePath.join(root, "src", "RULE.md"),
      options?.body ?? `Guidance for ${name}.`,
    );
  };

  const makeTestLayer = (args: {
    readonly graph: DesiredStateGraph;
    readonly locked: RulesLockMap;
  }) => {
    const wsMock = makeBaseWorkspaceMock(nodePath.join(baseDir, ".axm"), {
      getDesiredStateGraph: () => Effect.succeed(args.graph),
      getLockedRules: () => Effect.succeed(args.locked),
      getInstructionsConfig: () => Effect.succeed(Option.some({})),
      getConfiguredAgents: () => Effect.succeed([]),
      // The writer must never derive membership from settings entries.
      getConfiguredRuleEntries: () => Effect.succeed({}),
    });
    return RuleManagerLive.pipe(
      Layer.provideMerge(WorkspaceCatalogLive),
      Layer.provideMerge(CodingAgentRepositoryLive),
      Layer.provide(Layer.succeed(WorkspaceMutations, wsMock)),
      Layer.provide(Layer.succeed(SourceHostProviders, providersStub)),
      Layer.provide(Layer.merge(NodeServices.layer, FetchHttpClient.layer)),
    );
  };

  const instructionsPath = () => nodePath.join(baseDir, "AGENTS.md");
  const readInstructions = () => nodeFs.readFileSync(instructionsPath(), "utf8");
  const markerCount = (content: string, name: string): number =>
    content.split(`axm:point v=1 ext=${OWNER}/rules/${name}@`).length - 1;

  it.effect("renders direct and two-pack contributors exactly once each", () => {
    writeRulePackage("direct-rule", { priority: 10 });
    writeRulePackage("pack-a-rule");
    writeRulePackage("pack-b-rule");
    const layer = makeTestLayer({
      graph: completeGraph([
        settingsRuleNode("direct-rule"),
        packRuleNode("pack-a-rule", "pack-a"),
        packRuleNode("pack-b-rule", "pack-b"),
      ]),
      locked: decodeLockMap({
        "direct-rule": registryLock(baseDir, "direct-rule"),
        "pack-a-rule": registryLock(baseDir, "pack-a-rule"),
        "pack-b-rule": registryLock(baseDir, "pack-b-rule"),
      }),
    });
    return Effect.gen(function* () {
      const manager = yield* RuleManager;
      yield* applyPlannedProjections(manager);
      const content = readInstructions();
      expect(markerCount(content, "direct-rule")).toBe(1);
      expect(markerCount(content, "pack-a-rule")).toBe(1);
      expect(markerCount(content, "pack-b-rule")).toBe(1);
      expect(content).toContain("Guidance for pack-a-rule.");
      expect(content).toContain("Guidance for pack-b-rule.");
      // priority 10 renders before the default-priority pack rules
      expect(content.indexOf("direct-rule@")).toBeLessThan(content.indexOf("pack-a-rule@"));
    }).pipe(Effect.provide(layer));
  });

  it.effect("keeps other packs' rules when one pack's contribution leaves the graph", () => {
    writeRulePackage("pack-a-rule");
    writeRulePackage("pack-b-rule");
    const before = makeTestLayer({
      graph: completeGraph([
        packRuleNode("pack-a-rule", "pack-a"),
        packRuleNode("pack-b-rule", "pack-b"),
      ]),
      locked: decodeLockMap({
        "pack-a-rule": registryLock(baseDir, "pack-a-rule"),
        "pack-b-rule": registryLock(baseDir, "pack-b-rule"),
      }),
    });
    const after = makeTestLayer({
      graph: completeGraph([packRuleNode("pack-b-rule", "pack-b")]),
      locked: decodeLockMap({ "pack-b-rule": registryLock(baseDir, "pack-b-rule") }),
    });
    return Effect.gen(function* () {
      yield* Effect.gen(function* () {
        const manager = yield* RuleManager;
        yield* applyPlannedProjections(manager);
      }).pipe(Effect.provide(before));
      expect(markerCount(readInstructions(), "pack-a-rule")).toBe(1);
      yield* Effect.gen(function* () {
        const manager = yield* RuleManager;
        yield* applyPlannedProjections(manager);
      }).pipe(Effect.provide(after));
      const content = readInstructions();
      expect(markerCount(content, "pack-a-rule")).toBe(0);
      expect(markerCount(content, "pack-b-rule")).toBe(1);
    });
  });

  it.effect("reads an incomplete contributor set from the managed region", () => {
    writeRulePackage("pack-a-rule");
    writeRulePackage("pack-b-rule");
    const layer = makeTestLayer({
      graph: completeGraph([
        packRuleNode("pack-a-rule", "pack-a"),
        packRuleNode("pack-b-rule", "pack-b"),
      ]),
      locked: decodeLockMap({
        "pack-a-rule": registryLock(baseDir, "pack-a-rule"),
        "pack-b-rule": registryLock(baseDir, "pack-b-rule"),
      }),
    });
    return Effect.gen(function* () {
      const manager = yield* RuleManager;
      yield* applyPlannedProjections(manager);
      nodeFs.writeFileSync(
        instructionsPath(),
        `${readInstructions().replace(
          "<!-- axm:point v=1 ext=@acme/rules/pack-b-rule@1.0.0 kind=rule -->\n\nGuidance for pack-b-rule.",
          "",
        )}\n<!-- axm:point v=1 ext=@acme/rules/pack-b-rule@1.0.0 kind=rule -->\nUser-owned text outside the region.\n`,
      );

      expect(yield* manager.projectionPlans().pipe(Effect.flatMap(observeProjectionPlans))).toEqual(
        [
          expect.objectContaining({
            current: false,
            present: true,
            expectedContributors: ["@acme/rules/pack-a-rule", "@acme/rules/pack-b-rule"],
            observedContributors: ["@acme/rules/pack-a-rule"],
          }),
        ],
      );
    }).pipe(Effect.provide(layer));
  });

  it.effect("re-renders an authored body edit and converges on repeat runs", () => {
    writeAuthoredRulePackage("edited-rule", { body: "Original guidance." });
    const layer = makeTestLayer({
      graph: completeGraph([workspaceRuleNode("edited-rule")]),
      locked: decodeLockMap({}),
    });
    return Effect.gen(function* () {
      const manager = yield* RuleManager;
      yield* applyPlannedProjections(manager);
      expect(readInstructions()).toContain("Original guidance.");
      writeAuthoredRulePackage("edited-rule", {
        body: "Updated guidance.",
        version: "1.1.0",
      });
      yield* applyPlannedProjections(manager);
      const content = readInstructions();
      expect(content).toContain("Updated guidance.");
      expect(content).not.toContain("Original guidance.");
      expect(content).toContain("edited-rule@1.1.0");
      yield* applyPlannedProjections(manager);
      expect(readInstructions()).toBe(content);
    }).pipe(Effect.provide(layer));
  });

  it.effect("refuses to project an acquired package whose tree differs from its lock", () => {
    writeRulePackage("drifted-rule", { body: "Accepted guidance." });
    const layer = makeTestLayer({
      graph: completeGraph([settingsRuleNode("drifted-rule")]),
      locked: decodeLockMap({ "drifted-rule": registryLock(baseDir, "drifted-rule") }),
    });
    return Effect.gen(function* () {
      const manager = yield* RuleManager;
      yield* applyPlannedProjections(manager);
      const acceptedProjection = readInstructions();
      writeRulePackage("drifted-rule", { body: "Unaccepted edit." });
      const error = yield* applyPlannedProjections(manager).pipe(Effect.flip);
      expect(toAppError(error).code).toBe("conflict");
      expect(toAppError(error).detail).toContain("does not match the accepted lock entry");
      expect(readInstructions()).toBe(acceptedProjection);
    }).pipe(Effect.provide(layer));
  });

  it.effect("renders a rule reached both directly and through a pack exactly once", () => {
    writeRulePackage("dual-route-rule");
    const direct = settingsRuleNode("dual-route-rule");
    const viaPack = packRuleNode("dual-route-rule", "pack-a");
    const layer = makeTestLayer({
      graph: completeGraph([
        {
          ...direct,
          constraints: viaPack.constraints,
          origins: [...direct.origins, ...viaPack.origins],
        },
      ]),
      locked: decodeLockMap({ "dual-route-rule": registryLock(baseDir, "dual-route-rule") }),
    });
    return Effect.gen(function* () {
      const manager = yield* RuleManager;
      yield* applyPlannedProjections(manager);
      expect(markerCount(readInstructions(), "dual-route-rule")).toBe(1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("refuses to write from an incomplete desired-state graph", () => {
    writeRulePackage("pack-a-rule");
    nodeFs.writeFileSync(instructionsPath(), "# Project\n");
    const layer = makeTestLayer({
      graph: {
        complete: false,
        nodes: [packRuleNode("pack-a-rule", "pack-a")],
        problems: [
          {
            type: "pack-manifest-unavailable",
            pack: `${OWNER}/packs/pack-a`,
            path: "agent_extensions/agentxm/@acme/packs/pack-a/pack.json",
          },
        ],
      },
      locked: decodeLockMap({ "pack-a-rule": registryLock(baseDir, "pack-a-rule") }),
    });
    return Effect.gen(function* () {
      const manager = yield* RuleManager;
      const error = yield* applyPlannedProjections(manager).pipe(Effect.flip);
      expect(toAppError(error).code).toBe("conflict");
      expect(readInstructions()).toBe("# Project\n");
    }).pipe(Effect.provide(layer));
  });
});
