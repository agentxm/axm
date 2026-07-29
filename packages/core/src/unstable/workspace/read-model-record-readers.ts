/**
 * Read-model record readers.
 *
 * Centralizes read-model record projection over `WorkspaceReadModel` subject
 * rows.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { makeAppError, type AppError } from "../app-error/index.js";
import type { InstallableExtensionType } from "../extensions/index.js";
import { createDefaultSettings } from "../settings/index.js";
import { expandGlob } from "../utils/index.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import type { LockfileReadError, SettingsReadError } from "./read-model/errors.js";
import {
  projectExtensionInventory,
  type ExtensionInventory,
  type IgnoredInventoryCandidate,
  type LifecycleInventoryCandidate,
} from "./read-model/extensions/inventory.js";
import type { WorkspaceReadModel } from "./read-model/service.js";
import type { ActivationState, ExtensionKey } from "./read-model/types.js";
import { deriveSourceMetaFromLockType } from "./source-metadata.js";
import type { ReadModelRecordRow, PackagingKind } from "./read-model-record-types.js";

type WorkspaceManagedExtensionType = InstallableExtensionType;

type ReadScopedContext = <A>(
  f: (scoped: WorkspaceReadModel) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
) => Effect.Effect<A, AppError>;

export interface ReadModelRecordReaders {
  readonly getReadModelRecordRows: (
    type: WorkspaceManagedExtensionType,
  ) => Effect.Effect<ReadonlyArray<ReadModelRecordRow>, AppError>;
  readonly getExtensionInventory: (
    type: WorkspaceManagedExtensionType,
    options: {
      readonly includeIgnored: boolean;
      readonly agents?: ReadonlyArray<string>;
    },
  ) => Effect.Effect<ExtensionInventory, AppError>;
}

export const makeReadModelRecordReaders = (args: {
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly readScopedContext: ReadScopedContext;
  readonly getDesiredStateGraph: () => Effect.Effect<DesiredStateGraph, AppError>;
}): ReadModelRecordReaders => {
  const packagingKindForSource = (
    type: WorkspaceManagedExtensionType,
    source: string,
  ): PackagingKind => {
    if (type === "pack") return "native";
    if (type === "skill") {
      return source.includes("/skills/") || source.startsWith("@") ? "native" : "non-native";
    }
    return source.includes("/") && source.startsWith("@") ? "native" : "non-native";
  };

  const packagingKindForResolved = (
    resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>,
    type: WorkspaceManagedExtensionType,
    source: string,
  ): PackagingKind =>
    Option.match(resolved, {
      onNone: () => packagingKindForSource(type, source),
      onSome: (row) => deriveSourceMetaFromLockType(row.lockEntry.type).packagingKind,
    });

  const isIgnoredName = (patterns: ReadonlyArray<string>, name: string): boolean =>
    patterns.some((pattern) => expandGlob(pattern, [name]).length > 0);

  const stringProperty = (
    value: unknown,
    property: "_tag" | "agentId" | "contentRoot" | "configFile",
  ): string | null => {
    if (typeof value !== "object" || value === null) return null;
    const candidate =
      property === "_tag"
        ? "_tag" in value
          ? value._tag
          : undefined
        : property === "agentId"
          ? "agentId" in value
            ? value.agentId
            : undefined
          : property === "contentRoot"
            ? "contentRoot" in value
              ? value.contentRoot
              : undefined
            : "configFile" in value
              ? value.configFile
              : undefined;
    return typeof candidate === "string" ? candidate : null;
  };

  const observationFromActual = (actual: unknown) => {
    if (typeof actual !== "object" || actual === null) {
      return { agents: [], origins: [], paths: [] };
    }
    const origin = "origin" in actual ? actual.origin : undefined;
    const originTag = stringProperty(origin, "_tag");
    const agentId = stringProperty(origin, "agentId");
    const contentRoot = stringProperty(actual, "contentRoot");
    const configFile = stringProperty(actual, "configFile");
    const actualPath = contentRoot ?? configFile;
    return {
      agents: agentId === null ? [] : [agentId],
      origins: originTag === null ? [] : [originTag],
      paths: actualPath === null ? [] : [args.path.relative(args.baseDir, actualPath)],
    };
  };

  const mergeObservations = (actuals: ReadonlyArray<unknown>) => ({
    agents: actuals.flatMap((actual) => observationFromActual(actual).agents),
    origins: actuals.flatMap((actual) => observationFromActual(actual).origins),
    paths: actuals.flatMap((actual) => observationFromActual(actual).paths),
  });

  const lifecycleCandidateFromInstalled = (
    row: {
      readonly key: ExtensionKey;
      readonly installationOrigin: { readonly _tag: "direct" | "pack-member" };
      readonly activation: ActivationState;
      readonly resolved: Option.Option<unknown>;
      readonly actual: ReadonlyArray<unknown>;
    },
    defaultAgents: ReadonlyArray<string>,
  ): LifecycleInventoryCandidate => {
    const observations = mergeObservations(row.actual);
    const observedAgents = observations.agents;
    return {
      key: row.key,
      lifecycle: row.installationOrigin._tag === "direct" ? "configured" : "implicit",
      enabled: row.activation === "enabled",
      installed: row.actual.length > 0,
      agents: observedAgents.length === 0 ? defaultAgents : observedAgents,
      origins: observations.origins,
      paths: observations.paths,
    };
  };

  const lifecycleCandidateFromUnmanaged = (row: {
    readonly key: ExtensionKey;
    readonly actual: unknown;
  }): LifecycleInventoryCandidate => ({
    key: row.key,
    lifecycle: "unmanaged",
    enabled: null,
    installed: true,
    ...observationFromActual(row.actual),
  });

  const ignoredCandidate = (
    row: {
      readonly key: ExtensionKey;
      readonly reason: string;
    },
    defaultAgents: ReadonlyArray<string>,
  ): IgnoredInventoryCandidate => {
    const actual = "actual" in row ? row.actual : undefined;
    const observation = observationFromActual(actual);
    return {
      key: row.key,
      reason: row.reason,
      ...observation,
      agents: observation.agents.length === 0 ? defaultAgents : observation.agents,
    };
  };

  const ignoredPatternsFor = (
    settings: ReturnType<typeof createDefaultSettings>,
    type: WorkspaceManagedExtensionType,
  ): ReadonlyArray<string> => {
    switch (type) {
      case "skill":
        return settings.skillsConfig?.ignore ?? [];
      case "command":
        return settings.commandsConfig?.ignore ?? [];
      case "mcp-server":
        return settings.mcpServersConfig?.ignore ?? [];
      case "subagent":
        return settings.subagentsConfig?.ignore ?? [];
      case "pack":
        return settings.packsConfig?.ignore ?? [];
      case "files":
        return settings.filesConfig?.ignore ?? [];
      case "hook":
        return settings.hooksConfig?.ignore ?? [];
      case "knowledge":
        return settings.knowledgeConfig?.ignore ?? [];
      // RulesConfig carries instruction-file options only; rules have no ignore list.
      case "rule":
        return [];
    }
  };

  const desiredPackMemberNames = (
    graph: DesiredStateGraph,
    type: WorkspaceManagedExtensionType,
  ): ReadonlyArray<string> =>
    [
      ...new Set(
        graph.nodes
          .filter(
            (node) => node.type === type && node.origins.some((origin) => origin.type === "pack"),
          )
          .map((node) => node.name),
      ),
    ].sort();

  const getDesiredPackMemberNames = (
    type: WorkspaceManagedExtensionType,
  ): Effect.Effect<ReadonlyArray<string>, AppError> =>
    type === "pack"
      ? Effect.succeed([])
      : args.getDesiredStateGraph().pipe(
          Effect.flatMap((graph) =>
            graph.complete
              ? Effect.succeed(desiredPackMemberNames(graph, type))
              : Effect.fail(
                  makeAppError({
                    code: "conflict",
                    detail:
                      "The desired extension graph is incomplete, so pack membership cannot be determined safely.",
                    suggestions: [
                      {
                        description: "Repair or reinstall the configured packs, then retry.",
                        cmd: "axm sync",
                      },
                    ],
                  }),
                ),
          ),
        );

  const packMemberToImplicit = (
    type: WorkspaceManagedExtensionType,
    name: string,
  ): ReadModelRecordRow => ({
    type,
    name,
    source: Option.none(),
    enabled: true,
    packagingKind: "native",
    lifecycle: "implicit",
  });

  const installedRowToReadModelRecordRow = <
    TDeclared extends {
      readonly entry: { readonly source: string; readonly enabled?: boolean };
    },
    TPackMember,
  >(
    type: WorkspaceManagedExtensionType,
    row: {
      readonly key: { readonly name: string };
      readonly installationOrigin:
        | { readonly _tag: "direct"; readonly declared: TDeclared }
        | { readonly _tag: "pack-member"; readonly member: TPackMember };
      readonly activation: "enabled" | "disabled";
      readonly resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>;
    },
  ): ReadModelRecordRow => {
    if (row.installationOrigin._tag === "direct") {
      const source = row.installationOrigin.declared.entry.source;
      return {
        type,
        name: row.key.name,
        source,
        enabled: row.activation === "enabled",
        packagingKind: packagingKindForResolved(row.resolved, type, source),
        lifecycle: "configured",
      };
    }

    return packMemberToImplicit(type, row.key.name);
  };

  const unmanagedRowToReadModelRecordRow = (
    type: WorkspaceManagedExtensionType,
    row: {
      readonly key: { readonly name: string };
      readonly actual: { readonly contentRoot?: string | null };
    },
  ): ReadModelRecordRow => ({
    type,
    name: row.key.name,
    source: Option.none(),
    enabled: true,
    packagingKind: type === "pack" ? "native" : "non-native",
    locations:
      typeof row.actual.contentRoot === "string"
        ? [args.path.relative(args.baseDir, row.actual.contentRoot)]
        : [],
    lifecycle: "unmanaged",
  });

  type UnmanagedReadModelRecordInput = {
    readonly key: { readonly name: string };
    readonly actual: { readonly contentRoot?: string | null };
  };

  const collectReadModelRecordRows = <
    TDeclared extends {
      readonly entry: { readonly source: string; readonly enabled?: boolean };
    },
    TPackMember,
  >(input: {
    readonly type: WorkspaceManagedExtensionType;
    readonly installed: ReadonlyArray<{
      readonly key: { readonly name: string };
      readonly installationOrigin:
        | { readonly _tag: "direct"; readonly declared: TDeclared }
        | { readonly _tag: "pack-member"; readonly member: TPackMember };
      readonly activation: "enabled" | "disabled";
      readonly resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>;
      readonly actual: ReadonlyArray<{ readonly contentRoot?: string | null }>;
    }>;
    readonly unmanaged: ReadonlyArray<UnmanagedReadModelRecordInput>;
    readonly ignored: ReadonlyArray<string>;
    readonly packMemberNames: ReadonlyArray<string>;
  }): ReadonlyArray<ReadModelRecordRow> => {
    const desiredPackMembers = new Set(input.packMemberNames);
    const acceptedInstalled = input.installed.filter(
      (row) => row.installationOrigin._tag === "direct" || desiredPackMembers.has(row.key.name),
    );
    const installedNames = new Set(acceptedInstalled.map((row) => row.key.name));
    const implicitRows = input.packMemberNames
      .filter((name) => !installedNames.has(name))
      .map((name) => packMemberToImplicit(input.type, name));
    const stalePackActuals = input.installed
      .filter(
        (row) =>
          row.installationOrigin._tag === "pack-member" && !desiredPackMembers.has(row.key.name),
      )
      .flatMap((row) => row.actual.map((actual) => ({ key: row.key, actual })));

    return [
      ...acceptedInstalled.map((row) => installedRowToReadModelRecordRow(input.type, row)),
      ...implicitRows,
      ...[...input.unmanaged, ...stalePackActuals]
        .filter(
          (row) =>
            !desiredPackMembers.has(row.key.name) && !isIgnoredName(input.ignored, row.key.name),
        )
        .map((row) => unmanagedRowToReadModelRecordRow(input.type, row)),
    ];
  };

  const getReadModelRecordRows = (type: WorkspaceManagedExtensionType) =>
    Effect.gen(function* () {
      const packMemberNames = yield* getDesiredPackMemberNames(type);
      return yield* args.readScopedContext((scoped) =>
        Effect.gen(function* () {
          switch (type) {
            case "skill": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.skills.installed;
              const unmanaged = yield* scoped.skills.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).skillsConfig?.ignore ??
                [];
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored,
                packMemberNames,
              });
            }
            case "command": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.commands.installed;
              const unmanaged = yield* scoped.commands.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).commandsConfig?.ignore ??
                [];
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored,
                packMemberNames,
              });
            }
            case "mcp-server": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.mcpServers.installed;
              const unmanaged = yield* scoped.mcpServers.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).mcpServersConfig
                  ?.ignore ?? [];
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored,
                packMemberNames,
              });
            }
            case "pack": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.packs.installed;
              const unmanaged = yield* scoped.packs.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).packsConfig?.ignore ?? [];
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored,
                packMemberNames,
              });
            }
            case "subagent": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.subagents.installed;
              const unmanaged = yield* scoped.subagents.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).subagentsConfig?.ignore ??
                [];
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored,
                packMemberNames,
              });
            }
            case "files": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.files.installed;
              const unmanaged = yield* scoped.files.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).filesConfig?.ignore ?? [];
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored,
                packMemberNames,
              });
            }
            case "rule": {
              const installed = yield* scoped.rules.installed;
              const unmanaged = yield* scoped.rules.unmanaged;
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored: [],
                packMemberNames,
              });
            }
            case "hook": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.hooks.installed;
              const unmanaged = yield* scoped.hooks.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).hooksConfig?.ignore ?? [];
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored,
                packMemberNames,
              });
            }
            case "knowledge": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.knowledge.installed;
              const unmanaged = yield* scoped.knowledge.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).knowledgeConfig?.ignore ??
                [];
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                ignored,
                packMemberNames,
              });
            }
          }
        }),
      );
    });

  const projectStandardInventory = (input: {
    readonly scope: WorkspaceReadModel["scope"];
    readonly type: WorkspaceManagedExtensionType;
    readonly installed: ReadonlyArray<{
      readonly key: ExtensionKey;
      readonly installationOrigin: { readonly _tag: "direct" | "pack-member" };
      readonly activation: ActivationState;
      readonly resolved: Option.Option<unknown>;
      readonly actual: ReadonlyArray<unknown>;
    }>;
    readonly resolved: ReadonlyArray<{
      readonly name: string;
      readonly lockEntry: unknown;
    }>;
    readonly unmanaged: ReadonlyArray<{
      readonly key: ExtensionKey;
      readonly actual: unknown;
    }>;
    readonly ignored: ReadonlyArray<{
      readonly key: ExtensionKey;
      readonly reason: string;
    }>;
    readonly ignoredPatterns: ReadonlyArray<string>;
    readonly includeIgnored: boolean;
    readonly agents: ReadonlyArray<string>;
    readonly configuredAgents: ReadonlyArray<string>;
    readonly packMemberNames: ReadonlyArray<string>;
  }): ExtensionInventory => {
    const ignoredPatterns = new Set(input.ignoredPatterns);
    const desiredPackMembers = new Set(input.packMemberNames);
    const acceptedInstalled = input.installed.filter(
      (row) => row.installationOrigin._tag === "direct" || desiredPackMembers.has(row.key.name),
    );
    const installedNames = new Set(acceptedInstalled.map((row) => row.key.name));
    const desiredUnmanaged = input.unmanaged.filter((row) => desiredPackMembers.has(row.key.name));
    const desiredUnmanagedNames = new Set(desiredUnmanaged.map((row) => row.key.name));
    const implicitMissing = input.packMemberNames
      .filter((name) => !installedNames.has(name) && !desiredUnmanagedNames.has(name))
      .map((name): LifecycleInventoryCandidate => ({
        key: {
          scope: input.scope,
          type: input.type,
          name,
        },
        lifecycle: "implicit",
        enabled: true,
        installed: false,
        agents: input.configuredAgents,
        origins: [],
        paths: [],
      }));
    const implicitObserved = desiredUnmanaged.map((row) => ({
      ...lifecycleCandidateFromUnmanaged(row),
      lifecycle: "implicit" as const,
      enabled: true,
    }));
    const stalePackActuals = input.installed
      .filter(
        (row) =>
          row.installationOrigin._tag === "pack-member" && !desiredPackMembers.has(row.key.name),
      )
      .flatMap((row) => row.actual.map((actual) => ({ key: row.key, actual })));

    return projectExtensionInventory({
      lifecycle: [
        ...acceptedInstalled.map((row) =>
          lifecycleCandidateFromInstalled(row, input.configuredAgents),
        ),
        ...implicitObserved,
        ...implicitMissing,
        ...input.unmanaged
          .filter((row) => !desiredPackMembers.has(row.key.name))
          .map(lifecycleCandidateFromUnmanaged),
        ...stalePackActuals.map(lifecycleCandidateFromUnmanaged),
      ],
      ignored: input.ignored.map((row) => ignoredCandidate(row, input.configuredAgents)),
      ignoredPatterns,
      includeIgnored: input.includeIgnored,
      agents: input.agents,
    });
  };

  const getExtensionInventory = (
    type: WorkspaceManagedExtensionType,
    options: {
      readonly includeIgnored: boolean;
      readonly agents?: ReadonlyArray<string>;
    },
  ) =>
    Effect.gen(function* () {
      const packMemberNames = yield* getDesiredPackMemberNames(type);
      return yield* args.readScopedContext((scoped) =>
        Effect.gen(function* () {
          const settingsOption = yield* scoped.state.settings;
          const settings = Option.getOrElse(settingsOption, () => createDefaultSettings());
          const ignoredPatterns = ignoredPatternsFor(settings, type);
          const agents = options.agents ?? [];

          switch (type) {
            case "skill": {
              const installed = yield* scoped.skills.installed;
              const resolved = yield* scoped.skills.resolved;
              const unmanaged = yield* scoped.skills.unmanaged;
              const ignored = yield* scoped.skills.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
            case "command": {
              const installed = yield* scoped.commands.installed;
              const resolved = yield* scoped.commands.resolved;
              const unmanaged = yield* scoped.commands.unmanaged;
              const ignored = yield* scoped.commands.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
            case "mcp-server": {
              const installed = yield* scoped.mcpServers.installed;
              const resolved = yield* scoped.mcpServers.resolved;
              const unmanaged = yield* scoped.mcpServers.unmanaged;
              const ignored = yield* scoped.mcpServers.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
            case "subagent": {
              const installed = yield* scoped.subagents.installed;
              const resolved = yield* scoped.subagents.resolved;
              const unmanaged = yield* scoped.subagents.unmanaged;
              const ignored = yield* scoped.subagents.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
            case "pack": {
              const installed = yield* scoped.packs.installed;
              const resolved = yield* scoped.packs.resolved;
              const unmanaged = yield* scoped.packs.unmanaged;
              const ignored = yield* scoped.packs.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
            case "rule": {
              const installed = yield* scoped.rules.installed;
              const resolved = yield* scoped.rules.resolved;
              const unmanaged = yield* scoped.rules.unmanaged;
              const ignored = yield* scoped.rules.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
            case "files": {
              const installed = yield* scoped.files.installed;
              const resolved = yield* scoped.files.resolved;
              const unmanaged = yield* scoped.files.unmanaged;
              const ignored = yield* scoped.files.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
            case "hook": {
              const installed = yield* scoped.hooks.installed;
              const resolved = yield* scoped.hooks.resolved;
              const unmanaged = yield* scoped.hooks.unmanaged;
              const ignored = yield* scoped.hooks.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
            case "knowledge": {
              const installed = yield* scoped.knowledge.installed;
              const resolved = yield* scoped.knowledge.resolved;
              const unmanaged = yield* scoped.knowledge.unmanaged;
              const ignored = yield* scoped.knowledge.ignored;
              return projectStandardInventory({
                scope: scoped.scope,
                type,
                installed,
                resolved: Option.getOrElse(resolved, () => []),
                unmanaged,
                ignored,
                ignoredPatterns,
                includeIgnored: options.includeIgnored,
                agents,
                configuredAgents: settings.agents ?? [],
                packMemberNames,
              });
            }
          }
        }),
      );
    });

  return { getReadModelRecordRows, getExtensionInventory };
};
