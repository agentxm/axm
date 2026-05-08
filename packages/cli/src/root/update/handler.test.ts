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
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "../mcp-servers/install/command-actions.js";
import {
  InstallPackCommandWorkflowActions,
  type InstallPackHandlerArgs,
} from "../packs/install/command-actions.js";
import {
  InstallSkillCommandWorkflowActions,
  type InstallSkillSourceHandlerArgs,
} from "../skills/install/command-actions.js";
import {
  InstallSubagentCommandWorkflowActions,
  type InstallSubagentSourceHandlerArgs,
} from "../subagents/install/command-actions.js";
import {
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";

import { handleUpdate, type RootUpdateFlags } from "./handler.js";

interface UpdateCall extends RootUpdateFlags {
  readonly source: string;
  readonly type: string;
}

describe("root update handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-update-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makePlan = (label: string) => ({
    _tag: "Plan" as const,
    name: `Update ${label}`,
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
              message: `Updated ${label}`,
            }),
          },
        ],
      },
    ],
  });

  const makeLayers = (calls: Array<UpdateCall>) => {
    const ctx = makeWorkspaceHandlerTestContext({ flags: { nonInteractive: true } });

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
        InstallSubagentCommandWorkflowActions,
        subagentActions as unknown as ServiceMap.Service.Shape<
          typeof InstallSubagentCommandWorkflowActions
        >,
      ),
      // Assertion needed: workflow action test doubles satisfy the service contracts for this dispatch test.
      Layer.succeed(
        InstallPackCommandWorkflowActions,
        packActions as unknown as ServiceMap.Service.Shape<
          typeof InstallPackCommandWorkflowActions
        >,
      ),
    );

    return { provide: makeEffectProvide(fullLayer) };
  };

  it.effect("dispatches each supported FQN to the matching update surface", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const flags = {
        yes: false,
        force: false,
        preview: true,
      } satisfies RootUpdateFlags;
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      const sources = [
        "@acme/skills/code-review",
        "@acme/commands/release-notes",
        "@acme/mcp-servers/dev-server",
        "@acme/subagents/researcher",
        "@acme/packs/frontend-tools",
      ] as const;

      yield* Effect.forEach(sources, (source) =>
        provide(handleUpdate({ source: Option.some(source), ...flags })),
      );

      expect(calls).toEqual([
        { type: "skill", source: "@acme/skills/code-review", ...flags },
        { type: "command", source: "@acme/commands/release-notes", ...flags },
        { type: "mcp-server", source: "@acme/mcp-servers/dev-server", ...flags },
        { type: "subagent", source: "@acme/subagents/researcher", ...flags },
        { type: "pack", source: "@acme/packs/frontend-tools", ...flags },
      ]);
    }),
  );

  it.effect("rejects invalid FQN with guidance", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide } = makeLayers(calls);
      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
      });

      const error = yield* provide(
        handleUpdate({
          source: Option.some("./local-path"),
          yes: false,
          force: false,
          preview: true,
        }).pipe(Effect.flip),
      );
      const appError = getAppError(error);

      expect(appError.code).toBe("usage");
      expect(calls).toHaveLength(0);
    }),
  );

  it.effect("rejects shorthand command declarations on workspace update", () =>
    Effect.gen(function* () {
      const calls: Array<UpdateCall> = [];
      const { provide } = makeLayers(calls);

      writeWorkspaceFiles(path.join(tempDir, ".axm"), {
        agents: ["claude-code"],
        owner: "@axm",
        commands: {
          "example-command": "^1.0.0",
        },
      });

      const error = yield* provide(
        handleUpdate({
          source: Option.none(),
          yes: false,
          force: false,
          preview: true,
        }).pipe(Effect.flip),
      );
      const appError = getAppError(error);

      expect(appError.code).toBe("validation");
      expect(appError.message).toBe('The configured command entry "example-command" is invalid.');
      expect(appError.breadcrumbs?.[0]?.description).toBe(
        'Use a name like "@owner/commands/name".',
      );
    }),
  );
});
