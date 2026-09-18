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
import * as Result from "effect/Result";
import * as Terminal from "effect/Terminal";
import { autocompleteMultiselect, requireInteractive } from "./prompt/index.js";
import {
  Screen,
  type ChooseAsk,
  type ChooseOption,
  type ConfirmAsk,
  type InputAsk,
} from "./screen/index.js";
import type { AppError } from "./app-error/index.js";
import {
  WorkspaceConfigurationFailed,
  WorkspaceInitializationCancelled,
  WorkspaceInitializationInteraction,
  type InstructionSourceChoice,
  type WorkspaceInitializationInteractionService,
} from "@agentxm/workspace/configuration";
import { setupAgentScanDoc, setupPlanDoc, setupScopeSupportDoc } from "./root/setup/view.js";

const selectAgentsMessage = "Select agents to configure";
const confirmInstructionSyncMessage = "Sync instructions to the selected agents?";
const instructionSyncNote = "Updates agent instruction files such as AGENTS.md and CLAUDE.md.";
const selectInstructionSourceMessage = "Instructions source";
const instructionSourceNote =
  "AXM will sync its contents to the selected agents' instruction files.";
const customInstructionSourceMessage = "Instructions file name";
const customInstructionSourceNote =
  "Relative to the project root. It will be created if it does not exist.";
const confirmSetupPlanMessage = "Proceed?";

const yesNo = (
  defaultsToYes: boolean,
): ReadonlyArray<{
  readonly key: string;
  readonly word: string;
  readonly value: boolean;
}> => {
  const yes = { key: "y", word: "yes", value: true };
  const no = { key: "n", word: "no", value: false };
  return defaultsToYes ? [yes, no] : [no, yes];
};

/** The setup gate: nothing has been written yet, so the default is to proceed. */
const setupPlanAsk: ConfirmAsk<boolean> = {
  _tag: "Confirm",
  question: confirmSetupPlanMessage,
  label: "Proceed",
  choices: yesNo(true),
};

const instructionSyncAsk = (enabled: boolean): ConfirmAsk<boolean> => ({
  _tag: "Confirm",
  question: confirmInstructionSyncMessage,
  note: instructionSyncNote,
  label: "Sync instructions",
  choices: yesNo(enabled),
});

/** What the source list answers: a file it offered, or a name still to be typed. */
type InstructionSource =
  { readonly _tag: "File"; readonly fileName: string } | { readonly _tag: "Other" };

const instructionSourceAsk = (
  defaultFileName: string,
  choices: ReadonlyArray<InstructionSourceChoice>,
): ChooseAsk<InstructionSource> => ({
  _tag: "Choose",
  question: selectInstructionSourceMessage,
  note: instructionSourceNote,
  options: [
    ...choices.map((choice): ChooseOption<InstructionSource> => ({
      title: choice.fileName,
      details: [
        ...(choice.fileName === defaultFileName ? ["recommended"] : []),
        choice.exists ? "existing" : "will be created",
        ...(choice.exists ? [`${String(choice.lines)} lines`] : []),
      ],
      value: { _tag: "File", fileName: choice.fileName },
      ...(choice.fileName === defaultFileName ? { selected: true } : {}),
    })),
    { title: "Other…", details: ["type a file name"], value: { _tag: "Other" } },
  ],
});

/**
 * A typed source file: a path inside the project, so it is neither empty nor
 * absolute. Surrounding space is not part of a file name.
 */
const validateSourceFileName = (raw: string): Result.Result<string, string> => {
  const fileName = raw.trim();
  if (fileName.length === 0) return Result.fail("Enter a file name, such as docs/AGENTS.md.");
  return /^([/\\]|[A-Za-z]:)/.test(fileName)
    ? Result.fail("Enter a path relative to the project root.")
    : Result.succeed(fileName);
};

const customSourceAsk: InputAsk<string> = {
  _tag: "Input",
  question: customInstructionSourceMessage,
  note: customInstructionSourceNote,
  placeholder: "docs/AGENTS.md",
  validate: validateSourceFileName,
};

const cancelled = (error: { readonly message: string }) =>
  Effect.fail(new WorkspaceInitializationCancelled({ message: error.message }));

const carriedCategory = (
  code: AppError["code"],
): "conflict" | "internal" | "usage" | "validation" =>
  code === "conflict" || code === "usage" || code === "validation" ? code : "internal";

/**
 * Carry a prompt-guard envelope into the feature's typed failure family; the
 * boundary conversion back is a field copy, so the rendered envelope stays
 * byte-identical.
 */
const toInteractionFailure = (
  error: AppError | WorkspaceInitializationCancelled,
): WorkspaceConfigurationFailed | WorkspaceInitializationCancelled =>
  error instanceof WorkspaceInitializationCancelled
    ? error
    : new WorkspaceConfigurationFailed({
        category: carriedCategory(error.code),
        detail: error.detail,
        ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      });

export const WorkspaceInitializationInteractionLive = Layer.effect(
  WorkspaceInitializationInteraction,
  Effect.gen(function* () {
    const screen = yield* Screen;
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
        screen
          .prompt(
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
                    agent.skills === undefined
                      ? "skills: unsupported"
                      : `skills: ${agent.skills.dir}`,
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
            ),
          )
          .pipe(
            Effect.provide(promptEnvironment),
            Effect.catchTag("PromptCancelled", cancelled),
            Effect.mapError(toInteractionFailure),
          ),
      confirmInstructionSync: ({ enabled }) =>
        screen
          .ask(instructionSyncAsk(enabled), { message: confirmInstructionSyncMessage })
          .pipe(
            Effect.catchTag("PromptCancelled", cancelled),
            Effect.mapError(toInteractionFailure),
          ),
      selectInstructionSource: ({ defaultFileName, choices }) =>
        Effect.gen(function* () {
          const source = yield* screen.ask(instructionSourceAsk(defaultFileName, choices), {
            message: selectInstructionSourceMessage,
          });
          return source._tag === "File"
            ? source.fileName
            : yield* screen.ask(customSourceAsk, { message: customInstructionSourceMessage });
        }).pipe(
          Effect.catchTag("PromptCancelled", cancelled),
          Effect.mapError(toInteractionFailure),
        ),
      confirmSetupPlan: () =>
        screen
          .ask(setupPlanAsk, { message: confirmSetupPlanMessage })
          .pipe(
            Effect.catchTag("PromptCancelled", cancelled),
            Effect.mapError(toInteractionFailure),
          ),
      presentAgentScan: (scan) => screen.note(setupAgentScanDoc(scan)),
      presentSetupPlan: (rows) => screen.note(setupPlanDoc(rows)),
      presentScopeSupport: (scope, categories) =>
        screen.note(setupScopeSupportDoc(scope, categories)),
    } satisfies WorkspaceInitializationInteractionService;
  }),
);
