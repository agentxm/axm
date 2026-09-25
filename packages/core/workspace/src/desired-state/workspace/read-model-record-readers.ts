/**
 * Read-model record readers.
 *
 * Centralizes read-model record projection over `WorkspaceReadModel` subject
 * rows.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { isWithinOrEqual } from "@agentxm/extension-model/unstable/path-types";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import type { WorkspaceStateReadFailure } from "./contracts.js";
import { isAxmManagedMcpEntry } from "../../projection/agent-adapters/index.js";
import { createDefaultSettings } from "../settings/index.js";
import { configuredAgentLifecycleOutcomes } from "./configured-agent-outcomes.js";
import type { DesiredStateGraph } from "./desired-state-graph.js";
import type { LockfileReadError, SettingsReadError } from "./read-model/errors.js";
import {
  countExtensionInventory,
  isDesiredInventoryLifecycle,
  projectExtensionInventory,
  type ExtensionInventory,
  type ExtensionInventoryLifecycle,
  type LifecycleInventoryCandidate,
} from "./read-model/extensions/inventory.js";
import type { WorkspaceLayout } from "./layout.js";
import type { PackMemberBinding } from "./read-model/extensions/projection.js";
import type { WorkspaceReadModel } from "./read-model/service.js";
import type { ActivationState, ExtensionKey, Scope } from "./read-model/types.js";
import { packMemberBindings } from "./desired-pack-members.js";
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
  readonly scope: Scope;
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
    resolved: Option.Option<{
      readonly lockEntry: { readonly source: { readonly type: string } };
    }>,
    type: WorkspaceManagedExtensionType,
    source: string,
  ): PackagingKind =>
    Option.match(resolved, {
      onNone: () => packagingKindForSource(type, source),
      onSome: (row) => deriveSourceMetaFromLockType(row.lockEntry.source.type).packagingKind,
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
      agents:
        row.key.type === "mcp-server"
          ? defaultAgents
          : observedAgents.length === 0
            ? defaultAgents
            : observedAgents,
      origins: observations.origins,
      paths: observations.paths,
    };
  };

  /**
   * Classify one occurrence desired state does not explain: an AXM package
   * under the install root is `leftover`, an AXM package under its type's
   * standard authoring folder is `undeclared`, and anything else — native
   * agent content — is `unmanaged`.
   */
  const unexplainedLifecycle = (
    layout: Option.Option<WorkspaceLayout>,
    key: ExtensionKey,
    actual: unknown,
  ): Exclude<ExtensionInventoryLifecycle, "configured" | "implicit"> => {
    if (Option.isNone(layout) || typeof actual !== "object" || actual === null) return "unmanaged";
    const originTag = stringProperty("origin" in actual ? actual.origin : undefined, "_tag");
    const packageLocation =
      stringProperty(actual, "packageRoot") ?? stringProperty(actual, "contentRoot");
    if (originTag === null || packageLocation === null) return "unmanaged";
    const canonical = originTag.startsWith("canonical-axm-");
    if (!canonical && !originTag.startsWith("external-axm-")) return "unmanaged";
    if (isWithinOrEqual(args.path, layout.value.acquiredRoot, packageLocation)) return "leftover";
    if (
      canonical &&
      layout.value.scope === "project" &&
      isWithinOrEqual(args.path, layout.value.authoredRoot(key.type), packageLocation)
    ) {
      return "undeclared";
    }
    return "unmanaged";
  };

  const lifecycleCandidateFromUnexplained = (
    layout: Option.Option<WorkspaceLayout>,
    row: {
      readonly key: ExtensionKey;
      readonly actual: unknown;
    },
  ): LifecycleInventoryCandidate => ({
    key: row.key,
    lifecycle: unexplainedLifecycle(layout, row.key, row.actual),
    enabled: null,
    installed: true,
    ...observationFromActual(row.actual),
  });

  /** The members the graph binds to `type`, with the activation it settled. */
  const getPackMemberBindings = (
    type: WorkspaceManagedExtensionType,
  ): Effect.Effect<ReadonlyArray<PackMemberBinding>, WorkspaceStateReadFailure> =>
    type === "pack"
      ? Effect.succeed([])
      : args
          .getDesiredStateGraph()
          .pipe(Effect.map((graph) => packMemberBindings(graph, args.scope, type)));

  const installedRowToReadModelRecordRow = <
    TDeclared extends {
      readonly entry: {
        readonly source?: string | undefined;
        readonly enabled?: boolean | undefined;
        readonly origin?: "bundled" | undefined;
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
      readonly resolved: Option.Option<{
        readonly lockEntry: { readonly source: { readonly type: string } };
      }>;
    },
  ): ReadModelRecordRow => {
    const enabled = row.activation === "enabled";
    if (row.installationOrigin._tag === "pack-member") {
      return {
        type,
        name: row.key.name,
        source: Option.none(),
        enabled,
        packagingKind: "native",
        lifecycle: "implicit",
      };
    }
    const source = row.installationOrigin.declared.entry.source;
    const common = {
      type,
      name: row.key.name,
      enabled,
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

  /** One subject's rows: the direct rows it declares, plus the member rows the graph binds. */
  interface SubjectRows {
    readonly installed: ReadonlyArray<{
      readonly key: ExtensionKey;
      readonly installationOrigin:
        | {
            readonly _tag: "direct";
            readonly declared: {
              readonly entry: {
                readonly source?: string | undefined;
                readonly enabled?: boolean | undefined;
                readonly origin?: "bundled" | undefined;
              };
            };
          }
        | { readonly _tag: "pack-member"; readonly member: unknown };
      readonly activation: ActivationState;
      readonly resolved: Option.Option<{
        readonly lockEntry: { readonly source: { readonly type: string } };
      }>;
      readonly actual: ReadonlyArray<{
        readonly packageRoot?: string | null;
        readonly contentRoot?: string | null;
        readonly configFile?: string | null;
        readonly config?: Readonly<Record<string, unknown>> | null;
        readonly origin?: unknown;
      }>;
    }>;
    readonly resolved: ReadonlyArray<{ readonly name: string; readonly lockEntry: unknown }>;
    readonly unmanaged: ReadonlyArray<{
      readonly key: ExtensionKey;
      readonly actual: {
        readonly packageRoot?: string | null;
        readonly contentRoot?: string | null;
        readonly configFile?: string | null;
        readonly config?: Readonly<Record<string, unknown>> | null;
        readonly origin?: unknown;
      };
    }>;
  }

  /** The cells every subject exposes, in the row shapes the record readers consume. */
  interface SubjectCells {
    readonly installed: Effect.Effect<
      SubjectRows["installed"],
      SettingsReadError | LockfileReadError
    >;
    readonly packMemberRows: (
      bindings: ReadonlyArray<PackMemberBinding>,
    ) => Effect.Effect<SubjectRows["installed"], SettingsReadError | LockfileReadError>;
    readonly resolved: Effect.Effect<Option.Option<SubjectRows["resolved"]>, LockfileReadError>;
    readonly unmanaged: Effect.Effect<
      SubjectRows["unmanaged"],
      SettingsReadError | LockfileReadError
    >;
  }

  const subjectCells = (
    scoped: WorkspaceReadModel,
    type: WorkspaceManagedExtensionType,
  ): SubjectCells => {
    switch (type) {
      case "skill":
        return scoped.skills;
      case "mcp-server":
        return scoped.mcpServers;
      case "subagent":
        return scoped.subagents;
      case "rule":
        return scoped.rules;
      case "hook":
        return scoped.hooks;
      case "knowledge":
        return scoped.knowledge;
      case "pack":
        // A Pack is never another Pack's member.
        return { ...scoped.packs, packMemberRows: () => Effect.succeed([]) };
    }
  };

  const readSubjectRows = (
    scoped: WorkspaceReadModel,
    type: WorkspaceManagedExtensionType,
    bindings: ReadonlyArray<PackMemberBinding>,
  ): Effect.Effect<SubjectRows, SettingsReadError | LockfileReadError> =>
    Effect.gen(function* () {
      const subject = subjectCells(scoped, type);
      const direct = yield* subject.installed;
      const members = yield* subject.packMemberRows(bindings);
      const resolved = yield* subject.resolved;
      const unmanaged = yield* subject.unmanaged;
      const memberNames = new Set(members.map((row) => row.key.name));
      return {
        installed: [...direct, ...members],
        resolved: Option.getOrElse(resolved, () => []),
        // A member's observed occurrences belong to its row, never to the
        // unmanaged inventory.
        unmanaged: unmanaged.filter((row) => !memberNames.has(row.key.name)),
      };
    });

  const getReadModelRecordRows = (type: WorkspaceManagedExtensionType) =>
    Effect.gen(function* () {
      const bindings = yield* getPackMemberBindings(type);
      return yield* args.readScopedContext((scoped) =>
        Effect.gen(function* () {
          const rows = yield* readSubjectRows(scoped, type, bindings);
          return [
            ...rows.installed.map((row) => installedRowToReadModelRecordRow(type, row)),
            ...rows.unmanaged.map((row) => unmanagedRowToReadModelRecordRow(type, row)),
          ];
        }),
      );
    });

  const getExtensionInventory = (
    type: WorkspaceManagedExtensionType,
    options: {
      readonly agents?: ReadonlyArray<string>;
    },
  ) =>
    Effect.gen(function* () {
      const bindings = yield* getPackMemberBindings(type);
      return yield* args.readScopedContext((scoped) =>
        Effect.gen(function* () {
          const settingsOption = yield* scoped.state.settings;
          const settings = Option.getOrElse(settingsOption, () => createDefaultSettings());
          const agents = options.agents ?? [];
          const configuredAgents = settings.agents ?? [];
          const rows = yield* readSubjectRows(scoped, type, bindings);
          const inventory = projectExtensionInventory({
            lifecycle: [
              ...rows.installed.map((row) =>
                lifecycleCandidateFromInstalled(row, configuredAgents),
              ),
              ...rows.unmanaged.map((row) => lifecycleCandidateFromUnexplained(scoped.layout, row)),
            ],
            agents: [],
          });
          const withOutcomes = inventory.items.map((row) => ({
            ...row,
            agentOutcomes: isDesiredInventoryLifecycle(row.classification.lifecycle)
              ? configuredAgentLifecycleOutcomes({
                  type: row.type,
                  name: row.name,
                  agentIds: configuredAgents,
                  scope: row.scope,
                  state: "current",
                  targetState: row.enabled === false ? "disabled" : "enabled",
                  installed: row.installed,
                  observedAgentIds: row.agents,
                })
              : [],
          }));
          const items = withOutcomes.filter(
            (row) =>
              agents.length === 0 ||
              agents.some(
                (agentId) =>
                  row.agents.includes(agentId) ||
                  row.agentOutcomes.some((outcome) => outcome.agentId === agentId),
              ),
          );
          return countExtensionInventory(items);
        }),
      );
    });

  const getInventory = (options: { readonly type?: InstallableExtensionType }) =>
    Effect.gen(function* () {
      const types = options.type === undefined ? installableExtensionTypes : [options.type];
      const inventories = yield* Effect.forEach(types, (type) => getExtensionInventory(type, {}), {
        // eslint-disable-next-line axm-policy/no-unbounded-io -- one inventory per fixed installable extension type
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
        leftoverCount: inventories.reduce((total, inventory) => total + inventory.leftoverCount, 0),
        undeclaredCount: inventories.reduce(
          (total, inventory) => total + inventory.undeclaredCount,
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
