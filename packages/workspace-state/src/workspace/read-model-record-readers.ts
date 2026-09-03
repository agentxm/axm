/**
 * Read-model record readers.
 *
 * Centralizes read-model record projection over `WorkspaceReadModel` subject
 * rows.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { WorkspaceStateReadFailure } from "./service-interface.js";
import { isAxmManagedMcpEntry } from "./mcp-entry-semantics.js";
import { createDefaultSettings } from "../settings/index.js";
import { configuredAgentLifecycleOutcomes } from "./configured-agent-outcomes.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import type { LockfileReadError, SettingsReadError } from "./read-model/errors.js";
import {
  projectExtensionInventory,
  type ExtensionInventory,
  type LifecycleInventoryCandidate,
} from "./read-model/extensions/inventory.js";
import type { WorkspaceReadModel } from "./read-model/service.js";
import type { ActivationState, ExtensionKey } from "./read-model/types.js";
import { deriveSourceMetaFromLockType } from "./source-metadata.js";
import type { ReadModelRecordRow, PackagingKind } from "./read-model-record-types.js";

type WorkspaceManagedExtensionType = InstallableExtensionType;

type ReadScopedContext = <A>(
  f: (scoped: WorkspaceReadModel) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
) => Effect.Effect<A, WorkspaceStateReadFailure>;

export interface ReadModelRecordReaders {
  readonly getInventory: (options: {
    readonly type?: InstallableExtensionType;
  }) => Effect.Effect<ExtensionInventory, WorkspaceStateReadFailure>;
  readonly getReadModelRecordRows: (
    type: WorkspaceManagedExtensionType,
  ) => Effect.Effect<ReadonlyArray<ReadModelRecordRow>, WorkspaceStateReadFailure>;
  readonly getExtensionInventory: (
    type: WorkspaceManagedExtensionType,
    options: {
      readonly agents?: ReadonlyArray<string>;
    },
  ) => Effect.Effect<ExtensionInventory, WorkspaceStateReadFailure>;
}

export const makeReadModelRecordReaders = (args: {
  readonly baseDir: string;
  readonly path: Path.Path;
  readonly readScopedContext: ReadScopedContext;
  readonly getDesiredStateGraph: () => Effect.Effect<DesiredStateGraph, WorkspaceStateReadFailure>;
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

  const stringProperty = (
    value: unknown,
    property: "_tag" | "agentId" | "packageRoot" | "contentRoot" | "configFile",
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
          : property === "packageRoot"
            ? "packageRoot" in value
              ? value.packageRoot
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
    const packageRoot = stringProperty(actual, "packageRoot");
    const contentRoot = stringProperty(actual, "contentRoot");
    const configFile = stringProperty(actual, "configFile");
    const actualPath = packageRoot ?? contentRoot ?? configFile;
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
  ): Effect.Effect<ReadonlyArray<string>, WorkspaceStateReadFailure> =>
    type === "pack"
      ? Effect.succeed([])
      : args
          .getDesiredStateGraph()
          .pipe(Effect.map((graph) => desiredPackMemberNames(graph, type)));

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
      readonly entry: {
        readonly source?: string | undefined;
        readonly enabled?: boolean;
        readonly origin?: "bundled";
      };
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
      const common = {
        type,
        name: row.key.name,
        enabled: row.activation === "enabled",
        ...(row.installationOrigin.declared.entry.origin === undefined
          ? {}
          : { origin: row.installationOrigin.declared.entry.origin }),
        lifecycle: "configured" as const,
      };
      return source === undefined
        ? { ...common, authority: "inline", packagingKind: "non-native" }
        : {
            ...common,
            source,
            packagingKind: packagingKindForResolved(row.resolved, type, source),
          };
    }

    return packMemberToImplicit(type, row.key.name);
  };

  const unmanagedRowToReadModelRecordRow = (
    type: WorkspaceManagedExtensionType,
    row: {
      readonly key: { readonly name: string };
      readonly actual: {
        readonly packageRoot?: string | null;
        readonly contentRoot?: string | null;
        readonly configFile?: string | null;
        readonly config?: Readonly<Record<string, unknown>> | null;
        readonly origin?: unknown;
      };
    },
  ): ReadModelRecordRow => ({
    type,
    name: row.key.name,
    source: Option.none(),
    enabled: true,
    packagingKind: type === "pack" ? "native" : "non-native",
    locations:
      typeof row.actual.packageRoot === "string"
        ? [args.path.relative(args.baseDir, row.actual.packageRoot)]
        : typeof row.actual.contentRoot === "string"
          ? [args.path.relative(args.baseDir, row.actual.contentRoot)]
          : typeof row.actual.configFile === "string"
            ? [args.path.relative(args.baseDir, row.actual.configFile)]
            : [],
    agents: observationFromActual(row.actual).agents,
    ownershipEvidence:
      row.actual.config !== undefined &&
      row.actual.config !== null &&
      isAxmManagedMcpEntry(row.actual.config)
        ? ["x-axm:managed-entry"]
        : [],
    lifecycle: "unmanaged",
  });

  type UnmanagedReadModelRecordInput = {
    readonly key: { readonly name: string };
    readonly actual: {
      readonly packageRoot?: string | null;
      readonly contentRoot?: string | null;
      readonly configFile?: string | null;
      readonly config?: Readonly<Record<string, unknown>> | null;
      readonly origin?: unknown;
    };
  };

  const collectReadModelRecordRows = <
    TDeclared extends {
      readonly entry: {
        readonly source?: string | undefined;
        readonly enabled?: boolean;
        readonly origin?: "bundled";
      };
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
      readonly actual: ReadonlyArray<{
        readonly packageRoot?: string | null;
        readonly contentRoot?: string | null;
        readonly configFile?: string | null;
        readonly config?: Readonly<Record<string, unknown>> | null;
        readonly origin?: unknown;
      }>;
    }>;
    readonly unmanaged: ReadonlyArray<UnmanagedReadModelRecordInput>;
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
        .filter((row) => !desiredPackMembers.has(row.key.name))
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
              const installed = yield* scoped.skills.installed;
              const unmanaged = yield* scoped.skills.unmanaged;
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                packMemberNames,
              });
            }
            case "mcp-server": {
              const installed = yield* scoped.mcpServers.installed;
              const unmanaged = yield* scoped.mcpServers.unmanaged;
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                packMemberNames,
              });
            }
            case "pack": {
              const installed = yield* scoped.packs.installed;
              const unmanaged = yield* scoped.packs.unmanaged;
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                packMemberNames,
              });
            }
            case "subagent": {
              const installed = yield* scoped.subagents.installed;
              const unmanaged = yield* scoped.subagents.unmanaged;
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
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
                packMemberNames,
              });
            }
            case "hook": {
              const installed = yield* scoped.hooks.installed;
              const unmanaged = yield* scoped.hooks.unmanaged;
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
                packMemberNames,
              });
            }
            case "knowledge": {
              const installed = yield* scoped.knowledge.installed;
              const unmanaged = yield* scoped.knowledge.unmanaged;
              return collectReadModelRecordRows({
                type,
                installed,
                unmanaged,
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
    readonly agents: ReadonlyArray<string>;
    readonly configuredAgents: ReadonlyArray<string>;
    readonly packMemberNames: ReadonlyArray<string>;
  }): ExtensionInventory => {
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
      agents: input.agents,
    });
  };

  const getExtensionInventory = (
    type: WorkspaceManagedExtensionType,
    options: {
      readonly agents?: ReadonlyArray<string>;
    },
  ) =>
    Effect.gen(function* () {
      const packMemberNames = yield* getDesiredPackMemberNames(type);
      return yield* args.readScopedContext((scoped) =>
        Effect.gen(function* () {
          const settingsOption = yield* scoped.state.settings;
          const settings = Option.getOrElse(settingsOption, () => createDefaultSettings());
          const agents = options.agents ?? [];
          const configuredAgents = settings.agents ?? [];
          const finalizeInventory = (inventory: ExtensionInventory): ExtensionInventory => {
            const withOutcomes = inventory.items.map((row) => {
              return {
                ...row,
                agentOutcomes:
                  row.classification.lifecycle === "unmanaged"
                    ? []
                    : configuredAgentLifecycleOutcomes({
                        type: row.type,
                        name: row.name,
                        agentIds: configuredAgents,
                        scope: row.scope,
                        state: "current",
                        targetState: row.enabled === false ? "disabled" : "enabled",
                        installed: row.installed,
                        observedAgentIds: row.agents,
                      }),
              };
            });
            const items = withOutcomes.filter(
              (row) =>
                agents.length === 0 ||
                agents.some(
                  (agentId) =>
                    row.agents.includes(agentId) ||
                    row.agentOutcomes.some((outcome) => outcome.agentId === agentId),
                ),
            );
            return {
              items,
              count: items.length,
              configuredCount: items.filter(
                (item) => item.classification.lifecycle === "configured",
              ).length,
              implicitCount: items.filter((item) => item.classification.lifecycle === "implicit")
                .length,
              installedCount: items.filter((item) => item.installed).length,
              unmanagedCount: items.filter((item) => item.classification.lifecycle === "unmanaged")
                .length,
            };
          };

          switch (type) {
            case "skill": {
              const installed = yield* scoped.skills.installed;
              const resolved = yield* scoped.skills.resolved;
              const unmanaged = yield* scoped.skills.unmanaged;
              return finalizeInventory(
                projectStandardInventory({
                  scope: scoped.scope,
                  type,
                  installed,
                  resolved: Option.getOrElse(resolved, () => []),
                  unmanaged,
                  agents: [],
                  configuredAgents,
                  packMemberNames,
                }),
              );
            }
            case "mcp-server": {
              const installed = yield* scoped.mcpServers.installed;
              const resolved = yield* scoped.mcpServers.resolved;
              const unmanaged = yield* scoped.mcpServers.unmanaged;
              return finalizeInventory(
                projectStandardInventory({
                  scope: scoped.scope,
                  type,
                  installed,
                  resolved: Option.getOrElse(resolved, () => []),
                  unmanaged,
                  agents: [],
                  configuredAgents,
                  packMemberNames,
                }),
              );
            }
            case "subagent": {
              const installed = yield* scoped.subagents.installed;
              const resolved = yield* scoped.subagents.resolved;
              const unmanaged = yield* scoped.subagents.unmanaged;
              return finalizeInventory(
                projectStandardInventory({
                  scope: scoped.scope,
                  type,
                  installed,
                  resolved: Option.getOrElse(resolved, () => []),
                  unmanaged,
                  agents: [],
                  configuredAgents,
                  packMemberNames,
                }),
              );
            }
            case "pack": {
              const installed = yield* scoped.packs.installed;
              const resolved = yield* scoped.packs.resolved;
              const unmanaged = yield* scoped.packs.unmanaged;
              return finalizeInventory(
                projectStandardInventory({
                  scope: scoped.scope,
                  type,
                  installed,
                  resolved: Option.getOrElse(resolved, () => []),
                  unmanaged,
                  agents: [],
                  configuredAgents,
                  packMemberNames,
                }),
              );
            }
            case "rule": {
              const installed = yield* scoped.rules.installed;
              const resolved = yield* scoped.rules.resolved;
              const unmanaged = yield* scoped.rules.unmanaged;
              return finalizeInventory(
                projectStandardInventory({
                  scope: scoped.scope,
                  type,
                  installed,
                  resolved: Option.getOrElse(resolved, () => []),
                  unmanaged,
                  agents: [],
                  configuredAgents,
                  packMemberNames,
                }),
              );
            }
            case "hook": {
              const installed = yield* scoped.hooks.installed;
              const resolved = yield* scoped.hooks.resolved;
              const unmanaged = yield* scoped.hooks.unmanaged;
              return finalizeInventory(
                projectStandardInventory({
                  scope: scoped.scope,
                  type,
                  installed,
                  resolved: Option.getOrElse(resolved, () => []),
                  unmanaged,
                  agents: [],
                  configuredAgents,
                  packMemberNames,
                }),
              );
            }
            case "knowledge": {
              const installed = yield* scoped.knowledge.installed;
              const resolved = yield* scoped.knowledge.resolved;
              const unmanaged = yield* scoped.knowledge.unmanaged;
              return finalizeInventory(
                projectStandardInventory({
                  scope: scoped.scope,
                  type,
                  installed,
                  resolved: Option.getOrElse(resolved, () => []),
                  unmanaged,
                  agents: [],
                  configuredAgents,
                  packMemberNames,
                }),
              );
            }
          }
        }),
      );
    });

  const getInventory = (options: { readonly type?: InstallableExtensionType }) =>
    Effect.gen(function* () {
      const types = options.type === undefined ? installableExtensionTypes : [options.type];
      const inventories = yield* Effect.forEach(types, (type) => getExtensionInventory(type, {}), {
        concurrency: "unbounded",
      });
      const items = inventories
        .flatMap((inventory) => inventory.items)
        .sort((left, right) =>
          left.type === right.type
            ? left.name.localeCompare(right.name)
            : left.type.localeCompare(right.type),
        );
      return {
        items,
        count: items.length,
        configuredCount: inventories.reduce(
          (total, inventory) => total + inventory.configuredCount,
          0,
        ),
        implicitCount: inventories.reduce((total, inventory) => total + inventory.implicitCount, 0),
        installedCount: inventories.reduce(
          (total, inventory) => total + inventory.installedCount,
          0,
        ),
        unmanagedCount: inventories.reduce(
          (total, inventory) => total + inventory.unmanagedCount,
          0,
        ),
      };
    });

  return { getInventory, getReadModelRecordRows, getExtensionInventory };
};
