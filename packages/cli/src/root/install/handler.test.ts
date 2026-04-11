import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServiceMap from "effect/ServiceMap";
import { describe, expect, it } from "@effect/vitest";
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
import { makeEffectProvide, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";

import { handleInstall, type RootInstallFlags } from "./handler.js";

interface InstallCall extends RootInstallFlags {
  readonly source: string;
  readonly type: string;
}

describe("root install handler", () => {
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

  const makeLayers = (calls: Array<InstallCall>) => {
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

  it.effect("dispatches each supported FQN to the matching install surface", () =>
    Effect.gen(function* () {
      const calls: Array<InstallCall> = [];
      const flags = {
        yes: false,
        force: false,
        preview: true,
      } satisfies RootInstallFlags;
      const { provide } = makeLayers(calls);

      const sources = [
        "@acme/skills/code-review",
        "@acme/commands/release-notes",
        "@acme/mcp-servers/dev-server",
        "@acme/subagents/researcher",
        "@acme/packs/frontend-tools",
      ] as const;

      yield* Effect.forEach(sources, (source) =>
        provide(handleInstall({ source: Option.some(source), ...flags })),
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
});
