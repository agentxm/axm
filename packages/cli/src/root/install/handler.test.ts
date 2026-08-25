import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/Context";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import {
  InstallHookCommandWorkflowActions,
  type InstallHookHandlerArgs,
} from "../hooks/install/command-actions.js";
import {
  InstallKnowledgeCommandWorkflowActions,
  type InstallKnowledgeHandlerArgs,
} from "../knowledge/install/command-actions.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "../mcps/install/command-actions.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "../packs/install/command-actions.js";
import type { InstallPackCommandIntent } from "../packs/install/intent.js";
import {
  InstallRuleCommandWorkflowActions,
  type InstallRuleHandlerArgs,
} from "../rules/install/command-actions.js";
import {
  InstallSkillCommandWorkflowActions,
  type InstallSkillSourceHandlerArgs,
} from "../skills/install/command-actions.js";
import {
  InstallSubagentCommandWorkflowActions,
  type InstallSubagentSourceHandlerArgs,
} from "../subagents/install/command-actions.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
} from "../../test-helpers.js";
import { writeKnowledgeExtension, writeWorkspaceFiles } from "../../test-stubs.js";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { HookManagerLive } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManagerLive } from "@agentxm/client-core/unstable/knowledge";
import { RuleManagerLive } from "@agentxm/client-core/unstable/rules";

import { handleInstall, type RootInstallFlags } from "./handler.js";

interface InstallCall extends RootInstallFlags {
  readonly source: string;
  readonly type: string;
}

