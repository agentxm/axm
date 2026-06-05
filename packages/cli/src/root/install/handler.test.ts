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
  InstallCommandCommandWorkflowActions,
  type InstallCommandHandlerArgs,
} from "../commands/install/command-actions.js";
import {
  InstallFilesCommandWorkflowActions,
  type InstallFilesHandlerArgs,
} from "../files/install/command-actions.js";
import {
  InstallHookCommandWorkflowActions,
  type InstallHookHandlerArgs,
} from "../hooks/install/command-actions.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "../mcps/install/command-actions.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "../packs/install/command-actions.js";
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
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";

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

    const commandActions = {
      parseArgs: (args: InstallCommandHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "command",
            source: args.source,
            yes: args.yes,
            force: args.force,
            preview: args.preview,
          });
          return {};
        }),
      resolveSourceRequests: () => Effect.succeed([]),
      discoverRefs: () => Effect.succeed([]),
      finalizeIntent: () => Effect.succeed({}),
      buildPlan: () => Effect.succeed(makePlan("command")),
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

    const contextActions = {
      parseArgs: (args: InstallFilesHandlerArgs) =>
        Effect.sync(() => {
          calls.push({
            type: "files",
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
      buildPlan: () => Effect.succeed(makePlan("files")),
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
      buildPlan: () => Effect.succeed(makePlan("pack")),
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
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallSkillCommandWorkflowActions,
        skillActions as unknown as ServiceMap.Service.Shape<
          typeof InstallSkillCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallCommandCommandWorkflowActions,
        commandActions as unknown as ServiceMap.Service.Shape<
          typeof InstallCommandCommandWorkflowActions
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
        InstallFilesCommandWorkflowActions,
        contextActions as unknown as ServiceMap.Service.Shape<
          typeof InstallFilesCommandWorkflowActions
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
        InstallRuleCommandWorkflowActions,
        ruleActions as unknown as ServiceMap.Service.Shape<
          typeof InstallRuleCommandWorkflowActions
        >,
      ),
    );

    return {
      provide: makeEffectProvide(fullLayer),
      logs: ctx.logs,
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
        "@acme/commands/release-notes",
        "@acme/mcps/dev-server",
        "@ac/files/workspace-baseline",
        "@acme/rules/review-policy",
        "@acme/hooks/tool-audit",
        "@acme/subagents/researcher",
        "@acme/packs/frontend-tools",
      ] as const;

      yield* Effect.forEach(sources, (source) =>
        provide(handleInstall({ source: Option.some(source), ...flags })),
      );

      expect(calls).toEqual([
        { type: "skill", source: "@acme/skills/code-review", ...flags },
        { type: "command", source: "@acme/commands/release-notes", ...flags },
        { type: "mcp-server", source: "@acme/mcps/dev-server", ...flags },
        { type: "files", source: "@ac/files/workspace-baseline", ...flags },
        { type: "rule", source: "@acme/rules/review-policy", ...flags },
        { type: "hook", source: "@acme/hooks/tool-audit", ...flags },
        { type: "subagent", source: "@acme/subagents/researcher", ...flags },
        { type: "pack", source: "@acme/packs/frontend-tools", ...flags },
      ]);
    }),
  );

  it.effect("includes workspace generator writes in files install JSON output", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const { provide, rendererState } = makeLayers(calls, { machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: [],
        owner: "@axm",
      });
      fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(tempDir, "src", "index.ts"), "");
      fs.writeFileSync(
        path.join(tempDir, "README.md"),
        [
          "# Project",
          "<!-- axm:start region=files generator=file-index -->",
          "old",
          "<!-- axm:end region=files generator=file-index -->",
          "",
        ].join("\n"),
      );

      yield* provide(
        handleInstall({
          source: Option.some("@ac/files/workspace-baseline"),
          yes: true,
          force: false,
          preview: false,
        }),
      );

      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Install files",
        totalSteps: 2,
        appliedCount: 2,
      });
      expect(result).toMatchObject({
        steps: [
          {
            label: "files",
            status: "applied",
          },
          {
            label: "workspace generator regions",
            status: "applied",
            artifact: {
              scope: "project",
              change: "updated",
              fileCount: 1,
              targets: [{ path: "workspace generator regions", change: "updated" }],
            },
          },
        ],
      });
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
        { type: "command", source: "github:acme/extensions", ...flags },
        {
          type: "files",
          source: "github:acme/extensions",
          yes: false,
          force: false,
          preview: true,
        },
        { type: "rule", source: "github:acme/extensions", yes: false, force: false, preview: true },
        { type: "hook", source: "github:acme/extensions", yes: false, force: false, preview: true },
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

  it.effect("rejects shorthand command declarations on workspace install", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const { provide } = makeLayers(calls);

      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        commands: {
          "example-command": "^1.0.0",
        },
      });

      const error = yield* provide(
        handleInstall({
          source: Option.none(),
          yes: false,
          force: false,
          preview: true,
        }).pipe(Effect.flip),
      );
      const appError = getAppError(error);

      expect(appError.code).toBe("validation");
      expect(appError.detail).toBe('The configured command entry "example-command" is invalid.');
      expect(appError.suggestions?.[0]?.description).toBe(
        'Use a name like "@owner/commands/name".',
      );
    }),
  );
});
