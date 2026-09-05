import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import { type UninstallMcpServerHandlerArgs } from "../mcps/uninstall/command-actions.js";
import { type UninstallHookHandlerArgs } from "../hooks/uninstall/command-actions.js";
import { type UninstallKnowledgeHandlerArgs } from "../knowledge/uninstall/command-actions.js";
import { type UninstallPackHandlerArgs } from "../packs/uninstall/command-actions.js";
import { type UninstallHandlerArgs } from "../skills/uninstall/command-actions.js";
import { type UninstallSubagentHandlerArgs } from "../subagents/uninstall/command-actions.js";
import { type UninstallRuleHandlerArgs } from "../rules/uninstall/command-actions.js";
import {
  expectAppliedPlanResult,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";

import {
  handleUninstallWithActions,
  type RootUninstallActions,
  type RootUninstallFlags,
} from "./handler.js";

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

    const knowledgeActions = {
      parseArgs: (args: UninstallKnowledgeHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "knowledge", name: args.name });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("knowledge")),
    };

    const actions = {
      skill: skillActions as unknown as RootUninstallActions["skill"],
      mcpServer: mcpServerActions as unknown as RootUninstallActions["mcpServer"],
      subagent: subagentActions as unknown as RootUninstallActions["subagent"],
      rule: ruleActions as unknown as RootUninstallActions["rule"],
      hook: hookActions as unknown as RootUninstallActions["hook"],
      pack: packActions as unknown as RootUninstallActions["pack"],
      knowledge: knowledgeActions as unknown as RootUninstallActions["knowledge"],
    } satisfies RootUninstallActions;

    return {
      provide: makeEffectProvide(ctx.fullLayer),
      handleUninstall: (args: Parameters<typeof handleUninstallWithActions>[0]) =>
        handleUninstallWithActions(args, actions),
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
          preview: true,
        } satisfies RootUninstallFlags;
        const { provide, handleUninstall } = makeLayers(calls);
        writeWorkspaceFiles(path.join(tempDir, ".axm"), {
          agents: ["claude-code"],
          owner: "@axm",
        });

        const sources = [
          "@acme/skills/code-review",
          "@acme/mcps/dev-server",
          "@acme/rules/review-policy",
          "@acme/hooks/tool-audit",
          "@acme/subagents/researcher",
          "@acme/packs/frontend-tools",
        ] as const;

        yield* Effect.forEach(sources, (source) => provide(handleUninstall({ source, ...flags })));

        expect(calls).toEqual([
          { type: "skill", name: "code-review" },
          { type: "mcp-server", name: "dev-server" },
          { type: "rule", name: "review-policy" },
          { type: "hook", name: "tool-audit" },
          { type: "subagent", name: "researcher" },
          { type: "pack", name: "frontend-tools" },
        ]);
      }),
  );

  it.effect("rejects invalid FQN with guidance", () =>
    Effect.gen(function* () {
      const calls: Array<UninstallCall> = [];
      const flags = {
        yes: false,
        preview: true,
      } satisfies RootUninstallFlags;
      const { provide, handleUninstall } = makeLayers(calls);
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
        preview: false,
      } satisfies RootUninstallFlags;
      const { provide, handleUninstall, rendererState } = makeLayers(calls, { machine: true });
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
        units: [
          {
            id: "skill",
            label: "skill",
            state: "committed",
            message: "Uninstalled skill",
          },
        ],
      });
    }),
  );
});
