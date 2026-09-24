import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as semver from "semver";

import * as Result from "effect/Result";
import {
  extensionTypeToPlural,
  parseExtensionFqnParts,
} from "@agentxm/extension-model/unstable/extensions";
import {
  installableExtensionTypes,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { RegistryClientFactory } from "@agentxm/registry-client";
import type { DeprecationView } from "@agentxm/extension-model/unstable/extensions/deprecation";
import { resolveSource, SourceHostProviders } from "../../resolution/sources/index.js";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { lockEntryToSourceParams } from "../../desired-state/index.js";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { AcceptedExtensionResolution } from "../../desired-state/index.js";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import type { ExtensionInventoryLifecycle, ReadModelRecordRow } from "../../desired-state/index.js";
import {
  DesiredStateReader,
  desiredStateProblemText,
  effectiveDesiredConstraint,
  LockfileReader,
  WorkspaceRecords,
  type DesiredStateGraph,
} from "../../desired-state/index.js";
import { checkCurrency } from "../version-currency/check-currency.js";
import { WorkspaceInspectionFailed } from "../errors.js";
import { describeInspectionFailure } from "../describe-failure.js";

export type ExtensionListFilter = "all" | "outdated" | "deprecated";

export type ExtensionAssessmentState =
  | "not-checked"
  | "current"
  | "available"
  | "changed"
  | "active"
  | "deprecated"
  | "unknown"
  | "not-applicable";

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
}

export interface ExtensionListItem {
  readonly ref: string;
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly management: ExtensionInventoryLifecycle;
  readonly installed: boolean;
  readonly enabled: boolean | null;
  readonly version?: string;
  readonly source?: string;
  readonly assessment: ExtensionAssessment;
}

type AcceptedEntry = AcceptedExtensionResolution;

type RegistryAcceptedEntry = Extract<
  AcceptedEntry,
  { readonly source: { readonly type: "registry" } }
>;
type GitAcceptedEntry = Extract<AcceptedEntry, { readonly source: { readonly type: "git" } }>;

const isRegistryAcceptedEntry = (entry: AcceptedEntry): entry is RegistryAcceptedEntry =>
  entry.source.type === "registry";
const isGitAcceptedEntry = (entry: AcceptedEntry): entry is GitAcceptedEntry =>
  entry.source.type === "git";

const recordSource = (row: ReadModelRecordRow | undefined): string | undefined => {
  if (row === undefined) return undefined;
  const source = row.source;
  if (source === undefined) return undefined;
  return typeof source === "string" ? source : Option.getOrUndefined(source);
};

const refName = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "mcp-server":
      return ref.server.name;
    case "subagent":
      return ref.subagent.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "knowledge":
      return ref.knowledge.name;
    case "pack":
      return ref.pack.name;
  }
};

const inventoryKey = (type: string, name: string): string => `${type}:${name}`;

export const collectExtensionListItems = Effect.fn("Workspace.collectExtensionListItems")(
  function* (type?: InstallableExtensionType) {
    const lockfile = yield* LockfileReader;
    const records = yield* WorkspaceRecords;
    const inventory = yield* records.getInventory(type === undefined ? {} : { type });
    const types = type === undefined ? installableExtensionTypes : [type];
    const rowsByKey = new Map<string, ReadModelRecordRow>();
    const rowsByType = yield* Effect.forEach(types, (itemType) => records.rows(itemType), {
      concurrency: "unbounded",
    });
    for (const row of rowsByType.flat()) {
      rowsByKey.set(inventoryKey(row.type, row.name), row);
    }
    const acceptedByRow = yield* Effect.forEach(inventory.items, (row) =>
      lockfile.acceptedEntry(row.type, row.name).pipe(Effect.map(Option.getOrUndefined)),
    );

    return inventory.items.map((row, index): ExtensionListItem => {
      const locked = acceptedByRow[index];
      const configuredSource = recordSource(rowsByKey.get(inventoryKey(row.type, row.name)));
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

const registryAssessment = Effect.fn("Workspace.registryExtensionAssessment")(function* (
  item: ExtensionListItem,
  filter: Exclude<ExtensionListFilter, "all">,
  record: RegistryAcceptedEntry,
  graph: DesiredStateGraph,
) {
  const identity = { owner: record.identity.owner, type: item.type, name: record.identity.name };
  const factory = yield* RegistryClientFactory;
  const client = yield* factory.forLocation(record.source.url.href);
  const index = yield* client.getExtensionIndex({
    owner: identity.owner,
    type: identity.type,
    name: identity.name,
  });
  if (Option.isNone(index)) {
    return {
      state: "unknown",
      reason: "Extension index was not found",
    } satisfies ExtensionAssessment;
  }
  if (filter === "deprecated") {
    return index.value.deprecation === null
      ? ({ state: "active" } satisfies ExtensionAssessment)
      : ({
          state: "deprecated",
          deprecation: index.value.deprecation,
        } satisfies ExtensionAssessment);
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
  item: ExtensionListItem,
  record: GitAcceptedEntry,
) {
  const providers = yield* SourceHostProviders;
  const source = yield* resolveSource(printSourceParams(lockEntryToSourceParams(record))).pipe(
    Effect.result,
  );
  if (source._tag === "Failure") {
    return {
      state: "unknown",
      reason: describeInspectionFailure(source.failure),
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
      reason: describeInspectionFailure(refs.failure),
    } satisfies ExtensionAssessment;
  }
  const match = refs.success.find((ref) => ref.type === item.type && refName(ref) === item.name);
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

const assessItem = (
  item: ExtensionListItem,
  filter: Exclude<ExtensionListFilter, "all">,
  record: AcceptedEntry | undefined,
  graph: DesiredStateGraph,
) =>
  Effect.gen(function* () {
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
    if (record === undefined) {
      return {
        state: "unknown",
        reason: "Installed extension has no accepted external resolution",
      } satisfies ExtensionAssessment;
    }
    if (isRegistryAcceptedEntry(record)) {
      return yield* registryAssessment(item, filter, record, graph);
    }
    if (filter === "outdated" && isGitAcceptedEntry(record)) {
      return yield* gitAssessment(item, record);
    }
    return { state: "not-applicable" } satisfies ExtensionAssessment;
  });

export const assessExtensionListItems = Effect.fn("Workspace.assessExtensionListItems")(function* (
  items: ReadonlyArray<ExtensionListItem>,
  filter: Exclude<ExtensionListFilter, "all">,
) {
  const lockfile = yield* LockfileReader;
  const graph = yield* (yield* DesiredStateReader).graph();
  return yield* Effect.forEach(
    items,
    (item) => {
      return lockfile.acceptedEntry(item.type, item.name).pipe(
        Effect.flatMap((accepted) =>
          assessItem(item, filter, Option.getOrUndefined(accepted), graph),
        ),
        Effect.map((assessment): ExtensionListItem => ({ ...item, assessment })),
      );
    },
    { concurrency: 6 },
  );
});
