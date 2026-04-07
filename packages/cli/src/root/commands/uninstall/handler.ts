/**
 * Uninstall command handler - Effect-based orchestration for `axm commands uninstall`.
 *
 * Delegates to shared uninstall command workflow via UninstallCommandCommandWorkflowActions.
 * When `--preview` is active, displays which rendered files per agent would be removed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { runUninstallCommandWorkflow } from "@axm.sh/core/unstable/workflows";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

import { emitPlanResolutionResult } from "../../../json-output.js";
import {
  UninstallCommandCommandWorkflowActions,
  type UninstallCommandHandlerArgs,
} from "./command-actions.js";

/**
 * Display preview information about which rendered files per agent would be removed.
 */
const displayUninstallPreviewInfo = (commandName: string) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const renderer = yield* CliRenderer;

    const lockEntryOption = yield* ws.getLockedCommand(commandName);
    if (Option.isNone(lockEntryOption)) {
      yield* renderer.info(`Command "${commandName}" has no lockfile entry.`);
      return;
    }

    const lockEntry = lockEntryOption.value;

    // Show affected agents
    if (lockEntry.agents && lockEntry.agents.length > 0) {
      yield* renderer.info(
        `Affected agents:\n${lockEntry.agents.map((a: string) => `  - ${a}`).join("\n")}`,
      );
    }

    // Show rendered files that would be removed
    if (lockEntry.renderedFiles) {
      const entries = Object.entries(lockEntry.renderedFiles);
      if (entries.length > 0) {
        const filesByAgent = entries
          .map(([agentId, files]) => {
            const filePaths = files.map((f: { path: string }) => `    - ${f.path}`).join("\n");
            return `  ${agentId}:\n${filePaths}`;
          })
          .join("\n");
        yield* renderer.info(`Files that would be removed:\n${filesByAgent}`);
      }
    }
  });

/**
 * Handles the `axm commands uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstallCommand = (
  args: UninstallCommandHandlerArgs,
  flags: { yes: boolean; force: boolean; preview: boolean },
) =>
  Effect.gen(function* () {
    // Display preview info about affected agents and files
    if (flags.preview) {
      yield* displayUninstallPreviewInfo(args.commandName);
    }

    const actions = yield* UninstallCommandCommandWorkflowActions;
    const resolution = yield* runUninstallCommandWorkflow(args, actions, flags);
    yield* emitPlanResolutionResult("commands.uninstall", resolution);
  });
