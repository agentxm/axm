/**
 * Asking a person which of a source's extensions to install.
 *
 * The lifecycle decides that a choice is needed and what the candidates are;
 * this is how the terminal asks for it — a multiselect that requires at least
 * one answer, and a cancellation the runtime reports as a clean exit rather
 * than a failure.
 */

import type * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";

import {
  SkillSelectionCancelled,
  SkillSelectionInteraction,
  SkillSelectionUnavailable,
} from "@agentxm/workspace/skills/lifecycle/application";
import {
  SubagentSelectionCancelled,
  SubagentSelectionInteraction,
  SubagentSelectionUnavailable,
} from "@agentxm/workspace/subagents/lifecycle/application";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

import { requireInteractive } from "../prompt/index.js";
import { Screen } from "../screen/index.js";

interface SelectionChoice<T> {
  readonly title: string;
  readonly value: T;
  readonly description?: string;
}

const askForSelection = <T>(
  message: string,
  guidance: string,
  choices: ReadonlyArray<SelectionChoice<T>>,
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const terminal = yield* Terminal.Terminal;
    const screen = yield* Screen;
    const promptEnvironment = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fileSystem),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Terminal.Terminal, terminal),
    );
    return yield* screen.prompt(
      requireInteractive(Prompt.MultiSelect({ message, choices, min: 1 }), {
        message,
        guidance,
      }).pipe(Effect.provide(promptEnvironment)),
    );
  });

const selectionEnvironment = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const terminal = yield* Terminal.Terminal;
  const screen = yield* Screen;
  return Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, fileSystem),
    Layer.succeed(Path.Path, path),
    Layer.succeed(Terminal.Terminal, terminal),
    Layer.succeed(Screen, screen),
  );
});

/** The terminal implements only the skill interaction contract. */
export const SkillSelectionLive = Layer.effect(SkillSelectionInteraction)(
  Effect.map(selectionEnvironment, (environment) => ({
    select: (candidates: Array.NonEmptyReadonlyArray<SkillExtensionRef>) =>
      askForSelection(
        "Select skills to install",
        "Name the skills with --skill, take them all with --all, or rerun without --json.",
        candidates.map((skill) => ({
          title: skill.skill.name,
          value: skill,
          ...(Option.isSome(skill.skill.description)
            ? { description: skill.skill.description.value }
            : {}),
        })),
      ).pipe(
        Effect.catchTag("PromptCancelled", (error) =>
          Effect.fail(new SkillSelectionCancelled({ message: error.message })),
        ),
        Effect.catchTag("AppError", (cause) =>
          Effect.fail(new SkillSelectionUnavailable({ cause })),
        ),
        Effect.provide(environment),
      ),
  })),
);

/** The terminal implements only the subagent interaction contract. */
export const SubagentSelectionLive = Layer.effect(SubagentSelectionInteraction)(
  Effect.map(selectionEnvironment, (environment) => ({
    select: (candidates: Array.NonEmptyReadonlyArray<SubagentExtensionRef>) =>
      askForSelection(
        "Select subagents to install",
        "Name the subagents with --subagent, take them all with --all, or rerun without --json.",
        candidates.map((subagent) => ({
          title: subagent.subagent.name,
          value: subagent,
          ...(Option.isSome(subagent.subagent.description)
            ? { description: subagent.subagent.description.value }
            : {}),
        })),
      ).pipe(
        Effect.catchTag("PromptCancelled", (error) =>
          Effect.fail(new SubagentSelectionCancelled({ message: error.message })),
        ),
        Effect.catchTag("AppError", (cause) =>
          Effect.fail(new SubagentSelectionUnavailable({ cause })),
        ),
        Effect.provide(environment),
      ),
  })),
);

/** Root installation composes the two independently usable interfaces. */
export const ExtensionSelectionLive = Layer.mergeAll(SkillSelectionLive, SubagentSelectionLive);
