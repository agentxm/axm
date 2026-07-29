/**
 * Handler for `axm outdated` — reports installed vs available versions.
 *
 * Completely read-only: no workspace mutations.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import type { AppError } from "@agentxm/client-core/unstable/app-error";
import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import type { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import type { ExtensionType } from "@agentxm/client-core/unstable/extensions";
import { createRegistryClient } from "@agentxm/client-core/unstable/registry";
import type { Version } from "@agentxm/client-core/unstable/version-constraints";
import {
  collectAllUpdateEntries,
  collectCommandCurrency,
  collectCommandSourceFreshness,
  collectFilesCurrency,
  collectFilesSourceFreshness,
  collectHookCurrency,
  collectHookSourceFreshness,
  collectKnowledgeCurrency,
  collectKnowledgeSourceFreshness,
  collectMcpServerCurrency,
  collectMcpServerSourceFreshness,
  collectPackCurrency,
  collectRuleCurrency,
  collectRuleSourceFreshness,
  collectSkillCurrency,
  collectSkillSourceFreshness,
  collectSubagentCurrency,
  collectSubagentSourceFreshness,
  WorkspaceMutations,
  type ExtensionCurrencyEntry,
  type ExtensionUpdateEntry,
} from "@agentxm/client-core/unstable/workspace";

import { INSTALL_EXTENSION_FROM_REGISTRY } from "../suggested-actions.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutdatedHandlerArgs {
  readonly type: Option.Option<ExtensionType>;
}

// ---------------------------------------------------------------------------
// JSON output schema
// ---------------------------------------------------------------------------

const OutdatedEntrySchema = Schema.Struct({
  kind: Schema.String,
  ref: Schema.String,
  type: Schema.String,
  installedVersion: Schema.optional(Schema.String),
  constraint: Schema.optional(Schema.String),
  latestMatching: Schema.optional(Schema.String),
  latestAvailable: Schema.optional(Schema.String),
  source: Schema.optional(Schema.String),
  installedTreeHash: Schema.optional(Schema.String),
  currentTreeHash: Schema.optional(Schema.String),
  reason: Schema.optional(Schema.String),
  status: Schema.String,
});

export const OutdatedDocumentFields = {
  items: Schema.Array(OutdatedEntrySchema),
  count: Schema.Number,
} satisfies Schema.Struct.Fields;
export const OutdatedDocumentSchema = Schema.Struct(OutdatedDocumentFields);
export type OutdatedDocument = typeof OutdatedDocumentSchema.Type;

// ---------------------------------------------------------------------------
// Table output
// ---------------------------------------------------------------------------

interface OutdatedTableRow {
  readonly extension: string;
  readonly installed: string;
  readonly constraint: string;
  readonly latest: string;
}

const OutdatedTable = {
  columns: {
    extension: { header: "Extension" },
    installed: { header: "Installed" },
    constraint: { header: "Constraint" },
    latest: { header: "Latest" },
  },
} as const satisfies TableView<OutdatedTableRow>;

registerEntity<OutdatedTableRow>("outdated-extension", {
  list: {
    columns: OutdatedTable.columns,
    singularLabel: "outdated extension",
    pluralLabel: "outdated extensions",
  },
});

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

const formatVersion = (version: Version, isMajor: boolean): string =>
  isMajor ? `${version} (major)` : version;

const resolveDisplayVersion = (entry: ExtensionCurrencyEntry): Version =>
  entry.currency.status === "major-update-available"
    ? entry.currency.latestAvailable
    : Option.getOrElse(entry.currency.latestMatching, () => entry.currency.latestAvailable);

const registryEntryToTableRow = (entry: ExtensionCurrencyEntry): OutdatedTableRow => ({
  extension: entry.ref,
  installed: entry.installedVersion,
  constraint: Option.getOrElse(entry.constraint, () => "-"),
  latest: formatVersion(
    resolveDisplayVersion(entry),
    entry.currency.status === "major-update-available",
  ),
});

const formatTreeHash = (hash: Option.Option<string>): string =>
  Option.match(hash, {
    onNone: () => "-",
    onSome: (value) => value.slice(0, 12),
  });

const sourceEntryToTableRow = (
  entry: Extract<ExtensionUpdateEntry, { readonly kind: "source-freshness" }>,
): OutdatedTableRow => ({
  extension: entry.ref,
  installed: formatTreeHash(entry.installedTreeHash),
  constraint: "source",
  latest: Option.getOrElse(
    Option.map(entry.reason, (reason) => `unknown: ${reason}`),
    () => formatTreeHash(entry.currentTreeHash),
  ),
});

const entryToTableRow = (entry: ExtensionUpdateEntry): OutdatedTableRow => {
  switch (entry.kind) {
    case "registry-version":
      return registryEntryToTableRow(entry);
    case "source-freshness":
      return sourceEntryToTableRow(entry);
  }
};

const registryEntryToJsonRow = (entry: ExtensionCurrencyEntry) => ({
  kind: entry.kind,
  ref: entry.ref,
  type: entry.type,
  installedVersion: entry.installedVersion,
  ...Option.match(entry.constraint, {
    onNone: () => ({}),
    onSome: (c) => ({ constraint: c }),
  }),
  ...Option.match(entry.currency.latestMatching, {
    onNone: () => ({}),
    onSome: (v) => ({ latestMatching: v }),
  }),
  latestAvailable: entry.currency.latestAvailable,
  status: entry.currency.status,
});

const sourceEntryToJsonRow = (
  entry: Extract<ExtensionUpdateEntry, { readonly kind: "source-freshness" }>,
) => ({
  kind: entry.kind,
  ref: entry.ref,
  type: entry.type,
  source: entry.source,
  ...Option.match(entry.installedTreeHash, {
    onNone: () => ({}),
    onSome: (hash) => ({ installedTreeHash: hash }),
  }),
  ...Option.match(entry.currentTreeHash, {
    onNone: () => ({}),
    onSome: (hash) => ({ currentTreeHash: hash }),
  }),
  ...Option.match(entry.reason, {
    onNone: () => ({}),
    onSome: (reason) => ({ reason }),
  }),
  status: entry.status,
});

const entryToJsonRow = (entry: ExtensionUpdateEntry) => {
  switch (entry.kind) {
    case "registry-version":
      return registryEntryToJsonRow(entry);
    case "source-freshness":
      return sourceEntryToJsonRow(entry);
  }
};

const isOutdated = (entry: ExtensionUpdateEntry): boolean => {
  switch (entry.kind) {
    case "registry-version":
      return entry.currency.status !== "current";
    case "source-freshness":
      return entry.status !== "current";
  }
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const formatSummary = (count: number): string => {
  if (count === 0) return "All extensions are up to date.";
  const label = count === 1 ? "extension has" : "extensions have";
  return `${count} ${label} updates available.`;
};

// ---------------------------------------------------------------------------
// Default collector
// ---------------------------------------------------------------------------

const defaultCollect = (type: Option.Option<ExtensionType>) =>
  Effect.gen(function* () {
    const registryUrl = yield* RegistryUrl;
    const client = yield* createRegistryClient(registryUrl);
    return yield* Option.match(type, {
      onNone: () => Effect.scoped(collectAllUpdateEntries(client)),
      onSome: (t) => collectByType(t, client),
    });
  });

/**
 * Registry currency plus git-source freshness for one type.
 *
 * Packs are registry-only, so they have no git source to check.
 */
