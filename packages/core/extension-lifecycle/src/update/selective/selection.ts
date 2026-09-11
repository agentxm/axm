/**
 * Which configured entries a selective update is about.
 *
 * `skills update` and `subagents update` accept two selectors: a positional
 * that names either an installed extension or the source it came from, and a
 * repeated name filter that accepts globs. Both narrow the configured,
 * enabled entries of one type; neither resolves anything from a Registry.
 * A selector that matches nothing is not a failure — it is a settled no-op
 * with the reason the application renders.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseSourceQualifiedRegistrySourcePatternParts } from "@agentxm/extension-model/unstable/extensions";
import {
  resolveInstalledIdentifierNameOrInput,
  resolveSource,
  SourceHostProviders,
  type IdentifierResourceType,
} from "@agentxm/extension-sources";

import { expandGlobs } from "../../glob.js";

/** One configured entry a selective update may advance. */
export type SelectiveUpdateEntry = readonly [name: string, source: string];

/** Why a selective update settled without a plan. */
export type SelectiveUpdateNothingReason = "none-installed" | "no-source-match" | "no-name-match";

export type SelectiveUpdateSelection =
  | { readonly kind: "targets"; readonly entries: ReadonlyArray<SelectiveUpdateEntry> }
  | {
      readonly kind: "nothing";
      readonly reason: SelectiveUpdateNothingReason;
      readonly message: string;
    };

export interface SelectiveUpdateSelectors {
  /** Positional selector: an installed name, or the source an entry declares. */
  readonly source: Option.Option<string>;
  /** Repeated name filter; entries may be globs. */
  readonly nameFilters: ReadonlyArray<string>;
  /** The flag spelling the application registered, quoted in the no-op reason. */
  readonly nameFilterFlag: string;
}

interface SelectionRequest extends SelectiveUpdateSelectors {
  readonly entries: ReadonlyArray<SelectiveUpdateEntry>;
  readonly resourceType: IdentifierResourceType;
  readonly resourceLabel: string;
  readonly resourceLabelPlural: string;
}

/**
 * Whether a positional selector names the same origin an entry declares.
 * Two Registry patterns compare by their parsed parts; anything else
 * compares by the canonical origin its source resolves to.
 */
const sourceMatchesEntrySource = (sourceValue: string, entrySource: string) =>
  Effect.gen(function* () {
    const requestedRegistry = parseSourceQualifiedRegistrySourcePatternParts(sourceValue);
    const configuredRegistry = parseSourceQualifiedRegistrySourcePatternParts(entrySource);
    if (requestedRegistry !== undefined || configuredRegistry !== undefined) {
      return (
        requestedRegistry !== undefined &&
        configuredRegistry !== undefined &&
        requestedRegistry.sourceName === configuredRegistry.sourceName &&
        requestedRegistry.owner === configuredRegistry.owner &&
        requestedRegistry.type === configuredRegistry.type &&
        requestedRegistry.name === configuredRegistry.name
      );
    }
    const sources = yield* SourceHostProviders;
    const sourceArgResult = yield* Effect.result(resolveSource(sourceValue));
    if (sourceArgResult._tag === "Failure") return false;
    const entrySourceResult = yield* Effect.result(resolveSource(entrySource));
    if (entrySourceResult._tag === "Failure") return false;
    return sources.origin(entrySourceResult.success) === sources.origin(sourceArgResult.success);
  });

const filterBySource = (entries: ReadonlyArray<SelectiveUpdateEntry>, sourceValue: string) =>
  Effect.gen(function* () {
    const nameMatched = entries.filter(([name]) => name === sourceValue);
    if (nameMatched.length > 0) return nameMatched;

    const matches = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.map(sourceMatchesEntrySource(sourceValue, entry[1]), (matched) =>
          matched ? Option.some(entry) : Option.none<SelectiveUpdateEntry>(),
        ),
      { concurrency: "unbounded" },
    );
    return matches.filter(Option.isSome).map((match) => match.value);
  });

const filterByNameFilters = (
  entries: ReadonlyArray<SelectiveUpdateEntry>,
  nameFilters: ReadonlyArray<string>,
  resourceType: IdentifierResourceType,
) =>
  Effect.gen(function* () {
    if (nameFilters.length === 0) return entries;
    const resolved = yield* Effect.forEach(nameFilters, (name) =>
      name.includes("*")
        ? Effect.succeed(name)
        : resolveInstalledIdentifierNameOrInput({ input: name, resourceType }),
    );
    const matched = new Set(
      expandGlobs(
        resolved,
        entries.map(([name]) => name),
      ),
    );
    return entries.filter(([name]) => matched.has(name));
  });

/**
 * Narrow the configured entries to the ones both selectors admit, or say
 * which selector admitted nothing.
 */
export const selectUpdateTargets = Effect.fn("SelectiveUpdate.selectTargets")(function* (
  request: SelectionRequest,
) {
  const sourceValue = Option.getOrUndefined(request.source);
  const sourceFiltered =
    sourceValue === undefined
      ? request.entries
      : yield* filterBySource(request.entries, sourceValue);

  if (sourceValue !== undefined && sourceFiltered.length === 0) {
    return {
      kind: "nothing",
      reason: "no-source-match",
      message: `No installed ${request.resourceLabel} matched "${sourceValue}" as a name or source.`,
    } satisfies SelectiveUpdateSelection;
  }

  const nameFiltered = yield* filterByNameFilters(
    sourceFiltered,
    request.nameFilters,
    request.resourceType,
  );
  if (request.nameFilters.length > 0 && nameFiltered.length === 0) {
    return {
      kind: "nothing",
      reason: "no-name-match",
      message: `No installed ${request.resourceLabelPlural} match the ${request.nameFilterFlag} filter.`,
    } satisfies SelectiveUpdateSelection;
  }

  return { kind: "targets", entries: nameFiltered } satisfies SelectiveUpdateSelection;
});
