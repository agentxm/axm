import { extensionRefName } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import * as Effect from "effect/Effect";
import { chunksOf } from "effect/Array";
import { MAX_RESOLUTION_ITEMS } from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import * as Option from "effect/Option";
import type * as Config from "effect/Config";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry";
import * as Schema from "effect/Schema";
import * as semver from "semver";

import * as Result from "effect/Result";
import {
  extensionTypeToPlural,
  parseExtensionFqnParts,
} from "@agentxm/extension-model/unstable/extensions";
import { type InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { RegistryClientFactory, type RegistryClientFailure } from "@agentxm/registry-client";
import type { DeprecationView } from "@agentxm/extension-model/unstable/extensions/deprecation";
import type { ArchivalView } from "@agentxm/extension-model/unstable/extensions/archival";
import { resolveSource, SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import {
  lockEntryToSourceParams,
  type LockEntry,
  type ExtensionInventoryLifecycle,
  type ExtensionInventoryRow,
  type ExtensionInventory,
  DesiredStateReader,
  desiredStateProblemText,
  effectiveDesiredConstraint,
  LockfileReader,
  type DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import { checkCurrency } from "../version-currency/check-currency.js";
import { WorkspaceInspectionFailed } from "../errors.js";
import { kernelFailureToStepFailure } from "@agentxm/workspace-kernel/reconciliation";

export type ExtensionListFilter = "all" | "outdated" | "deprecated" | "archived" | "lifecycle";

type ExtensionAssessmentState =
  | "not-checked"
  | "current"
  | "available"
  | "changed"
  | "active"
  | "deprecated"
  | "archived"
  | "unknown"
  | "not-applicable";

/** @public Inferred types in this package name it in emitted declarations. */
export interface ExtensionAssessment {
  readonly state: ExtensionAssessmentState;
  readonly reason?: string;
  readonly installedVersion?: string;
  readonly constraint?: string;
  readonly latestMatching?: string;
  readonly latestAvailable?: string;
  readonly installedRevision?: string;
  readonly currentRevision?: string;
  readonly deprecation?: DeprecationView;
  readonly archival?: ArchivalView;
}

export interface AssessedExtensionListItem {
  readonly ref: string;
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly management: ExtensionInventoryLifecycle;
  readonly installed: boolean | null;
  readonly enabled: boolean | null;
  readonly version?: string;
  readonly source?: string;
  readonly assessment: ExtensionAssessment;
  readonly nativeLocations?: NonNullable<ExtensionInventoryRow["nativeLocations"]>;
  readonly agentOutcomes?: ExtensionInventoryRow["agentOutcomes"];
  readonly duplicateDiscoveries?: NonNullable<ExtensionInventoryRow["duplicateDiscoveries"]>;
}

type AcceptedEntry = LockEntry;

type RegistryAcceptedEntry = Extract<
  AcceptedEntry,
  { readonly source: { readonly type: "registry" } }
>;
type GitAcceptedEntry = Extract<AcceptedEntry, { readonly source: { readonly type: "git" } }>;

const isRegistryAcceptedEntry = (entry: AcceptedEntry): entry is RegistryAcceptedEntry =>
  entry.source.type === "registry";
const isGitAcceptedEntry = (entry: AcceptedEntry): entry is GitAcceptedEntry =>
  entry.source.type === "git";

export const collectExtensionListItems = Effect.fn("Workspace.collectExtensionListItems")(
  function* (inventory: ExtensionInventory) {
    const lockfile = yield* LockfileReader;
    const acceptedByRow = yield* Effect.forEach(inventory.items, (row) =>
      lockfile.acceptedEntry(row.type, row.name).pipe(Effect.map(Option.getOrUndefined)),
    );

    return inventory.items.map((row, index): AssessedExtensionListItem => {
      const locked = acceptedByRow[index];
      const configuredSource = row.source;
      const lockedSource =
        locked === undefined ? undefined : printSourceParams(lockEntryToSourceParams(locked));
      const source = configuredSource ?? lockedSource;
      const identitySource =
        locked !== undefined && isRegistryAcceptedEntry(locked)
          ? `${locked.identity.owner}/${extensionTypeToPlural[row.type]}/${locked.identity.name}`
          : (configuredSource ?? lockedSource);
      const fqnSource =
        identitySource !== undefined && isWorkspaceSourceLocator(identitySource)
          ? identitySource.slice("workspace:".length)
          : identitySource;
      const parsed = fqnSource === undefined ? undefined : parseExtensionFqnParts(fqnSource);
      const ref =
        parsed === undefined
          ? `${extensionTypeToPlural[row.type]}/${row.name}`
          : `${parsed.owner}/${extensionTypeToPlural[parsed.type]}/${parsed.name}`;
      return {
        ref,
        type: row.type,
        name: row.name,
        management: row.classification.lifecycle,
        installed: row.installed,
        enabled: row.enabled,
        ...(locked !== undefined && isRegistryAcceptedEntry(locked)
          ? { version: locked.resolved.version }
          : {}),
        ...(source === undefined ? {} : { source }),
        assessment: { state: "not-checked" },
        agentOutcomes: row.agentOutcomes,
        ...(row.nativeLocations === undefined
          ? {}
          : {
              nativeLocations: row.nativeLocations,
              ...(row.duplicateDiscoveries === undefined
                ? {}
                : { duplicateDiscoveries: row.duplicateDiscoveries }),
            }),
      };
    });
  },
);

const decodeInstalledVersion = (value: string, ref: string) =>
  Schema.decodeUnknownEffect(VersionSchema)(value).pipe(
    Effect.mapError(
      () =>
        new WorkspaceInspectionFailed({
          category: "validation",
          detail: `Accepted version for ${ref} is invalid`,
        }),
    ),
  );

type RegistryMetadataResult = Result.Result<
  Option.Option<ExtensionIndex>,
  RegistryClientFailure | Config.ConfigError
>;

const registryAssessment = Effect.fn("Workspace.registryExtensionAssessment")(function* (
  item: AssessedExtensionListItem,
  filter: Exclude<ExtensionListFilter, "all">,
  record: RegistryAcceptedEntry,
  graph: DesiredStateGraph,
  observed: RegistryMetadataResult,
) {
  if (Result.isFailure(observed))
    return {
      state: "unknown",
      reason: kernelFailureToStepFailure(observed.failure).detail,
    } satisfies ExtensionAssessment;
  const index = observed.success;
  if (Option.isNone(index)) {
    return {
      state: "unknown",
      reason: "Extension index was not found",
    } satisfies ExtensionAssessment;
  }
  if (filter !== "outdated") {
    const { archival, deprecation } = index.value;
    return {
      state: archival !== null ? "archived" : deprecation !== null ? "deprecated" : "active",
      ...(archival === null ? {} : { archival }),
      ...(deprecation === null ? {} : { deprecation }),
    } satisfies ExtensionAssessment;
  }
  const installedVersion = yield* decodeInstalledVersion(record.resolved.version, item.ref);
  // Currency is judged within the range the desired-state graph owns for the
  // extension: every direct declaration and Pack that constrains it, never
  // the range one declaring route happens to carry.
  const effective = effectiveDesiredConstraint(graph, { type: item.type, name: item.name });
  if (Result.isFailure(effective)) {
    return {
      state: "unknown",
      reason: desiredStateProblemText(effective.failure),
      installedVersion,
    } satisfies ExtensionAssessment;
  }
  const constraint = effective.success.range;
  const currency = checkCurrency(installedVersion, constraint, index.value);
  const updateAvailable = Option.exists(currency.latestMatching, (latestMatching) =>
    semver.gt(latestMatching, installedVersion),
  );
  return {
    state: updateAvailable ? "available" : "current",
    installedVersion,
    ...Option.match(constraint, {
      onNone: () => ({}),
      onSome: (value) => ({ constraint: value }),
    }),
    ...Option.match(currency.latestMatching, {
      onNone: () => ({}),
      onSome: (value) => ({ latestMatching: value }),
    }),
    latestAvailable: currency.latestAvailable,
  } satisfies ExtensionAssessment;
});

const gitAssessment = Effect.fn("Workspace.gitExtensionAssessment")(function* (
  item: AssessedExtensionListItem,
  record: GitAcceptedEntry,
) {
  const providers = yield* SourceHostProviders;
  const source = yield* resolveSource(printSourceParams(lockEntryToSourceParams(record))).pipe(
    Effect.result,
  );
  if (source._tag === "Failure") {
    return {
      state: "unknown",
      reason: kernelFailureToStepFailure(source.failure).detail,
    } satisfies ExtensionAssessment;
  }
  const refs = yield* providers
    .find(source.success, {
      names: [item.name],
      type: item.type,
      owner: Option.none(),
      versionRange: Option.none(),
    })
    .pipe(Effect.result);
  if (refs._tag === "Failure") {
    return {
      state: "unknown",
      reason: kernelFailureToStepFailure(refs.failure).detail,
    } satisfies ExtensionAssessment;
  }
  const match = refs.success.find(
    (ref) => ref.type === item.type && extensionRefName(ref) === item.name,
  );
  if (match === undefined || match.refType !== "git-hosted") {
    return {
      state: "unknown",
      reason: "Source revision could not be compared",
    } satisfies ExtensionAssessment;
  }
  return {
    state:
      match.gitTreeSha === record.resolved.tree && match.gitCommitSha === record.resolved.commit
        ? "current"
        : "changed",
    installedRevision: `${record.resolved.commit}:${record.resolved.tree}`,
    currentRevision: `${match.gitCommitSha}:${match.gitTreeSha}`,
  } satisfies ExtensionAssessment;
});

const localAssessment = (
  item: AssessedExtensionListItem,
  record: AcceptedEntry | undefined,
): ExtensionAssessment | undefined => {
  if (item.installed === null)
    return {
      state: "unknown",
      reason: "Installation presence could not be observed.",
    } satisfies ExtensionAssessment;
  if (!item.installed) return { state: "not-applicable" } satisfies ExtensionAssessment;
  // Desired state does not reach these packages, so no accepted source applies.
  if (item.management === "leftover") {
    return {
      state: "not-applicable",
      reason: "Installed package is not configured",
    } satisfies ExtensionAssessment;
  }
  if (item.management === "undeclared") {
    return {
      state: "not-applicable",
      reason: "Authored package is not declared",
    } satisfies ExtensionAssessment;
  }
  if (item.source !== undefined && isWorkspaceSourceLocator(item.source)) {
    return { state: "not-applicable" } satisfies ExtensionAssessment;
  }
  if (record === undefined) {
    return {
      state: "unknown",
      reason: "Installed extension has no accepted external resolution",
    } satisfies ExtensionAssessment;
  }
  return undefined;
};

export const assessExtensionListItems = Effect.fn("Workspace.assessExtensionListItems")(function* (
  items: ReadonlyArray<AssessedExtensionListItem>,
  filter: Exclude<ExtensionListFilter, "all">,
) {
  const lockfile = yield* LockfileReader;
  const graph = yield* (yield* DesiredStateReader).graph();
  const observations = yield* Effect.forEach(items, (item, position) =>
    lockfile
      .acceptedEntry(item.type, item.name)
      .pipe(
        Effect.map((accepted) => ({ item, position, record: Option.getOrUndefined(accepted) })),
      ),
  );
  const factory = yield* RegistryClientFactory;
  const assess = ({ item, record }: (typeof observations)[number]) =>
    Effect.gen(function* () {
      const local = localAssessment(item, record);
      if (local !== undefined) return local;
      if (filter === "outdated" && record !== undefined && isGitAcceptedEntry(record))
        return yield* gitAssessment(item, record);
      return { state: "not-applicable" } satisfies ExtensionAssessment;
    });
  const results = yield* Effect.forEach(chunksOf(observations, MAX_RESOLUTION_ITEMS), (batch) =>
    Effect.gen(function* () {
      type Observation = (typeof observations)[number];
      const groups = new Map<
        string,
        Array<Observation & { readonly record: RegistryAcceptedEntry }>
      >();
      const other: Observation[] = [];
      for (const observation of batch) {
        const { record, item } = observation;
        if (
          localAssessment(item, record) !== undefined ||
          record === undefined ||
          !isRegistryAcceptedEntry(record)
        ) {
          other.push(observation);
          continue;
        }
        const group = groups.get(record.source.url.href) ?? [];
        group.push({ ...observation, record });
        groups.set(record.source.url.href, group);
      }
      const registry = yield* Effect.forEach(
        [...groups.values()],
        (group) =>
          Effect.gen(function* () {
            const first = group[0];
            if (first === undefined) return [];
            const selected = yield* factory.forEndpoint(first.record.source.url).pipe(
              Effect.flatMap((client) =>
                client.selectMany(
                  group.map(({ item, record }) => ({
                    owner: record.identity.owner,
                    type: item.type,
                    name: record.identity.name,
                  })),
                ),
              ),
              Effect.result,
            );
            return yield* Effect.forEach(group, ({ item, record, position }, index) =>
              Effect.gen(function* () {
                const observed = Result.isFailure(selected)
                  ? Result.fail(selected.failure)
                  : selected.success[index];
                if (observed === undefined)
                  return yield* Effect.die("Registry selection omitted an assessment identity");
                return {
                  position,
                  item: {
                    ...item,
                    assessment: yield* registryAssessment(item, filter, record, graph, observed),
                  },
                };
              }),
            );
          }),
        { concurrency: Math.max(1, groups.size) },
      );
      const independent = yield* Effect.forEach(
        other,
        (observation) =>
          assess(observation).pipe(
            Effect.map((assessment) => ({
              position: observation.position,
              item: { ...observation.item, assessment },
            })),
          ),
        { concurrency: 6 },
      );
      return [...registry.flat(), ...independent];
    }),
  );
  return results
    .flat()
    .sort((left, right) => left.position - right.position)
    .map(({ item }): AssessedExtensionListItem => item);
});
