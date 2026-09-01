/**
 * CLI implementation of the workspace-initialization interaction port.
 *
 * Owns the setup prompts and every piece of setup presentation wording: the
 * agent scan summary, retired-agent warnings, the setup-phases banner, and
 * the setup plan and scope-support tables. Prompt cancellations map into the
 * kernel-owned `WorkspaceInitializationCancelled`.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import { autocompleteMultiselect, requireInteractive } from "../cli/prompt/index.js";
import { CliRenderer } from "../cli-renderer/index.js";
import {
  WorkspaceInitializationCancelled,
  WorkspaceInitializationInteraction,
  type WorkspaceInitializationInteractionService,
} from "../workspace-configuration/initialization-interaction.js";

const selectAgentsMessage = "Select agents to configure";
const confirmInstructionSyncMessage =
  "Sync instructions to the selected agents?\n  Updates agent instruction files such as AGENTS.md and CLAUDE.md.";
const selectInstructionSourceMessage =
  "Choose the source file for shared instructions\n  AXM will sync its contents to the selected agents' instruction files.";
const customInstructionSourceMessage = "Source instructions file name";
const confirmSetupPlanMessage = "Proceed?";

const SETUP_PHASES = "Detect · Agents · Instructions · Review";

const CUSTOM_SOURCE_FILE = "__custom__";

const cancelled = (error: { readonly message: string }) =>
  Effect.fail(new WorkspaceInitializationCancelled({ message: error.message }));

export const WorkspaceInitializationInteractionLive = Layer.effect(
  WorkspaceInitializationInteraction,
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const terminal = yield* Terminal.Terminal;
    const promptEnvironment = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fileSystem),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Terminal.Terminal, terminal),
    );

    return {
      selectAgents: ({
        allAgents,
        projectDetectedIds,
        userDetectedIds,
        suggestedIds,
        configuredIds,
      }) =>
        requireInteractive(
          autocompleteMultiselect({
            message: selectAgentsMessage,
            maxPerPage: 10,
            filterLabel: "Filter",
            selectionCountMessage: (selected) =>
              `${selected.length} ${selected.length === 1 ? "agent" : "agents"} selected`,
            submissionMessage: (selected) =>
              `Selected ${selected.length} ${selected.length === 1 ? "agent" : "agents"}`,
            choices: allAgents.map((agent) => ({
              title: agent.name,
              value: agent.id,
              description: [
                configuredIds.includes(agent.id) ? "configured" : undefined,
                projectDetectedIds.includes(agent.id) ? "detected in project" : undefined,
                userDetectedIds.includes(agent.id) ? "detected on workstation" : undefined,
                suggestedIds.includes(agent.id) ? "suggested" : undefined,
                agent.skills === undefined ? "skills: unsupported" : `skills: ${agent.skills.dir}`,
              ]
                .filter((part) => part !== undefined)
                .join(" · "),
              selected:
                configuredIds.includes(agent.id) ||
                projectDetectedIds.includes(agent.id) ||
                suggestedIds.includes(agent.id),
            })),
          }),
          { message: selectAgentsMessage },
        ).pipe(Effect.provide(promptEnvironment), Effect.catchTag("PromptCancelled", cancelled)),
      confirmInstructionSync: ({ enabled }) =>
        requireInteractive(
          Prompt.confirm({ message: confirmInstructionSyncMessage, initial: enabled }),
          { message: confirmInstructionSyncMessage },
        ).pipe(Effect.provide(promptEnvironment), Effect.catchTag("PromptCancelled", cancelled)),
      selectInstructionSource: ({ defaultFileName, choices }) =>
        Effect.gen(function* () {
          yield* Effect.ignore(terminal.display("\n"));
          const selected = yield* requireInteractive(
            Prompt.select({
              message: selectInstructionSourceMessage,
              choices: [
                ...choices.map((choice) => {
                  const description = [
                    choice.fileName === defaultFileName ? "Recommended" : undefined,
                    choice.exists ? "existing" : "will be created",
                    choice.exists ? `${String(choice.lines)} lines` : undefined,
                  ]
                    .filter((part) => part !== undefined)
                    .join(" · ");
                  return {
                    title: choice.fileName,
                    value: choice.fileName,
                    description,
                    selected: choice.fileName === defaultFileName,
                  };
                }),
                {
                  title: "Enter another filename...",
                  value: CUSTOM_SOURCE_FILE,
                },
              ],
            }),
            { message: selectInstructionSourceMessage },
          ).pipe(Effect.provide(promptEnvironment));
          if (selected !== CUSTOM_SOURCE_FILE) return selected;
          yield* Effect.ignore(terminal.display("\n"));
          return yield* requireInteractive(
            Prompt.text({ message: customInstructionSourceMessage }),
            { message: customInstructionSourceMessage },
          ).pipe(Effect.provide(promptEnvironment));
        }).pipe(Effect.catchTag("PromptCancelled", cancelled)),
      confirmSetupPlan: () =>
        requireInteractive(Prompt.confirm({ message: confirmSetupPlanMessage, initial: true }), {
          message: confirmSetupPlanMessage,
        }).pipe(Effect.provide(promptEnvironment), Effect.catchTag("PromptCancelled", cancelled)),
      presentAgentScan: (scan) =>
        Effect.gen(function* () {
          yield* renderer.info(
            `Scanned this repo and your machine - found ${String(scan.detectedCount)} agents.`,
          );
          for (const agent of scan.retiredAgents) {
            yield* renderer.warn(
              `${agent.name} is retired and was not selected automatically. To opt in, run \`axm setup --agent ${agent.id}\`.`,
            );
          }
          yield* renderer.info(SETUP_PHASES);
        }),
      presentSetupPlan: (rows) =>
        Effect.gen(function* () {
          yield* renderer.info(`Plan ·Review·`);
          for (const row of rows) {
            yield* renderer.info(`  ${row.target}  ${row.action}  ${row.detail}`);
          }
        }),
      presentScopeSupport: (scope, categories) =>
        Effect.gen(function* () {
          yield* renderer.info(`Scope support · ${scope}`);
          for (const category of categories) {
            for (const outcome of category.outcomes) {
              const target = outcome.agentName ?? category.placement;
              yield* renderer.info(
                `  ${category.label}  ${outcome.status}  ${target} [${outcome.reasonCode}]: ${outcome.reason}`,
              );
            }
          }
        }),
    } satisfies WorkspaceInitializationInteractionService;
  }),
);
