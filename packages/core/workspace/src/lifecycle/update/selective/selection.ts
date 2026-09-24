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
import * as Result from "effect/Result";

import {
  parseSourceQualifiedRegistrySourcePatternParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { createRegistryClient } from "@agentxm/registry-client";
import {
  resolveInstalledIdentifierNameOrInput,
  resolveSource,
  SourceHostProviders,
  type IdentifierResourceType,
} from "../../../resolution/sources/index.js";

import { expandGlobs } from "@agentxm/extension-model/unstable/extensions/name-patterns";
import {
  DesiredStateReader,
  desiredStateProblemsText,
  effectiveDesiredConstraint,
  type DesiredConstraintConflict,
  type DesiredEffectiveConstraint,
} from "../../../desired-state/index.js";

import { ExtensionLifecycleFailed } from "../../errors.js";

/** One configured entry a selective update may advance. */
export type SelectiveUpdateEntry = readonly [name: string, source: string];

/** One selected entry and the effective constraint it is selected within. */
export type ConstrainedSelectiveUpdateEntry = readonly [
  name: string,
  source: string,
  effective: DesiredEffectiveConstraint,
];

const SELECTIVE_TYPE_PLURALS = { skill: "skills", subagent: "subagents" } as const;

/**
 * The effective constraint of every selected entry, read from the
 * authoritative desired graph, so a selective update selects within the
 * range its direct declaration and every Pack that requires it intersect.
 * An incomplete graph is refused rather than guessed at: a missing Pack
 * manifest would silently drop the constraint it declares. A conflict among
 * a selected entry's contributors refuses the update and names every
 * contributor.
 */
export const constrainSelectedEntries = Effect.fn("SelectiveUpdate.effectiveConstraints")(
  function* (type: "skill" | "subagent", entries: ReadonlyArray<SelectiveUpdateEntry>) {
    const plural = SELECTIVE_TYPE_PLURALS[type];
    const desiredState = yield* DesiredStateReader;
    const graph = yield* desiredState.graph();
    if (graph.problems.some((problem) => problem.type !== "constraint-conflict")) {
      return yield* new ExtensionLifecycleFailed({
        category: "validation",
        detail: `Cannot update ${plural} because some pack manifests are missing or invalid`,
      });
    }
    const constrained: Array<ConstrainedSelectiveUpdateEntry> = [];
    const conflicts: Array<DesiredConstraintConflict> = [];
    for (const [name, source] of entries) {
      const constraint = effectiveDesiredConstraint(graph, { type, name });
      if (Result.isFailure(constraint)) conflicts.push(constraint.failure);
      else constrained.push([name, source, constraint.success]);
    }
    if (conflicts.length > 0) {
      return yield* new ExtensionLifecycleFailed({
        category: "conflict",
        detail: `Cannot update ${plural} because their constraints are unsatisfiable: ${desiredStateProblemsText(conflicts)}`,
        recover: "Change the direct declaration or the Pack that requires a version outside it",
      });
    }
    return constrained;
  },
);

/**
 * Every release a selected entry's Registry index lists, newest first, or
 * none when the Registry does not list the entry. The index is the one
 * listing that includes releases the effective constraint or the minimum
 * release age excludes, so it names the newest release a Pack range holds
 * the entry below.
 */
export const publishedReleases = Effect.fn("SelectiveUpdate.publishedReleases")(function* (
  source: RegistrySource,
  target: {
    readonly owner: Handle;
    readonly type: "skill" | "subagent";
    readonly name: ExtensionName;
  },
) {
  const location =
    source.location.protocol === "file:" ? source.location.pathname : source.location.href;
  const client = yield* createRegistryClient(location);
  const index = yield* client.getExtensionIndex(target);
  return Option.map(index, (value) => value.versions);
});

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
      { concurrency: 16 },
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
