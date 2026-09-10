import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
} from "@agentxm/workspace-operations";
import {
  deriveOperationOutcome,
  operationPresentation,
  type Plan,
} from "@agentxm/workspace-operations";
import { runInstallCommandWorkflow } from "@agentxm/extension-lifecycle";

import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "./command-actions.js";
import { makeAppError } from "../../../app-error/index.js";

export interface InstallMcpServerFlags {
  readonly force: boolean;
  readonly preview: boolean;
}

export interface McpServerInstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly localName?: Option.Option<string>;
  readonly env: ReadonlyArray<string>;
}

export const handleInstallMcpServer = (
  args: McpServerInstallHandlerArgs,
  flags: InstallMcpServerFlags,
) =>
  withOperationLifecycle(
    {
      command: "mcps.install",
      mode: flags.preview ? "preview" : "apply",
      planName: "Install MCP servers",
    },
    handleInstallMcpServerBody(args, flags),
  );

const handleInstallMcpServerBody = (
  args: McpServerInstallHandlerArgs,
  flags: InstallMcpServerFlags,
) =>
  Effect.gen(function* () {
    const localName = args.localName ?? Option.none<string>();
    if (Option.isNone(args.source)) {
      if (Option.isSome(localName)) {
        return yield* makeAppError({
          code: "usage",
          detail: "--as requires an MCP server source",
        });
      }
      return yield* handleWorkspaceInstall({
        command: "mcps.install",
        type: Option.some("mcp-server"),
        planName: "Install MCP servers",
        planDescription: Option.some("Install configured MCP servers"),
        flags,
      });
    }

    const actions = yield* InstallMcpServerCommandWorkflowActions;
    const sourceArgs: InstallMcpServerHandlerArgs = {
      source: args.source.value,
      ...(Option.isSome(localName) ? { localName: localName.value } : {}),
      env: args.env,
      force: flags.force,
    };
    const execution = yield* makeInstallPlanExecution(
      flags,
      ["mcps", "install"],
      [args.source.value],
      [
        ...Option.match(localName, {
          onNone: () => [],
          onSome: (name) => [recoveryOption("--as", publicRecoveryValue(name))],
        }),
        ...args.env.map(() => recoveryOption("--env", protectedRecoveryValue())),
      ],
    );
    const resolution = yield* runInstallCommandWorkflow(sourceArgs, actions, {
      execution,
      transformPlan: (plan) =>
        Effect.succeed({
          ...plan,
          presentation: operationPresentation(
            { imperative: "install", past: "Installed", gerund: "Installing" },
            "mcp-server",
          ),
        } satisfies Plan),
    });
    if (deriveOperationOutcome(resolution) === "no-op" && resolution.units.length === 0) {
      yield* emitNoOpOutcome("mcps.install", {
        planName: resolution.name,
        message: "No MCP servers installed.",
      });
      return;
    }
    yield* emitOperationResolution("mcps.install", resolution, {
      suggestions: [{ description: "Inspect MCP servers", cmd: "axm mcps list" }],
    });
  });