const withSourceFreshness = (
  currency: Effect.Effect<
    ReadonlyArray<ExtensionUpdateEntry>,
    AppError,
    WorkspaceMutations | SourceHostProviders | FileSystem.FileSystem | Path.Path | Scope.Scope
  >,
  freshness: () => Effect.Effect<
    ReadonlyArray<ExtensionUpdateEntry>,
    AppError,
    WorkspaceMutations | SourceHostProviders | FileSystem.FileSystem | Path.Path | Scope.Scope
  >,
) =>
  Effect.scoped(
    Effect.all([currency, freshness()], { concurrency: "unbounded" }).pipe(
      Effect.map(([registry, source]) => [...registry, ...source]),
    ),
  );

const collectByType = (type: ExtensionType, client: Parameters<typeof collectSkillCurrency>[0]) => {
  switch (type) {
    case "skill":
      return withSourceFreshness(collectSkillCurrency(client), collectSkillSourceFreshness);
    case "command":
      return withSourceFreshness(collectCommandCurrency(client), collectCommandSourceFreshness);
    case "mcp-server":
      return withSourceFreshness(collectMcpServerCurrency(client), collectMcpServerSourceFreshness);
    case "subagent":
      return withSourceFreshness(collectSubagentCurrency(client), collectSubagentSourceFreshness);
    case "pack":
      return collectPackCurrency(client);
    case "files":
      return withSourceFreshness(collectFilesCurrency(client), collectFilesSourceFreshness);
    case "rule":
      return withSourceFreshness(collectRuleCurrency(client), collectRuleSourceFreshness);
    case "hook":
      return withSourceFreshness(collectHookCurrency(client), collectHookSourceFreshness);
    case "knowledge":
      return withSourceFreshness(collectKnowledgeCurrency(client), collectKnowledgeSourceFreshness);
  }
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handleOutdatedWith = <E, R>(
  args: OutdatedHandlerArgs,
  collect: (
    type: Option.Option<ExtensionType>,
  ) => Effect.Effect<ReadonlyArray<ExtensionUpdateEntry>, E, R>,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const entries = yield* collect(args.type);

    if (entries.length === 0) {
      const suggestions = [INSTALL_EXTENSION_FROM_REGISTRY];
      if (
        yield* renderer.result({ items: [], count: 0 }, OutdatedDocumentSchema, {
          suggestions,
        })
      ) {
        return;
      }
      yield* renderer.list("outdated-extension", {
        items: [],
        count: 0,
        emptyMessage: "No configured extensions.",
        suggestions,
      });
      return;
    }

    const outdated = entries.filter(isOutdated);
    const jsonRows = outdated.map(entryToJsonRow);

    if (
      yield* renderer.result({ items: jsonRows, count: jsonRows.length }, OutdatedDocumentSchema)
    ) {
      return;
    }

    if (outdated.length === 0) {
      yield* renderer.list("outdated-extension", {
        items: [],
        count: 0,
        emptyMessage: "All extensions are up to date.",
      });
      return;
    }

    const rows = outdated.map(entryToTableRow);
    yield* renderer.list("outdated-extension", {
      items: rows,
      count: rows.length,
      summary: formatSummary(outdated.length),
    });
  });

export const handleOutdated = (args: OutdatedHandlerArgs) =>
  handleOutdatedWith(args, defaultCollect);
