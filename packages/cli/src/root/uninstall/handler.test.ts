import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";
import { describe, expect, it } from "@effect/vitest";
import { afterEach, beforeEach } from "vitest";
import {
  UninstallCommandCommandWorkflowActions,
  type UninstallCommandHandlerArgs,
} from "../commands/uninstall/command-actions.js";
import {
  UninstallMcpServerCommandWorkflowActions,
  type UninstallMcpServerHandlerArgs,
} from "../mcp-servers/uninstall/command-actions.js";
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

  const makeLayers = (calls: Array<UninstallCall>) => {
    const ctx = makeWorkspaceHandlerTestContext({ flags: { nonInteractive: true } });

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

    const packActions = {
      parseArgs: (args: UninstallPackHandlerArgs) =>
        Effect.sync(() => {
          calls.push({ type: "pack", name: args.name });
          return {};
        }),
      finalizeIntent: () => Effect.succeed({}),
      buildUninstallPlan: () => Effect.succeed(makePlan("pack")),
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
        UninstallPackCommandWorkflowActions,
        packActions as unknown as ServiceMap.Service.Shape<
          typeof UninstallPackCommandWorkflowActions
        >,
      ),
    );

    return { provide: makeEffectProvide(fullLayer) };
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
          profile: "@axm",
        });

        const sources = [
          "@acme/skills/code-review",
          "@acme/commands/release-notes@^1.2.0",
          "@acme/mcp-servers/dev-server",
          "@acme/subagents/researcher",
          "@acme/packs/frontend-tools",
        ] as const;

        yield* Effect.forEach(sources, (source) => provide(handleUninstall({ source, ...flags })));

        expect(calls).toEqual([
          { type: "skill", name: "code-review" },
          { type: "command", name: "release-notes" },
          { type: "mcp-server", name: "dev-server" },
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
        force: false,
        preview: true,
      } satisfies RootUninstallFlags;
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        profile: "@axm",
      });

      const error = yield* provide(
        handleUninstall({ source: "@acme/skills", ...flags }).pipe(Effect.flip),
      );
      const appError = getAppError(error);

      expect(appError.code).toBe("UNINSTALL_SOURCE_INVALID_FQN");
      expect(calls).toEqual([]);
    }),
  );
});
