import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { enabledConfiguredEntries } from "@agentxm/client-core/unstable/extensions";
import type { IdentifierResourceType } from "@agentxm/client-core/unstable/source-resolution";
import type { ContainerType, ExtensionType } from "@agentxm/client-core/unstable/extensions";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import {
  SourceHostProviders,
  resolveSource,
} from "@agentxm/client-core/unstable/source-resolution";
import { expandGlobs } from "@agentxm/client-core/unstable/utils";
import { WorkspaceMutations, configuredRowsByName } from "@agentxm/client-core/unstable/workspace";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag } from "effect/unstable/cli";

import { emitNoOpOutcome } from "./no-op-output.js";

export type UpdateTargetEntry = readonly [name: string, source: string];

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

export interface ResolveUpdateTargetsArgs {
  readonly command: string;
  readonly planName: string;
  readonly planDescription: string;
  readonly entries: ReadonlyArray<UpdateTargetEntry>;
  readonly source: Option.Option<string>;
  readonly nameFilters: ReadonlyArray<string>;
  readonly nameFilterFlag: string;
  readonly resourceType: UpdateTargetResource;
  readonly resourceLabel: string;
  readonly resourceLabelPlural: string;
  readonly noSourceMatchSuggestions?: ReadonlyArray<SuggestedAction>;
  readonly noNameMatchSuggestions?: ReadonlyArray<SuggestedAction>;
}

export type ResolveUpdateTargetsResult =
  | {
      readonly type: "targets";
      readonly entries: ReadonlyArray<UpdateTargetEntry>;
    }
  | {
      readonly type: "no-op";
    };

export interface AllUpdateTargetResolutionsFailedArgs {
  readonly resourceLabelPlural: string;
  readonly recover?: string;
  readonly cmd?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

export const allUpdateTargetResolutionsFailed = (args: AllUpdateTargetResolutionsFailedArgs) =>
  makeAppError({
    code: "network",
    detail: `All matched ${args.resourceLabelPlural} source re-resolutions failed.`,
    ...(args.recover === undefined ? {} : { recover: args.recover }),
    ...(args.cmd === undefined ? {} : { cmd: args.cmd }),
    ...(args.suggestions === undefined ? {} : { suggestions: args.suggestions }),
  });

const sourceMatchesEntrySource = (sourceValue: string, entrySource: string) =>
  Effect.gen(function* () {
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

const filterBySource = (entries: ReadonlyArray<UpdateTargetEntry>, sourceValue: string) =>
  Effect.gen(function* () {
    const nameMatchedEntries = entries.filter(([name]) => name === sourceValue);
    if (nameMatchedEntries.length > 0) {
      return nameMatchedEntries;
    }

    const sourceMatches = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.map(sourceMatchesEntrySource(sourceValue, entry[1]), (matches) =>
          matches ? Option.some(entry) : Option.none<UpdateTargetEntry>(),
        ),
      { concurrency: "unbounded" },
    );

    return sourceMatches.filter(Option.isSome).map((match) => match.value);
  });

const filterByNameFilters = (
  entries: ReadonlyArray<UpdateTargetEntry>,
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

export const resolveUpdateTargets = (args: ResolveUpdateTargetsArgs) =>
  Effect.gen(function* () {
    const sourceValue = Option.getOrUndefined(args.source);
    const sourceFilteredEntries =
      sourceValue === undefined ? args.entries : yield* filterBySource(args.entries, sourceValue);

    if (sourceValue !== undefined && sourceFilteredEntries.length === 0) {
      yield* emitNoOpOutcome(args.command, {
        planName: args.planName,
        planDescription: args.planDescription,
        message: `No installed ${args.resourceLabel} matched "${sourceValue}" as a name or source.`,
        ...(args.noSourceMatchSuggestions === undefined
          ? {}
          : { suggestions: args.noSourceMatchSuggestions }),
      });
      return { type: "no-op" } satisfies ResolveUpdateTargetsResult;
    }

    const filteredEntries = yield* filterByNameFilters(
      sourceFilteredEntries,
      args.nameFilters,
      args.resourceType,
    );

    if (args.nameFilters.length > 0 && filteredEntries.length === 0) {
      yield* emitNoOpOutcome(args.command, {
        planName: args.planName,
        planDescription: args.planDescription,
        message: `No installed ${args.resourceLabelPlural} match the ${args.nameFilterFlag} filter.`,
        ...(args.noNameMatchSuggestions === undefined
          ? {}
          : { suggestions: args.noNameMatchSuggestions }),
      });
      return { type: "no-op" } satisfies ResolveUpdateTargetsResult;
    }

    return {
      type: "targets",
      entries: filteredEntries,
    } satisfies ResolveUpdateTargetsResult;
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

    const resolution = yield* resolveUpdateTargets({
      command: args.command,
      planName: args.planName,
      planDescription: args.planDescription,
      entries,
      source: args.source,
      nameFilters: args.nameFilters,
      nameFilterFlag: UPDATE_NAME_FILTER_FLAG,
      resourceType: args.resourceType,
      resourceLabel: args.resourceLabel,
      resourceLabelPlural: args.resourceLabelPlural,
    });

    if (resolution.type === "no-op") {
      return { type: "no-op" } satisfies WorkspaceUpdateSelection;
    }

    return {
      type: "names",
      names: resolution.entries.map(([name]) => name),
    } satisfies WorkspaceUpdateSelection;
  });
