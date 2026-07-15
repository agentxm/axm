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
  UninstallCommandCommandWorkflowActions,
  type UninstallCommandHandlerArgs,
} from "../commands/uninstall/command-actions.js";
import {
  UninstallMcpServerCommandWorkflowActions,
  type UninstallMcpServerHandlerArgs,
} from "../mcps/uninstall/command-actions.js";
import {
  UninstallFilesCommandWorkflowActions,
  type UninstallFilesHandlerArgs,
} from "../files/uninstall/command-actions.js";
import {
  UninstallHookCommandWorkflowActions,
  type UninstallHookHandlerArgs,
} from "../hooks/uninstall/command-actions.js";
import {
  UninstallLibraryCommandWorkflowActions,
  type UninstallLibraryHandlerArgs,
} from "../libraries/uninstall/command-actions.js";
import {
  UninstallKnowledgeCommandWorkflowActions,
  type UninstallKnowledgeHandlerArgs,
} from "../knowledge/uninstall/command-actions.js";
import {
  UninstallPackCommandWorkflowActions,
  type UninstallPackHandlerArgs,
} from "../packs/uninstall/command-actions.js";
import {
  UninstallSkillCommandWorkflowActions,
  type UninstallHandlerArgs,
} from "../skills/uninstall/command-actions.js";
import {
  UninstallSubagentCommandWorkflowActions,
  type UninstallSubagentHandlerArgs,
} from "../subagents/uninstall/command-actions.js";
import {
  UninstallRuleCommandWorkflowActions,
  type UninstallRuleHandlerArgs,
} from "../rules/uninstall/command-actions.js";
import {
  expectAppliedPlanResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";

import { handleUninstall, type RootUninstallFlags } from "./handler.js";

interface UninstallCall {
  readonly type: string;
  readonly name: string;
}

describe("root uninstall handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-uninstall-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makePlan = (label: string) => ({
    _tag: "Plan" as const,
    name: `Uninstall ${label}`,
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
              message: `Uninstalled ${label}`,
            }),
          },
        ],
      },
    ],
  });

  const makeLayers = (
    calls: Array<UninstallCall>,
    opts?: { readonly machine?: boolean | undefined },
  ) => {
    const ctx = makeWorkspaceHandlerTestContext({
      flags: { nonInteractive: true },
      machine: opts?.machine,
    });

    const skillActions = {
      parseArgs: (args: UninstallHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "skill", name: args.skill });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("skill")),
    };

    const commandActions = {
      parseArgs: (args: UninstallCommandHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "command", name: args.commandName });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("command")),
    };

    const mcpServerActions = {
      parseArgs: (args: UninstallMcpServerHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "mcp-server", name: args.serverName });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("mcp-server")),
    };

    const subagentActions = {
      parseArgs: (args: UninstallSubagentHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "subagent", name: args.subagent });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("subagent")),
    };

    const filesActions = {
      parseArgs: (args: UninstallFilesHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "files", name: args.name });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("files")),
    };

    const ruleActions = {
      parseArgs: (args: UninstallRuleHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "rule", name: args.name });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("rule")),
    };

    const hookActions = {
      parseArgs: (args: UninstallHookHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "hook", name: args.name });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("hook")),
    };

    const packActions = {
      parseArgs: (args: UninstallPackHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "pack", name: args.name });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("pack")),
    };

    const libraryActions = {
      parseArgs: (args: UninstallLibraryHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "library", name: args.name });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("library")),
    };

    const knowledgeActions = {
      parseArgs: (args: UninstallKnowledgeHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "knowledge", name: args.name });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("knowledge")),
    };

    const fullLayer = Layer.mergeAll(
      ctx.fullLayer,
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallSkillCommandWorkflowActions,
        skillActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallSkillCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallCommandCommandWorkflowActions,
        commandActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallCommandCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallMcpServerCommandWorkflowActions,
        mcpServerActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallMcpServerCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallSubagentCommandWorkflowActions,
        subagentActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallSubagentCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallFilesCommandWorkflowActions,
        filesActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallFilesCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallRuleCommandWorkflowActions,
        ruleActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallRuleCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallHookCommandWorkflowActions,
        hookActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallHookCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallPackCommandWorkflowActions,
        packActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallPackCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallLibraryCommandWorkflowActions,
        libraryActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallLibraryCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        UninstallKnowledgeCommandWorkflowActions,
        knowledgeActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallKnowledgeCommandWorkflowActions
        >,
      ),
    );

    return {
      provide: makeEffectProvide(fullLayer),
      logs: ctx.logs,
      rendererState: ctx.rendererState,
    };
  };

  it.effect(
    "dispatches each supported FQN to the matching uninstall surface using short names",
    () =>
      Effect.gen(function* () {
        const calls: Array<UninstallCall> = [];
        const flags = {
          yes: false,
          force: false,
          preview: true,
        } satisfies RootUninstallFlags;
        const { provide } = makeLayers(calls);
        writeWorkspaceFiles(path.join(tempDir, ".axm"), {
          agents: ["claude-code"],
          owner: "@axm",
        });

        const sources = [
          "@acme/skills/code-review",
          "@acme/commands/release-notes@^1.2.0",
          "@acme/mcps/dev-server",
          "@ac/files/workspace-baseline",
          "@acme/rules/review-policy",
          "@acme/hooks/tool-audit",
          "@acme/subagents/researcher",
          "@acme/packs/frontend-tools",
          "@acme/libraries/frontend-team",
        ] as const;

        yield* Effect.forEach(sources, (source) => provide(handleUninstall({ source, ...flags })));

        expect(calls).toEqual([
          { type: "skill", name: "code-review" },
          { type: "command", name: "release-notes" },
          { type: "mcp-server", name: "dev-server" },
          { type: "files", name: "workspace-baseline" },
          { type: "rule", name: "review-policy" },
          { type: "hook", name: "tool-audit" },
          { type: "subagent", name: "researcher" },
          { type: "pack", name: "frontend-tools" },
          { type: "library", name: "frontend-team" },
        ]);
      }),
  );

  it.effect("rejects invalid FQN with guidance", () =>
    Effect.gen(function* () {
      const calls: Array<UninstallCall> = [];
      const flags = {
        yes: false,
        force: false,
        preview: true,
      } satisfies RootUninstallFlags;
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      const error = yield* provide(
        handleUninstall({ source: "@acme/skills", ...flags }).pipe(Effect.flip),
      );
      const appError = getAppError(error);

      expect(appError.code).toBe("validation");
      expect(calls).toEqual([]);
    }),
  );

  it.effect("emits plan-resolution JSON for root uninstall", () =>
    Effect.gen(function* () {
      const calls: Array<UninstallCall> = [];
      const flags = {
        yes: true,
        force: false,
        preview: false,
      } satisfies RootUninstallFlags;
      const { provide, rendererState } = makeLayers(calls, { machine: true });
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      yield* provide(handleUninstall({ source: "@acme/skills/code-review", ...flags }));

      expect(calls).toEqual([{ type: "skill", name: "code-review" }]);
      const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Uninstall skill",
      });
      expect(result).toMatchObject({
        steps: [
          {
            label: "skill",
            status: "applied",
            message: "Uninstalled skill",
          },
        ],
      });
    }),
  );
});
