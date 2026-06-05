/**
 * Handler for `axm outdated` — reports installed vs available versions.
 *
 * Completely read-only: no workspace mutations.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { RegistryUrl } from "@agentxm/client-core/unstable/auth";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import type { ExtensionType } from "@agentxm/client-core/unstable/extensions";
import { createRegistryClient } from "@agentxm/client-core/unstable/registry";
import type { Version } from "@agentxm/client-core/unstable/version-constraints";
import {
  collectAllCurrencyEntries,
  collectCommandCurrency,
  collectMcpServerCurrency,
  collectPackCurrency,
  collectSkillCurrency,
  collectSubagentCurrency,
  type ExtensionCurrencyEntry,
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
  ref: Schema.String,
  type: Schema.String,
  installedVersion: Schema.String,
  constraint: Schema.optional(Schema.String),
  latestMatching: Schema.optional(Schema.String),
  latestAvailable: Schema.String,
  status: Schema.String,
});

const OutdatedDocumentFields = {
  data: Schema.Array(OutdatedEntrySchema),
  count: Schema.Number,
} satisfies Schema.Struct.Fields;

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

const entryToTableRow = (entry: ExtensionCurrencyEntry): OutdatedTableRow => ({
  extension: entry.ref,
  installed: entry.installedVersion,
  constraint: Option.getOrElse(entry.constraint, () => "-"),
  latest: formatVersion(
    resolveDisplayVersion(entry),
    entry.currency.status === "major-update-available",
  ),
});

const entryToJsonRow = (entry: ExtensionCurrencyEntry) => ({
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
      onNone: () => collectAllCurrencyEntries(client),
      onSome: (t) => collectByType(t, client),
    });
  });

const collectByType = (type: ExtensionType, client: Parameters<typeof collectSkillCurrency>[0]) => {
  switch (type) {
    case "skill":
      return collectSkillCurrency(client);
    case "command":
      return collectCommandCurrency(client);
    case "mcp-server":
      return collectMcpServerCurrency(client);
    case "subagent":
      return collectSubagentCurrency(client);
    case "pack":
      return collectPackCurrency(client);
    default: {
      const empty: ReadonlyArray<ExtensionCurrencyEntry> = [];
      return Effect.succeed(empty);
    }
  }
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handleOutdatedWith = <E, R>(
  args: OutdatedHandlerArgs,
  collect: (
    type: Option.Option<ExtensionType>,
  ) => Effect.Effect<ReadonlyArray<ExtensionCurrencyEntry>, E, R>,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const entries = yield* collect(args.type);

    if (entries.length === 0) {
      const suggestions = [INSTALL_EXTENSION_FROM_REGISTRY];
      if (
        yield* renderer.result({ data: [], count: 0 }, Schema.Struct(OutdatedDocumentFields), {
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

    const outdated = entries.filter((e) => e.currency.status !== "current");
    const jsonRows = outdated.map(entryToJsonRow);

    if (
      yield* renderer.result(
        { data: jsonRows, count: jsonRows.length },
        Schema.Struct(OutdatedDocumentFields),
      )
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
