/**
 * CLI implementation of the workspace-initialization interaction port.
 *
 * Owns the setup prompts and every piece of setup presentation wording: the
 * agent scan line, retired-agent warnings, the plan ledger, and the apply
 * gate. Prompt cancellations map into the kernel-owned
 * `WorkspaceInitializationCancelled`.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import type * as Array from "effect/Array";
import {
  Screen,
  pickAsk,
  yesNo,
  type ChooseAsk,
  type ChooseOption,
  type ConfirmAsk,
  type InputAsk,
  type PickAsk,
} from "./screen/index.js";
import type { AppError } from "./app-error/index.js";
import {
  WorkspaceConfigurationFailed,
  WorkspaceInitializationCancelled,
  WorkspaceInitializationInteraction,
  type InstructionSourceChoice,
  type WorkspaceInitializationInteractionService,
} from "@agentxm/workspace/configuration";
import { setupAgentScanDoc, setupPlanDoc } from "./root/setup/view.js";

const selectAgentsMessage = "Select agents to configure";
const confirmInstructionSyncMessage = "Sync instructions to the selected agents?";
const instructionSyncNote = "Updates agent instruction files such as AGENTS.md and CLAUDE.md.";
const selectInstructionSourceMessage = "Instructions source";
const instructionSourceNote =
  "AXM will sync its contents to the selected agents' instruction files.";
const customInstructionSourceMessage = "Instructions file name";
const customInstructionSourceNote =
  "Relative to the project root. It will be created if it does not exist.";
const confirmSetupPlanMessage = "Apply setup?";

/** Which agents the scan found, and which of them a person already chose. */
type AgentFacts = Parameters<WorkspaceInitializationInteractionService["selectAgents"]>[0];

/**
 * Every supported agent, each with what the scan knows about it. Agents that
 * are configured, found in the project, or suggested open picked.
 */
const selectAgentsAsk = (facts: AgentFacts): PickAsk<ReadonlyArray<string>> =>
  pickAsk({
    question: selectAgentsMessage,
    label: "Agents",
    noun: { one: "agent", other: "agents" },
    options: facts.allAgents.map((agent) => ({
      title: agent.name,
      value: agent.id,
      details: [
        ...(facts.configuredIds.includes(agent.id) ? ["configured"] : []),
        ...(facts.projectDetectedIds.includes(agent.id) ? ["detected in project"] : []),
        ...(facts.userDetectedIds.includes(agent.id) ? ["detected on workstation"] : []),
        ...(facts.suggestedIds.includes(agent.id) ? ["suggested"] : []),
        agent.skills === undefined ? "skills: unsupported" : `skills: ${agent.skills.dir}`,
      ],
      ...(facts.configuredIds.includes(agent.id) ||
      facts.projectDetectedIds.includes(agent.id) ||
      facts.suggestedIds.includes(agent.id)
        ? { selected: true }
        : {}),
    })),
  });

/** The setup gate: nothing has been written yet, so the default is to proceed. */
const setupPlanAsk: ConfirmAsk<boolean> = {
  _tag: "Confirm",
  question: confirmSetupPlanMessage,
  label: "Apply setup",
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

const withOtherChoice = (
  choices: ReadonlyArray<ChooseOption<InstructionSource>>,
): Array.NonEmptyReadonlyArray<ChooseOption<InstructionSource>> => {
  const other: ChooseOption<InstructionSource> = {
    title: "Other…",
    details: ["type a file name"],
    value: { _tag: "Other" },
  };
  const [first, ...rest] = choices;
  return first === undefined ? [other] : [first, ...rest, other];
};

const instructionSourceAsk = (
  defaultFileName: string,
  choices: ReadonlyArray<InstructionSourceChoice>,
): ChooseAsk<InstructionSource> => ({
  _tag: "Choose",
  question: selectInstructionSourceMessage,
  note: instructionSourceNote,
  options: withOtherChoice(
    choices.map((choice): ChooseOption<InstructionSource> => ({
      title: choice.fileName,
      details: [
        ...(choice.fileName === defaultFileName ? ["recommended"] : []),
        choice.exists ? "existing" : "will be created",
        ...(choice.exists ? [`${String(choice.lines)} lines`] : []),
      ],
      value: { _tag: "File", fileName: choice.fileName },
      ...(choice.fileName === defaultFileName ? { selected: true } : {}),
    })),
  ),
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

    return {
      selectAgents: (facts) =>
        screen
          .ask(selectAgentsAsk(facts), { message: selectAgentsMessage })
          .pipe(
            Effect.catchTag("QuestionCancelled", cancelled),
            Effect.mapError(toInteractionFailure),
          ),
      confirmInstructionSync: ({ enabled }) =>
        screen
          .ask(instructionSyncAsk(enabled), { message: confirmInstructionSyncMessage })
          .pipe(
            Effect.catchTag("QuestionCancelled", cancelled),
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
          Effect.catchTag("QuestionCancelled", cancelled),
          Effect.mapError(toInteractionFailure),
        ),
      confirmSetupPlan: () =>
        screen
          .ask(setupPlanAsk, { message: confirmSetupPlanMessage })
          .pipe(
            Effect.catchTag("QuestionCancelled", cancelled),
            Effect.mapError(toInteractionFailure),
          ),
      presentAgentScan: (scan) => screen.note(setupAgentScanDoc(scan)),
      presentSetupPlan: (rows) => screen.note(setupPlanDoc(rows)),
    } satisfies WorkspaceInitializationInteractionService;
  }),
);
