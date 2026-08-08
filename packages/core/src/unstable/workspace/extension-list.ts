import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as semver from "semver";

import { makeAppError } from "../app-error/index.js";
import {
  extensionTypeToPlural,
  installableExtensionTypes,
  parseExtensionFqnParts,
  parseRegistrySourcePatternParts,
  type ExtensionRef,
  type InstallableExtensionType,
} from "../extensions/index.js";
import { createRegistryClient } from "../registry/index.js";
import { resolveSource, SourceHostProviders } from "../source-resolution/index.js";
import { isWorkspaceSourceLocator } from "../sources/workspace.js";
import { trustRecordKey, type ExtensionTrustRecord } from "../trust/index.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";
import type { ReadModelRecordRow } from "./read-model-record-types.js";
import { WorkspaceMutations } from "./service-interface.js";
import { checkCurrency } from "./version-currency/index.js";

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
  readonly deprecatedAt?: string;
  readonly deprecationNotice?: string;
}

export interface ExtensionListItem {
  readonly ref: string;
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly management: "configured" | "implicit" | "unmanaged";
  readonly installed: boolean;
  readonly enabled: boolean | null;
  readonly version?: string;
  readonly source?: string;
  readonly sourceName?: string;
  readonly assessment: ExtensionAssessment;
}

const recordSource = (row: ReadModelRecordRow | undefined): string | undefined => {
  if (row === undefined) return undefined;
  return typeof row.source === "string" ? row.source : Option.getOrUndefined(row.source);
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
    const ws = yield* WorkspaceMutations;
    const inventory = yield* ws.records.getInventory(type === undefined ? {} : { type });
    const types = type === undefined ? installableExtensionTypes : [type];
    const rowsByKey = new Map<string, ReadModelRecordRow>();
    const rowsByType = yield* Effect.forEach(types, (itemType) => ws.records.rows(itemType), {
      concurrency: "unbounded",
    });
    for (const row of rowsByType.flat()) {
      rowsByKey.set(inventoryKey(row.type, row.name), row);
    }
    const trust = yield* ws.getTrustState();

    return inventory.items.map((row): ExtensionListItem => {
      const trusted = trust.records[trustRecordKey(row.type, row.name)];
      const configuredSource = recordSource(rowsByKey.get(inventoryKey(row.type, row.name)));
      const source = configuredSource ?? trusted?.sourceIdentity;
      const identitySource = trusted?.sourceIdentity ?? configuredSource;
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
        ...(trusted?.resolvedVersion === undefined ? {} : { version: trusted.resolvedVersion }),
        ...(source === undefined ? {} : { source }),
        ...(trusted?.sourceName === undefined ? {} : { sourceName: trusted.sourceName }),
        assessment: { state: "not-checked" },
      };
    });
  },
);

const decodeInstalledVersion = (value: string, ref: string) =>
  Schema.decodeUnknownEffect(VersionSchema)(value).pipe(
    Effect.mapError(() =>
      makeAppError({ code: "validation", detail: `Trusted version for ${ref} is invalid` }),
    ),
  );

const constraintFromSource = (source: string | undefined) => {
  if (source === undefined) return Option.none<string>();
  const parsed = parseRegistrySourcePatternParts(source);
  return Option.fromUndefinedOr(parsed?.versionRange);
};

const registryAssessment = Effect.fn("Workspace.registryExtensionAssessment")(function* (
  item: ExtensionListItem,
  filter: Exclude<ExtensionListFilter, "all">,
  record: ExtensionTrustRecord,
) {
  const ws = yield* WorkspaceMutations;
  if (record.authority !== "registry") {
    return {
      state: "unknown",
      reason: "Missing trusted Registry identity",
    } satisfies ExtensionAssessment;
  }
  const identity = parseExtensionFqnParts(record.sourceIdentity);
  if (identity === undefined || identity.type !== item.type) {
    return {
      state: "unknown",
      reason: "Trusted Registry identity is invalid",
    } satisfies ExtensionAssessment;
  }
  const sourceName = record.sourceName ?? "default";
  const source = yield* ws.getConfiguredSourceByName(sourceName);
  if (Option.isNone(source) || source.value.type !== "registry") {
    return {
      state: "unknown",
      reason: `Supplying Registry source "${sourceName}" is not configured`,
    } satisfies ExtensionAssessment;
  }
  const client = yield* createRegistryClient(source.value.location.href);
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
    return index.value.deprecatedAt === undefined
      ? ({ state: "active" } satisfies ExtensionAssessment)
      : ({
          state: "deprecated",
          deprecatedAt: DateTime.formatIso(index.value.deprecatedAt),
          ...(index.value.deprecationNotice === undefined
            ? {}
            : { deprecationNotice: index.value.deprecationNotice }),
        } satisfies ExtensionAssessment);
  }
  if (record.resolvedVersion === undefined) {
    return {
      state: "unknown",
      reason: "Trusted installed version is missing",
    } satisfies ExtensionAssessment;
  }
  const installedVersion = yield* decodeInstalledVersion(record.resolvedVersion, item.ref);
  const constraint = constraintFromSource(item.source);
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
  record: ExtensionTrustRecord,
) {
  const providers = yield* SourceHostProviders;
  if (record.immutableRevision === undefined) {
    return {
      state: "unknown",
      reason: "Trusted immutable revision is missing",
    } satisfies ExtensionAssessment;
  }
  const source = yield* resolveSource(record.sourceIdentity).pipe(Effect.result);
  if (source._tag === "Failure") {
    return { state: "unknown", reason: source.failure.detail } satisfies ExtensionAssessment;
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
    return { state: "unknown", reason: refs.failure.detail } satisfies ExtensionAssessment;
  }
  const match = refs.success.find((ref) => ref.type === item.type && refName(ref) === item.name);
  if (match === undefined || match.refType !== "git-hosted" || Option.isNone(match.gitTreeSha)) {
    return {
      state: "unknown",
      reason: "Source revision could not be compared",
    } satisfies ExtensionAssessment;
  }
  return {
    state: match.gitTreeSha.value === record.immutableRevision ? "current" : "changed",
    installedRevision: record.immutableRevision,
    currentRevision: match.gitTreeSha.value,
  } satisfies ExtensionAssessment;
});

const gitAuthorities = new Set(["github", "gitlab", "bitbucket", "azurerepos", "git"]);

const assessItem = (
  item: ExtensionListItem,
  filter: Exclude<ExtensionListFilter, "all">,
  record: ExtensionTrustRecord | undefined,
) =>
  Effect.gen(function* () {
    if (!item.installed) return { state: "not-applicable" } satisfies ExtensionAssessment;
    if (record === undefined) {
      return {
        state: "unknown",
        reason: "Installed extension has no trust record",
      } satisfies ExtensionAssessment;
    }
    if (record.authority === "registry") return yield* registryAssessment(item, filter, record);
    if (filter === "outdated" && gitAuthorities.has(record.authority)) {
      return yield* gitAssessment(item, record);
    }
    return { state: "not-applicable" } satisfies ExtensionAssessment;
  });

export const assessExtensionListItems = Effect.fn("Workspace.assessExtensionListItems")(function* (
  items: ReadonlyArray<ExtensionListItem>,
  filter: Exclude<ExtensionListFilter, "all">,
) {
  const ws = yield* WorkspaceMutations;
  const trust = yield* ws.getTrustState();
  return yield* Effect.forEach(
    items,
    (item) =>
      assessItem(item, filter, trust.records[trustRecordKey(item.type, item.name)]).pipe(
        Effect.map((assessment): ExtensionListItem => ({ ...item, assessment })),
      ),
    { concurrency: 6 },
  );
});
