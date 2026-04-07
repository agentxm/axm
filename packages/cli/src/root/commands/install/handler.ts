/**
 * Install command handler - Effect-based orchestration for `axm commands install`.
 *
 * Delegates to shared install command workflow via InstallCommandCommandWorkflowActions.
 * When `--preview` is active, displays which agents would receive rendered files
 * and any lossy-rendering warnings before showing the plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { runInstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";
import { CodingAgentRepository } from "@axm.sh/core/unstable/agents";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { selectRenderer } from "@axm.sh/core/unstable/commands";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  InstallCommandCommandWorkflowActions,
  type InstallCommandHandlerArgs,
} from "./command-actions.js";

/**
 * Display preview information about which agents would receive files
 * and any lossy-rendering warnings.
 */
const displayInstallPreviewInfo = (commandName: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;
    const agentRepo = yield* CodingAgentRepository;

    const configuredAgents = yield* agentRepo
      .getConfiguredAgents()
      .pipe(Effect.provideService(Workspace, ws));

    if (configuredAgents.length === 0) {
      yield* renderer.info("No agents configured. No files would be rendered.");
      return;
    }

    // Display which agents would receive files
    yield* renderer.info(
      `Target agents for "${commandName}":\n${configuredAgents.map((a) => `  - ${a.id}`).join("\n")}`,
    );

    // Dry-run rendering to collect lossy warnings (renderers are pure functions)
    const warningsByAgent: Record<string, ReadonlyArray<string>> = {};
    for (const agent of configuredAgents) {
      const rendererFn = selectRenderer(agent.id);
      const output = rendererFn({
        frontmatter: {},
        body: "",
        agentId: agent.id,
        commandName,
      });
      if (output.warnings.length > 0) {
        warningsByAgent[agent.id] = output.warnings
          .filter((w) => w.feature && w.message)
          .map((w) => `${w.feature} - ${w.message}`);
      }
    }

    const agentIds = Object.keys(warningsByAgent);
    if (agentIds.length > 0) {
      const grouped = agentIds
        .map((id) => {
          const agentWarnings = warningsByAgent[id] ?? [];
          return `  ${id}:\n${agentWarnings.map((w) => `    - ${w}`).join("\n")}`;
        })
        .join("\n");
      yield* renderer.warn(`Potential rendering warnings:\n${grouped}`);
    }
  });

/**
 * Handles the `axm commands install` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleInstallCommand = Effect.fn("InstallCommand.handle")(function* (
  args: InstallCommandHandlerArgs,
) {
  // Display preview info about target agents and warnings before running the workflow
  if (args.preview) {
    yield* displayInstallPreviewInfo(args.source);
  }

  const actions = yield* InstallCommandCommandWorkflowActions;
  const resolution = yield* runInstallCommandWorkflow(args, actions, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("commands.install", resolution);
});
