/**
 * Resolving what a `<type> update` selector names.
 *
 * A person narrows a configured sweep two ways: a positional that may be an
 * installed name or a source, and repeated `--name` filters that may be exact
 * names or globs. Deciding which configured entries those name is update's
 * own question — it re-reads the configured entries, re-resolves their
 * declared sources, and compares origins — so it is settled here, beside the
 * sweep it narrows, rather than by whichever surface parsed the flags.
 *
 * A selector that matches nothing is a settled answer, not a failure: the
 * sweep reports it as nothing to advance, in the same shape as a workspace
 * with nothing configured.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  extensionTypeSentenceLabels,
  extensionTypePluralSentenceLabels,
  parseSourceQualifiedRegistrySourcePatternParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import { isCatalogExtensionType } from "@agentxm/extension-model/unstable/extension-types";
import {
  SourceHostProviders,
  resolveInstalledIdentifierNameOrInput,
  resolveSource,
} from "@agentxm/extension-sources";
import {
  WorkspaceRecords,
  configuredRowsByName,
  enabledConfiguredEntries,
} from "@agentxm/workspace-state";

import { expandGlobs } from "../glob.js";
import type { WorkspaceUpdatableType } from "./configured.js";

/** The flag spelling reported when a `--name` filter matches nothing. */
export const UPDATE_NAME_FILTER_FLAG = "--name";

/** Every type a selector can narrow: whatever a configured sweep can cover. */
export type ConfiguredUpdateSelectorType = WorkspaceUpdatableType;

/** What one `<type> update` invocation asked for, before it is resolved. */
export interface ConfiguredUpdateSelector {
  readonly resourceType: ConfiguredUpdateSelectorType;
  /** The positional selector, which may name an installed extension or a source. */
  readonly source: Option.Option<string>;
  /** Repeated `--name` filters; exact names or globs over installed names. */
  readonly nameFilters: ReadonlyArray<string>;
  /** False where the positional is a source spelling only (MCP connections). */
  readonly sourceMayMatchName?: boolean;
}

/** What a selector resolved to. */
export type ConfiguredUpdateSelection =
  /** No selector was given: every configured entry of the type is in scope. */
  | { readonly _tag: "All" }
  /** The selector matched these installed names. */
  | { readonly _tag: "Names"; readonly names: ReadonlyArray<string> }
  /** The selector matched nothing, and this says which selector and why. */
  | { readonly _tag: "NoMatch"; readonly message: string };

type SelectedEntry = readonly [name: string, source: string | undefined];

const sourceMatchesEntrySource = (sourceValue: string, entrySource: string | undefined) =>
  Effect.gen(function* () {
    if (entrySource === undefined) return false;
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
    if (sourceArgResult._tag === "Failure") {
      return false;
    }

    const entrySourceResult = yield* Effect.result(resolveSource(entrySource));
    if (entrySourceResult._tag === "Failure") {
      return false;
    }

    return sources.origin(entrySourceResult.success) === sources.origin(sourceArgResult.success);
  });

const filterBySource = (
  entries: ReadonlyArray<SelectedEntry>,
  sourceValue: string,
  sourceMayMatchName: boolean,
) =>
  Effect.gen(function* () {
    const nameMatchedEntries = sourceMayMatchName
      ? entries.filter(([name]) => name === sourceValue)
      : [];
    if (nameMatchedEntries.length > 0) {
      return nameMatchedEntries;
    }

    const sourceMatches = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.map(sourceMatchesEntrySource(sourceValue, entry[1]), (matches) =>
          matches ? Option.some(entry) : Option.none<SelectedEntry>(),
        ),
      { concurrency: "unbounded" },
    );

    return sourceMatches.filter(Option.isSome).map((match) => match.value);
  });

const filterByNameFilters = (
  entries: ReadonlyArray<SelectedEntry>,
  nameFilters: ReadonlyArray<string>,
  resourceType: ConfiguredUpdateSelectorType,
) =>
  Effect.gen(function* () {
    if (nameFilters.length === 0) {
      return entries;
    }

    // A container has no per-type lock map of its own, so a bare name cannot
    // be resolved to an installed identifier for it; the filter then matches
    // the spelling the person gave, which is what identifier resolution
    // returns for an unresolvable name anyway.
    const resolvedNameFilters = yield* Effect.forEach(nameFilters, (name) =>
      name.includes("*") || !isCatalogExtensionType(resourceType)
        ? Effect.succeed(name)
        : resolveInstalledIdentifierNameOrInput({
            input: name,
            resourceType,
          }),
    );
    const allNames = entries.map(([name]) => name);
    const matchedNames = expandGlobs(resolvedNameFilters, allNames);
    const matchedSet = new Set(matchedNames);
    return entries.filter(([name]) => matchedSet.has(name));
  });

/**
 * Resolve a selector against the type's configured, enabled entries.
 *
 * Returns `All` when no selector was given, so a workspace with nothing
 * configured still reports through the sweep's own "no configured …" message
 * rather than a selector no-op.
 */
export const resolveConfiguredUpdateSelection = Effect.fn("UpdateExtensions.resolveSelection")(
  function* (selector: ConfiguredUpdateSelector) {
    if (Option.isNone(selector.source) && selector.nameFilters.length === 0) {
      return { _tag: "All" } satisfies ConfiguredUpdateSelection;
    }

    const records = yield* WorkspaceRecords;
    const configured = yield* records
      .rows(selector.resourceType)
      .pipe(Effect.map(configuredRowsByName));
    const entries: ReadonlyArray<SelectedEntry> = enabledConfiguredEntries(configured).map(
      ([name, entry]) => [name, entry.source] as const,
    );

    const sourceValue = Option.getOrUndefined(selector.source);
    const sourceMayMatchName = selector.sourceMayMatchName ?? true;
    const sourceFiltered =
      sourceValue === undefined
        ? entries
        : yield* filterBySource(entries, sourceValue, sourceMayMatchName);

    if (sourceValue !== undefined && sourceFiltered.length === 0) {
      const label = extensionTypeSentenceLabels[selector.resourceType];
      return {
        _tag: "NoMatch",
        message: `No installed ${label} matched "${sourceValue}"${
          sourceMayMatchName ? " as a name or source" : " as a source"
        }.`,
      } satisfies ConfiguredUpdateSelection;
    }

    const nameFiltered = yield* filterByNameFilters(
      sourceFiltered,
      selector.nameFilters,
      selector.resourceType,
    );
    if (selector.nameFilters.length > 0 && nameFiltered.length === 0) {
      const pluralLabel =
        extensionTypePluralSentenceLabels[toExtensionTypePlural(selector.resourceType)];
      return {
        _tag: "NoMatch",
        message: `No installed ${pluralLabel} match the ${UPDATE_NAME_FILTER_FLAG} filter.`,
      } satisfies ConfiguredUpdateSelection;
    }

    return {
      _tag: "Names",
      names: nameFiltered.map(([name]) => name),
    } satisfies ConfiguredUpdateSelection;
  },
);
