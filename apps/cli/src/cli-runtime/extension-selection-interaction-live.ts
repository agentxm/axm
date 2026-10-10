/**
 * Asking a person which of a source's extensions to install.
 *
 * The lifecycle decides that a choice is needed and what the candidates are;
 * this is how the terminal asks for it — one pick over everything the source
 * offers, under a heading for each type where there are several, that requires
 * at least one answer, and a cancellation the runtime reports as a clean exit
 * rather than a failure.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  extensionTypePluralLabels,
  extensionTypePluralSentenceLabels,
  extensionTypeSentenceLabels,
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

const sameCandidate =
  (member: { readonly type: string; readonly name: string }) =>
  (candidate: InstallSelectionCandidate): boolean =>
    candidate.type === member.type && candidate.name === member.name;

/** The types the candidates span, in the order the list reaches them. */
const typesOf = (candidates: ReadonlyArray<InstallSelectionCandidate>) => [
  ...new Set(candidates.map(({ type }) => type)),
];

const typeNoun = (type: InstallSelectionCandidate["type"]) => ({
  one: extensionTypeSentenceLabels[type],
  other: extensionTypePluralSentenceLabels[extensionTypeToPlural[type]],
});

/** What a candidate brings, or what brings it, said as one fact about it. */
const membership = (
  candidate: InstallSelectionCandidate,
  candidates: ReadonlyArray<InstallSelectionCandidate>,
): ReadonlyArray<string> => {
  const brought = candidate.brings.map((member) => `${typeNoun(member.type).one} ${member.name}`);
  const bringers = candidates
    .filter((other) => other.brings.some((member) => sameCandidate(member)(candidate)))
    .map((other) => `${typeNoun(other.type).one} ${other.name}`);
  return [
    ...(brought.length === 0 ? [] : [`brings ${brought.join(", ")}`]),
    ...(bringers.length === 0 ? [] : [`in ${bringers.join(", ")}`]),
  ];
};

/**
 * One candidate as the list offers it: its name, what brings it or what it
 * brings, and what it does when it says. A list spanning several types puts
 * each type under its own heading; one type keeps the source's own folders.
 */
const candidateOption =
  (candidates: ReadonlyArray<InstallSelectionCandidate>, byType: boolean) =>
  (candidate: InstallSelectionCandidate): PickOption<InstallSelectionCandidate> => {
    const details = [
      ...membership(candidate, candidates),
      ...Option.toArray(candidate.description),
    ];
    const group = byType
      ? Option.some(extensionTypePluralLabels[extensionTypeToPlural[candidate.type]])
      : candidate.group;
    const brings = candidate.brings.flatMap((member) => {
      const index = candidates.findIndex(sameCandidate(member));
      return index < 0 ? [] : [index];
    });
    return {
      title: candidate.name,
      value: candidate,
      ...(details.length === 0 ? {} : { details }),
      ...(Option.isSome(group) ? { group: group.value } : {}),
      ...(brings.length === 0 ? {} : { brings }),
    };
  };

/** The headings a note names one by one; past these it only counts them. */
const NAMED_GROUPS = 4;

const counted = (count: number, noun: { readonly one: string; readonly other: string }): string =>
  `${String(count)} ${count === 1 ? noun.one : noun.other}`;

/**
 * What the source offers, said before anything is asked: how many of each
 * type, or for one type how many and the headings the source sorts them under
 * with how many each holds — a list shows only its first screenful, so this is
 * where a person learns what else is in it.
 */
const offered = (candidates: ReadonlyArray<InstallSelectionCandidate>): string => {
  const types = typesOf(candidates);
  const [only] = types;
  if (types.length !== 1 || only === undefined) {
    return types
      .map((type) =>
        counted(candidates.filter((candidate) => candidate.type === type).length, typeNoun(type)),
      )
      .join(", ");
  }
  const count = counted(candidates.length, typeNoun(only));
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
 * How the pick names what it offers: the one type the candidates share, with
 * the flag that would have selected from it without a prompt, or extensions
 * of several types, each named by its own flag.
 */
const selectionSubject = (candidates: ReadonlyArray<InstallSelectionCandidate>) => {
  const types = typesOf(candidates);
  const [only] = types;
  if (types.length !== 1 || only === undefined) {
    return {
      label: "Extensions",
      noun: { one: "extension", other: "extensions" },
      flag: "their per-type flags",
    };
  }
  return {
    label: extensionTypePluralLabels[extensionTypeToPlural[only]],
    noun: typeNoun(only),
    flag: `--${EXTENSION_TYPE_PRESENTATION[only].selectorFlag}`,
  };
};

/** The terminal's one selection interaction, shared by every installable type. */
export const InstallSelectionLive = Layer.effect(InstallSelectionInteraction)(
  Effect.gen(function* () {
    const screen = yield* Screen;
    return {
      select: (candidates: ReadonlyArray<InstallSelectionCandidate>) => {
        const subject = selectionSubject(candidates);
        const question = `Select ${subject.noun.other} to install`;
        return screen
          .ask(
            pickAsk({
              question,
              context: offered(candidates),
              label: subject.label,
              noun: subject.noun,
              verb: "install",
              min: 1,
              options: candidates.map(candidateOption(candidates, typesOf(candidates).length > 1)),
            }),
            {
              message: question,
              guidance: `Name the ${subject.noun.other} with ${subject.flag}, take them all with --all, or rerun without --json.`,
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