describe("root install handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makePlan = (label: string) => ({
    _tag: "Plan" as const,
    name: `Install ${label}`,
    description: Option.none<string>(),
    jobs: [
      {
        concurrency: 1 as const,
        steps: [
          {
            readiness: "ready" as const,
            label,
            run: Effect.succeed({
              result: "success" as const,
              message: `Installed ${label}`,
            }),
          },
        ],
      },
    ],
  });

  const makeLayers = (
    calls: Array<InstallCall>,
    opts?: { readonly machine?: boolean | undefined },
  ) => {
    const ctx = makeWorkspaceHandlerTestContext({
      flags: { nonInteractive: true },
      machine: opts?.machine,
    });
    const packIntents: Array<InstallPackCommandIntent> = [];

    const skillActions = {
      parseArgs: (args: InstallSkillSourceHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "skill",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("skill")),
    };

    const mcpServerActions = {
      parseArgs: (args: InstallMcpServerHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "mcp-server",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("mcp-server")),
    };

    const subagentActions = {
      parseArgs: (args: InstallSubagentSourceHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "subagent",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("subagent")),
    };

    const hookActions = {
      parseArgs: (args: InstallHookHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "hook",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("hook")),
    };

    const packActions = {
      parseArgs: (args: InstallPackHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "pack",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: (intent: InstallPackCommandIntent) =>
        Effect.sync(() => {
          packIntents.push(intent);
          return makePlan("pack");
        }),
    };

    const knowledgeActions = {
      parseArgs: (args: InstallKnowledgeHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "knowledge",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("knowledge")),
    };

    const ruleActions = {
      parseArgs: (args: InstallRuleHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "rule",
            source: args.source,
            yes: false,
            force: false,
            preview: true,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("rule")),
    };

    const fullLayer = Layer.mergeAll(
      ctx.fullLayer,
      Layer.succeed(SourceHostProviders, {
        find: () => Effect.succeed([]),
        resolveNamedRegistry: () => Effect.die("Unexpected named registry resolution"),
        fetch: () => Effect.die("Unexpected source fetch"),
        cloneUrl: () => Option.none(),
        origin: () => "test source",
      }),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallSkillCommandWorkflowActions,
        skillActions as unknown as ServiceMap.Service.Shape<
          typeof InstallSkillCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallMcpServerCommandWorkflowActions,
        mcpServerActions as unknown as ServiceMap.Service.Shape<
          typeof InstallMcpServerCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallSubagentCommandWorkflowActions,
        subagentActions as unknown as ServiceMap.Service.Shape<
          typeof InstallSubagentCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallHookCommandWorkflowActions,
        hookActions as unknown as ServiceMap.Service.Shape<
          typeof InstallHookCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallPackCommandWorkflowActions,
        packActions as unknown as ServiceMap.Service.Shape<
          typeof InstallPackCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallKnowledgeCommandWorkflowActions,
        knowledgeActions as unknown as ServiceMap.Service.Shape<
          typeof InstallKnowledgeCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallRuleCommandWorkflowActions,
        ruleActions as unknown as ServiceMap.Service.Shape<
          typeof InstallRuleCommandWorkflowActions
        >,
      ),
    );
    const layerWithManagers = Layer.provideMerge(
      Layer.mergeAll(HookManagerLive, KnowledgeManagerLive, RuleManagerLive),
      fullLayer,
    );

    return {
      provide: makeEffectProvide(layerWithManagers),
      logs: ctx.logs,
      packIntents,
      rendererState: ctx.rendererState,
    };
  };

  it.effect("dispatches each supported FQN to the matching install surface", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const flags = {
        yes: false,
        force: false,
        preview: true,
      } satisfies RootInstallFlags;
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      const sources = [
        "@acme/skills/code-review",
        "@acme/mcps/dev-server",
        "@acme/rules/review-policy",
        "@acme/hooks/tool-audit",
        "@acme/knowledge/handbook",
        "@acme/subagents/researcher",
        "@acme/packs/frontend-tools",
      ] as const;

      yield* Effect.forEach(sources, (source) =>
        provide(handleInstall({ source: Option.some(source), ...flags })),
      );

      expect(calls).toEqual([
        { type: "skill", source: "@acme/skills/code-review", ...flags },
        { type: "mcp-server", source: "@acme/mcps/dev-server", ...flags },
        { type: "rule", source: "@acme/rules/review-policy", ...flags },
        { type: "hook", source: "@acme/hooks/tool-audit", ...flags },
        { type: "knowledge", source: "@acme/knowledge/handbook", ...flags },
        { type: "subagent", source: "@acme/subagents/researcher", ...flags },
        { type: "pack", source: "@acme/packs/frontend-tools", ...flags },
      ]);
    }),
  );

  it.effect("emits JSON no-op when workspace has no configured extensions to install", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const { provide, logs, rendererState } = makeLayers(calls, { machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      yield* provide(
        handleInstall({
          source: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      expect(calls).toEqual([]);
      expect(logs.success).toEqual([]);
      const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Install configured extensions",
        message: "No configured extensions.",
      });
      expect(result).toMatchObject({
        planDescription: "Install configured workspace extensions",
      });
    }),
  );

  it.effect("ignores configured inline MCP servers during workspace install", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const { provide, rendererState } = makeLayers(calls, { machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        mcps: {
          linear: {
            command: "npx",
            args: ["-y", "linear-mcp-server"],
          },
        },
      });

      yield* provide(
        handleInstall({
          source: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      expect(calls).toEqual([]);
      expectNoOpPlanResult(rendererState.results[0]?.data, {
        planName: "Install configured extensions",
        message: "No configured extensions.",
      });
    }),
  );

  it.effect("installs configured knowledge bundles on workspace install", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const { provide, rendererState } = makeLayers(calls, { machine: true });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        owner: "@acme",
        knowledge: { handbook: "workspace" },
      });
      writeKnowledgeExtension(axmDir, "handbook");

      yield* provide(
        handleInstall({
          source: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Install configured extensions",
        totalSteps: 2,
      });
      expect(planResultUnits(result)).toMatchObject([
        { id: "knowledge", label: "knowledge", state: "committed" },
        {
          id: "projection:aggregate-units",
          label: "shared projections",
          state: "committed",
        },
      ]);
    }),
  );

  it.effect("defers Pack projections to the configured workspace aggregate step", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const { provide, packIntents, rendererState } = makeLayers(calls, { machine: true });
      const axmDir = path.join(tempDir, ".axm");
      writeWorkspaceFiles(axmDir, {
        agents: ["claude-code"],
        owner: "@axm",
        packs: { toolkit: "workspace" },
      });
      const packDir = path.join(tempDir, "packs", "toolkit");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(
        path.join(packDir, "pack.json"),
        JSON.stringify({
          owner: "@axm",
          type: "pack",
          name: "toolkit",
          version: "1.0.0",
          dependencies: {},
        }),
      );

      yield* provide(
        handleInstall({
          source: Option.none(),
          yes: true,
          force: false,
          preview: true,
        }),
      );

      expect(packIntents).toHaveLength(1);
      expect(packIntents[0]?.deferProjections).toBe(true);
      const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Install configured extensions",
        totalSteps: 2,
      });
      expect(planResultUnits(result)).toMatchObject([
        { id: "pack", label: "pack", state: "ready" },
        {
          id: "projection:aggregate-units",
          label: "shared projections",
          state: "ready",
        },
      ]);
    }),
  );

  it.effect("replans a configured Pack immediately before applying it", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const { provide, packIntents, rendererState } = makeLayers(calls, { machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        packs: { toolkit: "workspace" },
      });
      const packDir = path.join(tempDir, "packs", "toolkit");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(
        path.join(packDir, "pack.json"),
        JSON.stringify({
          owner: "@axm",
          type: "pack",
          name: "toolkit",
          version: "1.0.0",
          dependencies: {},
        }),
      );

      yield* provide(
        handleInstall({
          source: Option.none(),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      expect(packIntents).toHaveLength(2);
      expect(packIntents.every((intent) => intent.deferProjections === true)).toBe(true);
      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Install configured extensions",
        totalSteps: 2,
      });
      expect(planResultUnits(result)).toMatchObject([
        { id: "pack", label: "pack", state: "committed" },
        {
          id: "projection:aggregate-units",
          label: "shared projections",
          state: "committed",
        },
      ]);
    }),
  );

  it.effect("dispatches source locators to convention-based install surfaces", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const flags = {
        yes: true,
        force: true,
        preview: true,
      } satisfies RootInstallFlags;
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      yield* provide(handleInstall({ source: Option.some("github:acme/extensions"), ...flags }));

      expect(calls).toEqual([
        {
          type: "skill",
          source: "github:acme/extensions",
          yes: false,
          force: false,
          preview: true,
        },
        { type: "rule", source: "github:acme/extensions", yes: false, force: false, preview: true },
        { type: "hook", source: "github:acme/extensions", yes: false, force: false, preview: true },
        {
          type: "knowledge",
          source: "github:acme/extensions",
          yes: false,
          force: false,
          preview: true,
        },
        {
          type: "subagent",
          source: "github:acme/extensions",
          yes: false,
          force: false,
          preview: true,
        },
      ]);
    }),
  );
});
