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
} from "@agentxm/workspace-kernel/operations";

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
  ...(Option.isSome(candidate.group) ? { group: candidate.group.value } : {}),
});

/** The headings a note names one by one; past these it only counts them. */
const NAMED_GROUPS = 4;

/**
 * How many candidates the source offers, and the headings it sorts them
 * under with how many each holds — a list shows only its first screenful, so
 * this is where a person learns what else is in it.
 */
const offered = (
  candidates: ReadonlyArray<InstallSelectionCandidate>,
  noun: { readonly one: string; readonly other: string },
): string => {
  const count = `${String(candidates.length)} ${candidates.length === 1 ? noun.one : noun.other}`;
  const sizes = new Map<string, number>();
  for (const group of candidates.flatMap((candidate) => Option.toArray(candidate.group))) {
    sizes.set(group, (sizes.get(group) ?? 0) + 1);
  }
  if (sizes.size <= 1) return count;
  const groups = `${count} in ${String(sizes.size)} groups`;
  return sizes.size > NAMED_GROUPS
    ? groups
    : `${groups}: ${[...sizes].map(([group, size]) => `${group} (${String(size)})`).join(", ")}`;
};

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
        const noun = { one: subject.other.replace(/s$/, ""), other: subject.other };
        return screen
          .ask(
            pickAsk({
              question,
              note: offered(candidates, noun),
              label: subject.label,
              noun,
              verb: "install",
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
