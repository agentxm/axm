import { enabledConfiguredEntries } from "@agentxm/workspace-state";
import type { IdentifierResourceType } from "@agentxm/extension-sources";
import type { ContainerType, ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { parseSourceQualifiedRegistrySourcePatternParts } from "@agentxm/extension-model/unstable/extensions";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/extension-sources";
import { SourceHostProviders, resolveSource } from "@agentxm/extension-sources";
import { expandGlobs } from "../../utils/index.js";
import { WorkspaceMutations, configuredRowsByName } from "@agentxm/workspace-state";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag } from "effect/unstable/cli";

import { emitNoOpOutcome } from "./no-op-output.js";

export type UpdateTargetEntry = readonly [name: string, source: string | undefined];

/**
 * Every non-container type an update selector can name. Container placement
 * uses its own desired-root inventory and update planner, so a future
 * container type inherits that routing without another type-name exemption.
 */
export type UpdateTargetResource = Exclude<ExtensionType, ContainerType> & IdentifierResourceType;

/**
 * The repeated name-filter flag every `<type> update` accepts. `--name` is the
 * uniform selector spelling across extension types.
 */
export const updateNameFilterFlag = Flag.string("name").pipe(
  Flag.withDescription("Update only specific extensions by name or glob pattern"),
  Flag.atLeast(0),
);

/** Flag name reported in the "nothing matched" envelope. */
export const UPDATE_NAME_FILTER_FLAG = "--name";

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

const filterBySource = <TEntry extends UpdateTargetEntry>(
  entries: ReadonlyArray<TEntry>,
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
          matches ? Option.some(entry) : Option.none<TEntry>(),
        ),
      { concurrency: "unbounded" },
    );

    return sourceMatches.filter(Option.isSome).map((match) => match.value);
  });

const filterByNameFilters = <TEntry extends UpdateTargetEntry>(
  entries: ReadonlyArray<TEntry>,
  nameFilters: ReadonlyArray<string>,
  resourceType: UpdateTargetResource,
) =>
  Effect.gen(function* () {
    if (nameFilters.length === 0) {
      return entries;
    }

    const resolvedNameFilters = yield* Effect.forEach(nameFilters, (name) =>
      name.includes("*")
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

export type WorkspaceUpdateSelection =
  /** No selector was given: every configured entry of the type is in scope. */
  | { readonly type: "all" }
  /** A selector matched these installed names. */
  | { readonly type: "names"; readonly names: ReadonlyArray<string> }
  /** A selector matched nothing; the no-op envelope has already been emitted. */
  | { readonly type: "no-op" };

export interface ResolveWorkspaceUpdateSelectionArgs {
  readonly command: string;
  readonly planName: string;
  readonly planDescription: string;
  readonly resourceType: UpdateTargetResource;
  readonly resourceLabel: string;
  readonly resourceLabelPlural: string;
  readonly source: Option.Option<string>;
  readonly nameFilters: ReadonlyArray<string>;
  readonly sourceMayMatchName?: boolean;
}

/**
 * Shared selector semantics for the `<type> update` commands that run through
 * the workspace update plan. Reads the type's configured, enabled entries from
 * the read model, then applies the same source/name filtering every other
 * update verb uses. Returns `all` when no selector was given, so a workspace
 * with nothing configured still reports through the plan builder's own
 * "no configured …" message rather than a selector no-op.
 */
export const resolveWorkspaceUpdateSelection = (args: ResolveWorkspaceUpdateSelectionArgs) =>
  Effect.gen(function* () {
    if (Option.isNone(args.source) && args.nameFilters.length === 0) {
      return { type: "all" } satisfies WorkspaceUpdateSelection;
    }

    const ws = yield* WorkspaceMutations;
    const configured = yield* ws.records
      .rows(args.resourceType)
      .pipe(Effect.map(configuredRowsByName));
    const entries: ReadonlyArray<UpdateTargetEntry> = enabledConfiguredEntries(configured).map(
      ([name, entry]) => [name, entry.source] as const,
    );

    const sourceValue = Option.getOrUndefined(args.source);
    const sourceMayMatchName = args.sourceMayMatchName ?? true;
    const sourceFiltered =
      sourceValue === undefined
        ? entries
        : yield* filterBySource(entries, sourceValue, sourceMayMatchName);

    if (sourceValue !== undefined && sourceFiltered.length === 0) {
      yield* emitNoOpOutcome(args.command, {
        planName: args.planName,
        planDescription: args.planDescription,
        message: `No installed ${args.resourceLabel} matched "${sourceValue}"${
          sourceMayMatchName ? " as a name or source" : " as a source"
        }.`,
      });
      return { type: "no-op" } satisfies WorkspaceUpdateSelection;
    }

    const nameFiltered = yield* filterByNameFilters(
      sourceFiltered,
      args.nameFilters,
      args.resourceType,
    );
    if (args.nameFilters.length > 0 && nameFiltered.length === 0) {
      yield* emitNoOpOutcome(args.command, {
        planName: args.planName,
        planDescription: args.planDescription,
        message: `No installed ${args.resourceLabelPlural} match the ${UPDATE_NAME_FILTER_FLAG} filter.`,
      });
      return { type: "no-op" } satisfies WorkspaceUpdateSelection;
    }

    return {
      type: "names",
      names: nameFiltered.map(([name]) => name),
    } satisfies WorkspaceUpdateSelection;
  });
