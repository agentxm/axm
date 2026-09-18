/**
 * Asking a person which of a source's extensions to install.
 *
 * The lifecycle decides that a choice is needed and what the candidates are;
 * this is how the terminal asks for it — a pick that requires at least one
 * answer, and a cancellation the runtime reports as a clean exit rather than
 * a failure.
 */

import type * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

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

import { Screen, pickAsk, type PickOption } from "../screen/index.js";

/** One candidate as the list offers it: its name, and what it does when it says. */
const candidateOption = <T>(
  name: string,
  description: Option.Option<string>,
  value: T,
): PickOption<T> => ({
  title: name,
  value,
  ...(Option.isSome(description) ? { details: [description.value] } : {}),
});

/** The terminal implements only the skill interaction contract. */
export const SkillSelectionLive = Layer.effect(SkillSelectionInteraction)(
  Effect.gen(function* () {
    const screen = yield* Screen;
    return {
      select: (candidates: Array.NonEmptyReadonlyArray<SkillExtensionRef>) =>
        screen
          .ask(
            pickAsk({
              question: "Select skills to install",
              label: "Skills",
              noun: { one: "skill", other: "skills" },
              min: 1,
              options: candidates.map((skill) =>
                candidateOption(skill.skill.name, skill.skill.description, skill),
              ),
            }),
            {
              message: "Select skills to install",
              guidance:
                "Name the skills with --skill, take them all with --all, or rerun without --json.",
            },
          )
          .pipe(
            Effect.catchTag("PromptCancelled", (error) =>
              Effect.fail(new SkillSelectionCancelled({ message: error.message })),
            ),
            Effect.catchTag("AppError", (cause) =>
              Effect.fail(new SkillSelectionUnavailable({ cause })),
            ),
          ),
    };
  }),
);

/** The terminal implements only the subagent interaction contract. */
export const SubagentSelectionLive = Layer.effect(SubagentSelectionInteraction)(
  Effect.gen(function* () {
    const screen = yield* Screen;
    return {
      select: (candidates: Array.NonEmptyReadonlyArray<SubagentExtensionRef>) =>
        screen
          .ask(
            pickAsk({
              question: "Select subagents to install",
              label: "Subagents",
              noun: { one: "subagent", other: "subagents" },
              min: 1,
              options: candidates.map((subagent) =>
                candidateOption(subagent.subagent.name, subagent.subagent.description, subagent),
              ),
            }),
            {
              message: "Select subagents to install",
              guidance:
                "Name the subagents with --subagent, take them all with --all, or rerun without --json.",
            },
          )
          .pipe(
            Effect.catchTag("PromptCancelled", (error) =>
              Effect.fail(new SubagentSelectionCancelled({ message: error.message })),
            ),
            Effect.catchTag("AppError", (cause) =>
              Effect.fail(new SubagentSelectionUnavailable({ cause })),
            ),
          ),
    };
  }),
);

/** Root installation composes the two independently usable interfaces. */
export const ExtensionSelectionLive = Layer.mergeAll(SkillSelectionLive, SubagentSelectionLive);
