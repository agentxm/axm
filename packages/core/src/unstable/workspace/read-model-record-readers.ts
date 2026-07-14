/**
 * Read-model record readers.
 *
 * Centralizes read-model record projection over `WorkspaceReadModel` subject
 * rows.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { AppError } from "../app-error/index.js";
import type { Lockfile } from "../lockfile/index.js";
import {
  parseExtensionFqnParts,
  type ExtensionName,
  type InstallableExtensionType,
} from "../extensions/index.js";
import { createDefaultSettings } from "../settings/index.js";
import { expandGlob } from "../utils/index.js";
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

const createInventoryEmptyLockfile = (): Lockfile => ({
  lockfileVersion: 1,
  skills: {},
});

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

  const stringArrayProperty = (
    value: unknown,
    property: "agents" | "syncedAgents",
  ): ReadonlyArray<string> => {
    if (typeof value !== "object" || value === null) return [];
    const candidate =
      property === "agents"
        ? "agents" in value
          ? value.agents
          : undefined
        : "syncedAgents" in value
          ? value.syncedAgents
          : undefined;
    return Array.isArray(candidate)
      ? candidate.filter((item): item is string => typeof item === "string")
      : [];
  };

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

  const agentsFromResolved = (resolved: Option.Option<unknown>): ReadonlyArray<string> =>
    Option.match(resolved, {
      onNone: () => [],
      onSome: (row) => {
        if (typeof row !== "object" || row === null || !("lockEntry" in row)) return [];
        return [
          ...stringArrayProperty(row.lockEntry, "agents"),
          ...stringArrayProperty(row.lockEntry, "syncedAgents"),
        ];
      },
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
    const observedAgents = [...agentsFromResolved(row.resolved), ...observations.agents];
    return {
      key: row.key,
      lifecycle: row.installationOrigin._tag === "direct" ? "configured" : "implicit",
      activation: row.activation,
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
    activation: null,
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

  const implicitCandidate = (
    key: ExtensionKey,
    lockEntry: unknown,
  ): LifecycleInventoryCandidate => ({
    key,
    lifecycle: "implicit",
    activation: "enabled",
    agents: [
      ...stringArrayProperty(lockEntry, "agents"),
      ...stringArrayProperty(lockEntry, "syncedAgents"),
    ],
  });

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
      case "rule":
      case "hook":
        return [];
    }
  };

  const lifecycleFromPackageMaps = (input: {
    readonly scope: WorkspaceReadModel["scope"];
    readonly type: "files" | "hook";
    readonly configured: Readonly<Record<string, { readonly enabled: boolean }>>;
    readonly locked: Readonly<Record<string, unknown>>;
    readonly packMembers: ReadonlyArray<ExtensionName>;
    readonly actual: ReadonlyArray<unknown>;
  }): ReadonlyArray<LifecycleInventoryCandidate> => {
    const configuredNames = new Set(Object.keys(input.configured));
    const lockedNames = new Set(Object.keys(input.locked));
    const configured = Object.entries(input.configured).map(
      ([name, entry]): LifecycleInventoryCandidate => ({
        key: { scope: input.scope, type: input.type, name },
        lifecycle: "configured",
        activation: entry.enabled ? "enabled" : "disabled",
      }),
    );
    const implicit = [
      ...Object.entries(input.locked)
        .filter(([name]) => !configuredNames.has(name))
        .map(([name, entry]) =>
          implicitCandidate({ scope: input.scope, type: input.type, name }, entry),
        ),
      ...input.packMembers
        .filter((name) => !configuredNames.has(name) && !lockedNames.has(name))
        .map((name) =>
          implicitCandidate({ scope: input.scope, type: input.type, name }, undefined),
        ),
    ];
    const actual = input.actual.flatMap((observation) => {
      if (typeof observation !== "object" || observation === null || !("key" in observation)) {
        return [];
      }
      const key = observation.key;
      if (
        typeof key !== "object" ||
        key === null ||
        !("name" in key) ||
        typeof key.name !== "string"
      ) {
        return [];
      }
      return [
        {
          key: { scope: input.scope, type: input.type, name: key.name },
          lifecycle: "unmanaged",
          activation: null,
          ...observationFromActual(observation),
        } satisfies LifecycleInventoryCandidate,
      ];
    });
    return [...configured, ...implicit, ...actual];
  };

  const resolvedRowToImplicit = (
    type: WorkspaceManagedExtensionType,
    row: { readonly name: string; readonly lockEntry: { readonly type: string } },
  ): Option.Option<ReadModelRecordRow> =>
    deriveSourceMetaFromLockType(row.lockEntry.type).packagingKind === "native"
      ? Option.some({
          type,
          name: row.name,
          source: Option.none(),
          enabled: true,
          packagingKind: "native",
          lifecycle: "implicit",
        })
      : Option.none();

  const packMemberNames = (
    packs: ReadonlyArray<{
      readonly lockEntry: {
        readonly resolvedSkills?: Readonly<Record<string, unknown>> | undefined;
        readonly resolvedCommands?: Readonly<Record<string, unknown>> | undefined;
        readonly resolvedMcpServers?: Readonly<Record<string, unknown>> | undefined;
        readonly resolvedSubagents?: Readonly<Record<string, unknown>> | undefined;
        readonly resolvedFiles?: Readonly<Record<string, unknown>> | undefined;
        readonly resolvedRules?: Readonly<Record<string, unknown>> | undefined;
        readonly resolvedHooks?: Readonly<Record<string, unknown>> | undefined;
      };
    }>,
    key:
      | "resolvedSkills"
      | "resolvedCommands"
      | "resolvedMcpServers"
      | "resolvedSubagents"
      | "resolvedFiles"
      | "resolvedRules"
      | "resolvedHooks",
  ): ReadonlyArray<ExtensionName> => {
    const names: Array<ExtensionName> = [];
    for (const pack of packs) {
      const resolved = pack.lockEntry[key] ?? {};
      for (const fqn of Object.keys(resolved)) {
        const parsed = parseExtensionFqnParts(fqn);
        if (parsed !== undefined) names.push(parsed.name);
      }
    }
    return [...new Set(names)].sort();
  };

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

  type ResolvedReadModelRecordInput = {
    readonly name: string;
    readonly keyName?: string;
    readonly lockEntry: { readonly type: string };
  };

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
    }>;
    readonly resolved: Option.Option<ReadonlyArray<ResolvedReadModelRecordInput>>;
    readonly unmanaged: ReadonlyArray<UnmanagedReadModelRecordInput>;
    readonly ignored: ReadonlyArray<string>;
    readonly packMemberNames?: ReadonlyArray<ExtensionName>;
  }): ReadonlyArray<ReadModelRecordRow> => {
    const claimed = new Set<string>(input.installed.map((row) => row.key.name));
    const directImplicit = Option.getOrElse(input.resolved, () => [])
      .filter((row) => !claimed.has(row.name))
      .map((row) => ({ ...row, name: row.keyName ?? row.name }))
      .filter((row) => !claimed.has(row.name) && !isIgnoredName(input.ignored, row.name))
      .flatMap((row) => Option.getOrElse(resolvedRowToImplicit(input.type, row), () => []));
    const packImplicit = (input.packMemberNames ?? [])
      .filter((name) => !claimed.has(name) && !isIgnoredName(input.ignored, name))
      .map((name) => packMemberToImplicit(input.type, name));

    return [
      ...input.installed.map((row) => installedRowToReadModelRecordRow(input.type, row)),
      ...directImplicit,
      ...packImplicit,
      ...input.unmanaged
        .filter((row) => !isIgnoredName(input.ignored, row.key.name))
        .map((row) => unmanagedRowToReadModelRecordRow(input.type, row)),
    ];
  };

  const getReadModelRecordRows = (type: WorkspaceManagedExtensionType) =>
    args.readScopedContext((scoped) =>
      Effect.gen(function* () {
        switch (type) {
          case "skill": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.skills.installed;
            const resolved = yield* scoped.skills.resolved;
            const unmanaged = yield* scoped.skills.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).skillsConfig?.ignore ?? [];
            return collectReadModelRecordRows({ type, installed, resolved, unmanaged, ignored });
          }
          case "command": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.commands.installed;
            const resolved = yield* scoped.commands.resolved;
            const packs = yield* scoped.packs.resolved;
            const unmanaged = yield* scoped.commands.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).commandsConfig?.ignore ??
              [];
            return collectReadModelRecordRows({
              type,
              installed,
              resolved,
              unmanaged,
              ignored,
              packMemberNames: packMemberNames(
                Option.getOrElse(packs, () => []),
                "resolvedCommands",
              ),
            });
          }
          case "mcp-server": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.mcpServers.installed;
            const resolved = yield* scoped.mcpServers.resolved;
            const unmanaged = yield* scoped.mcpServers.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).mcpServersConfig?.ignore ??
              [];
            return collectReadModelRecordRows({ type, installed, resolved, unmanaged, ignored });
          }
          case "pack": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.packs.installed;
            const resolved = yield* scoped.packs.resolved;
            const unmanaged = yield* scoped.packs.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).packsConfig?.ignore ?? [];
            return collectReadModelRecordRows({ type, installed, resolved, unmanaged, ignored });
          }
          case "subagent": {
            const settings = yield* scoped.state.settings;
            const installed = yield* scoped.subagents.installed;
            const resolved = yield* scoped.subagents.resolved;
            const packs = yield* scoped.packs.resolved;
            const unmanaged = yield* scoped.subagents.unmanaged;
            const ignored =
              Option.getOrElse(settings, () => createDefaultSettings()).subagentsConfig?.ignore ??
              [];
            return collectReadModelRecordRows({
              type,
              installed,
              resolved,
              unmanaged,
              ignored,
              packMemberNames: packMemberNames(
                Option.getOrElse(packs, () => []),
                "resolvedSubagents",
              ),
            });
          }
          case "files": {
            const installed = yield* scoped.files.installed;
            const resolved = yield* scoped.files.resolved;
            const packs = yield* scoped.packs.resolved;
            const unmanaged = yield* scoped.files.unmanaged;
            return collectReadModelRecordRows({
              type,
              installed,
              resolved,
              unmanaged,
              ignored: [],
              packMemberNames: packMemberNames(
                Option.getOrElse(packs, () => []),
                "resolvedFiles",
              ),
            });
          }
          case "rule": {
            const installed = yield* scoped.rules.installed;
            const resolved = yield* scoped.rules.resolved;
            const packs = yield* scoped.packs.resolved;
            const unmanaged = yield* scoped.rules.unmanaged;
            return collectReadModelRecordRows({
              type,
              installed,
              resolved,
              unmanaged,
              ignored: [],
              packMemberNames: packMemberNames(
                Option.getOrElse(packs, () => []),
                "resolvedRules",
              ),
            });
          }
          case "hook": {
            const settingsOption = yield* scoped.state.settings;
            const lockfileOption = yield* scoped.state.lockfile;
            const packs = yield* scoped.packs.resolved;
            const settings = Option.getOrElse(settingsOption, () => createDefaultSettings());
            const configured = settings.hooks ?? {};
            const locked = Option.match(lockfileOption, {
              onNone: () => ({}),
              onSome: (lockfile) => lockfile.hooks ?? {},
            });
            const configuredNames = new Set(Object.keys(configured));
            const lockedEntries = Object.entries(locked);
            const lockedByName = new Map(lockedEntries);
            const configuredRows = Object.entries(configured).map(
              ([name, entry]): ReadModelRecordRow => {
                const lockEntry = lockedByName.get(name);
                return {
                  type,
                  name,
                  source: entry.source,
                  enabled: entry.enabled,
                  packagingKind: packagingKindForResolved(
                    Option.fromUndefinedOr(lockEntry === undefined ? undefined : { lockEntry }),
                    type,
                    entry.source,
                  ),
                  lifecycle: "configured",
                };
              },
            );
            const lockedRows = lockedEntries.flatMap(([name, lockEntry]) => {
              if (configuredNames.has(name)) return [];
              return Option.getOrElse(
                resolvedRowToImplicit(type, {
                  name,
                  lockEntry,
                }),
                () => [],
              );
            });
            const packRows = packMemberNames(
              Option.getOrElse(packs, () => []),
              "resolvedHooks",
            )
              .filter((name) => !configuredNames.has(name))
              .map((name) => packMemberToImplicit(type, name));
            return [...configuredRows, ...lockedRows, ...packRows];
          }
        }
      }),
    );

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
  }): ExtensionInventory => {
    const claimed = new Set(input.installed.map((row) => row.key.name));
    const ignoredPatterns = new Set(input.ignoredPatterns);
    const resolved = input.resolved
      .filter((row) => !claimed.has(row.name) && !isIgnoredName(input.ignoredPatterns, row.name))
      .map((row) =>
        implicitCandidate({ scope: input.scope, type: input.type, name: row.name }, row.lockEntry),
      );
    return projectExtensionInventory({
      lifecycle: [
        ...input.installed.map((row) =>
          lifecycleCandidateFromInstalled(row, input.configuredAgents),
        ),
        ...resolved,
        ...input.unmanaged.map(lifecycleCandidateFromUnmanaged),
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
    args.readScopedContext((scoped) =>
      Effect.gen(function* () {
        const settingsOption = yield* scoped.state.settings;
        const lockfileOption = yield* scoped.state.lockfile;
        const settings = Option.getOrElse(settingsOption, () => createDefaultSettings());
        const lockfile = Option.getOrElse(lockfileOption, createInventoryEmptyLockfile);
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
            });
          }
          case "files": {
            const packs = yield* scoped.packs.resolved;
            const actual = yield* scoped.files.actual;
            return projectExtensionInventory({
              lifecycle: lifecycleFromPackageMaps({
                scope: scoped.scope,
                type,
                configured: settings.files ?? {},
                locked: lockfile.files ?? {},
                packMembers: packMemberNames(
                  Option.getOrElse(packs, () => []),
                  "resolvedFiles",
                ),
                actual,
              }),
              ignored: [],
              ignoredPatterns: new Set(),
              includeIgnored: false,
              agents,
            });
          }
          case "hook": {
            const packs = yield* scoped.packs.resolved;
            const canonical = yield* scoped.canonicalExtensions;
            const actual = canonical
              .filter((occurrence) => occurrence.type === "hook")
              .map((occurrence) => ({
                key: { scope: scoped.scope, type: "hook", name: occurrence.name },
                origin: {
                  _tag:
                    occurrence.origin === "canonical-axm"
                      ? "canonical-axm-hook"
                      : "external-axm-hook",
                },
                contentRoot: occurrence.contentLocation,
              }));
            return projectExtensionInventory({
              lifecycle: lifecycleFromPackageMaps({
                scope: scoped.scope,
                type,
                configured: settings.hooks ?? {},
                locked: lockfile.hooks ?? {},
                packMembers: packMemberNames(
                  Option.getOrElse(packs, () => []),
                  "resolvedHooks",
                ),
                actual,
              }),
              ignored: [],
              ignoredPatterns: new Set(),
              includeIgnored: false,
              agents,
            });
          }
        }
      }),
    );

  return { getReadModelRecordRows, getExtensionInventory };
};
