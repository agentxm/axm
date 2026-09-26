/**
 * Asking a person which of a source's extensions to install.
 *
 * The lifecycle decides that a choice is needed and what the candidates are;
 * this is how the terminal asks for it — a pick that requires at least one
 * answer, and a cancellation the runtime reports as a clean exit rather than
 * a failure.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  extensionTypePluralLabels,
  extensionTypePluralSentenceLabels,
  extensionTypeToPlural,
} from "@agentxm/extension-model/unstable/extensions";
import {
  InstallSelectionCancelled,
  InstallSelectionInteraction,
  InstallSelectionUnavailable,
  type InstallSelectionCandidate,
} from "@agentxm/workspace/lifecycle";

import { makeAppError } from "../app-error/index.js";
import { EXTENSION_TYPE_PRESENTATION } from "../root/extension-type-presentation.js";
import {
  Screen,
  askFailureFields,
  pickAsk,
  type AskFailure,
  type AskFailureWording,
  type PickOption,
} from "../screen/index.js";

const selectionWording: AskFailureWording = {
  configuration: "Interaction configuration could not be read.",
  output: "The selection could not be displayed.",
};

/**
 * The guidance an unobtainable selection carries to the boundary, which
 * prints an `AppError` cause as the failure itself.
 */
const selectionUnavailable = (error: AskFailure) => {
  const fields = askFailureFields(error, selectionWording);
  return makeAppError({
    code: fields.category,
    detail: fields.detail,
    ...(fields.suggestions === undefined ? {} : { suggestions: fields.suggestions }),
    cause: fields.cause,
  });
};

/** One candidate as the list offers it: its name, and what it does when it says. */
const candidateOption = (
  candidate: InstallSelectionCandidate,
): PickOption<InstallSelectionCandidate> => ({
  title: candidate.name,
  value: candidate,
  ...(Option.isSome(candidate.description) ? { details: [candidate.description.value] } : {}),
});

/**
 * How the pick names what it offers. The lifecycle offers one type at a time,
 * so the first candidate's type names the whole list and the flag that would
 * have selected from it without a prompt.
 */
const selectionSubject = (candidates: ReadonlyArray<InstallSelectionCandidate>) => {
  const [first] = candidates;
  if (first === undefined) {
    return { label: "Extensions", other: "extensions", flag: "their per-type flags" };
  }
  const plural = extensionTypeToPlural[first.type];
  return {
    label: extensionTypePluralLabels[plural],
    other: extensionTypePluralSentenceLabels[plural],
    flag: `--${EXTENSION_TYPE_PRESENTATION[first.type].selectorFlag}`,
  };
};

/** The terminal's one selection interaction, shared by every installable type. */
export const InstallSelectionLive = Layer.effect(InstallSelectionInteraction)(
  Effect.gen(function* () {
    const screen = yield* Screen;
    return {
      select: (candidates: ReadonlyArray<InstallSelectionCandidate>) => {
        const subject = selectionSubject(candidates);
        const question = `Select ${subject.other} to install`;
        return screen
          .ask(
            pickAsk({
              question,
              label: subject.label,
              noun: { one: subject.other.replace(/s$/, ""), other: subject.other },
              min: 1,
              options: candidates.map(candidateOption),
            }),
            {
              message: question,
              guidance: `Name the ${subject.other} with ${subject.flag}, take them all with --all, or rerun without --json.`,
            },
          )
          .pipe(
            Effect.mapError((error) =>
              error._tag === "QuestionCancelled"
                ? new InstallSelectionCancelled({ message: error.message })
                : new InstallSelectionUnavailable({ cause: selectionUnavailable(error) }),
            ),
          );
      },
    };
  }),
);
