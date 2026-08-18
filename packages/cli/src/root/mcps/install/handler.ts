import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import {
  protectedRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
} from "@agentxm/client-core/unstable/cli-runtime";
import { runInstallCommandWorkflow } from "@agentxm/client-core/unstable/workflows";

import { toPlanResolutionResult } from "../../../json-output.js";
import { handleWorkspaceInstall } from "../../install/workspace-install-handler.js";
import { emitAppliedPlanOutcome, unchangedPlanHeadline } from "../../shared/applied-plan-output.js";
import { makeInstallPlanExecution } from "../../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  InstallMcpServerCommandWorkflowActions,
  type InstallMcpServerHandlerArgs,
} from "./command-actions.js";
import type { ConfigurableAgentId } from "@agentxm/client-core/unstable/agent-capabilities";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";

export interface InstallMcpServerFlags {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

export interface McpServerInstallHandlerArgs {
  readonly source: Option.Option<string>;
  readonly env: ReadonlyArray<string>;
  readonly agents?: ReadonlyArray<ConfigurableAgentId>;
}

export const handleInstallMcpServer = (
  args: McpServerInstallHandlerArgs,
  flags: InstallMcpServerFlags,
) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source)) {
      if (args.agents !== undefined) {
        return yield* makeAppError({
          code: "usage",
          detail: "--agent requires an MCP server source",
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
      env: args.env,
      ...(args.agents === undefined ? {} : { agents: args.agents }),
    };
    const execution = yield* makeInstallPlanExecution(
      flags,
      ["mcps", "install"],
      [args.source.value],
      [
        ...args.env.map(() => recoveryOption("--env", protectedRecoveryValue())),
        ...(args.agents ?? []).map((agent) =>
          recoveryOption("--agent", publicRecoveryValue(agent)),
        ),
      ],
    );
    const resolution = yield* runInstallCommandWorkflow(sourceArgs, actions, {
      execution,
      displayApplied: false,
    });
    const result = toPlanResolutionResult(resolution);
    if (result.outcome === "no-op" && result.totalSteps === 0) {
      yield* emitNoOpOutcome("mcps.install", {
        planName: result.planName,
        message: "No MCP servers installed.",
      });
      return;
    }
    yield* emitAppliedPlanOutcome({
      command: "mcps.install",
      headline:
        result.outcome === "no-op"
          ? unchangedPlanHeadline(resolution, "No MCP servers installed.")
          : "Installed MCP server " + args.source.value,
      resolution,
      reportInstallationCoverage: true,
      suggestions: [{ description: "Inspect MCP servers", cmd: "axm mcps list" }],
    });
  });
