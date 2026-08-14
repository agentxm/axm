import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  CliRenderer,
  type DetailView,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  CatalogExtensionTypeSchema,
  type CatalogExtensionType,
} from "@agentxm/client-core/unstable/extension-types";
import {
  extensionTypeSentenceLabels,
  toExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";
import { inspectMcpServerAcrossAgents } from "@agentxm/client-core/unstable/mcps";
import {
  WorkspaceMutations,
  configuredRowsByName,
  getLockedEntries,
  lockEntryVersion,
} from "@agentxm/client-core/unstable/workspace";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { commandForScope } from "./scoped-command.js";

/**
 * Per-agent placement row. `mcp-server` fills every field from its live config
 * inspection; the other per-agent types report the agents the read model
 * observed. Workspace-placement types emit an empty array.
 */
const ShowAgentSchema = Schema.Struct({
  agent: Schema.String,
  status: Schema.String,
  path: Schema.optionalKey(Schema.String),
  fields: Schema.Array(Schema.String),
  warnings: Schema.Array(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});

/**
 * Installed-state detail for one extension. Identical field set for every
 * catalog type — the per-type variation lives in the sibling `agents` array,
 * never in `item`.
 */
const ShowItemSchema = Schema.Struct({
  type: CatalogExtensionTypeSchema,
  name: Schema.String,
  enabled: Schema.NullOr(Schema.Boolean),
  source: Schema.String,
  version: Schema.NullOr(Schema.String),
  scope: Schema.Literals(["project", "user"]),
  locked: Schema.Boolean,
});

export const ExtensionShowResultSchema = Schema.Struct({
  item: ShowItemSchema,
  agents: Schema.Array(ShowAgentSchema),
});
export type ExtensionShowResult = typeof ExtensionShowResultSchema.Type;

/** Field order of `item`, pinned so every `<type> show` stays uniform. */
export const EXTENSION_SHOW_ITEM_FIELDS = Object.keys(ShowItemSchema.fields);

interface ShowDetailRow {
  readonly type: string;
  readonly name: string;
  readonly enabled: string;
  readonly source: string;
  readonly version: string;
  readonly scope: string;
  readonly locked: string;
}

const ShowDetail = {
  fields: {
    type: { label: "Type" },
    name: { label: "Name" },
    enabled: { label: "Enabled" },
    source: { label: "Source" },
    version: { label: "Version" },
    scope: { label: "Scope" },
    locked: { label: "Locked" },
  },
} as const satisfies DetailView<ShowDetailRow>;

interface ShowAgentRow {
  readonly agent: string;
  readonly status: string;
  readonly path: string;
  readonly detail: string;
}

const AgentTable = {
  columns: {
    agent: { header: "Agent" },
    status: { header: "Status" },
    path: { header: "Path" },
    detail: { header: "Detail" },
  },
} as const satisfies TableView<ShowAgentRow>;

type ShowAgent = typeof ShowAgentSchema.Type;

const yesNo = (value: boolean): string => (value ? "yes" : "no");

export const handleExtensionShow = Effect.fn("ExtensionShow.handle")(function* (args: {
  readonly type: CatalogExtensionType;
  readonly name: string;
}) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const label = extensionTypeSentenceLabels[args.type];

  const [configured, locked, inventory] = yield* Effect.all(
    [
      ws.records.rows(args.type).pipe(Effect.map(configuredRowsByName)),
      getLockedEntries(ws, args.type),
      ws.records.getExtensionInventory(args.type, {}),
    ],
    { concurrency: "unbounded" },
  );

  const configuredEntry = configured[args.name];
  const lockEntry = locked[args.name];
  const inventoryRow = inventory.items.find((row) => row.name === args.name);

  if (configuredEntry === undefined && lockEntry === undefined && inventoryRow === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `${label} "${args.name}" is not installed`,
      suggestions: [
        {
          description: `Inspect installed ${label} entries`,
          cmd: commandForScope(`axm ${toExtensionTypePlural(args.type)} list`, ws.scope),
        },
      ],
    });
  }

  const source =
    configuredEntry?.source ??
    inventoryRow?.source ??
    inventoryRow?.origins.join(", ") ??
    "unknown";
  const enabled = configuredEntry?.enabled ?? inventoryRow?.enabled ?? null;

  let agents: ReadonlyArray<ShowAgent> = (inventoryRow?.agents ?? []).map((agent) => ({
    agent,
    status: "present",
    fields: [],
    warnings: [],
  }));

  if (args.type === "mcp-server") {
    const configuredServers = yield* ws.getConfiguredMcpServerEntries();
    const entry = configuredServers[args.name];
    if (entry !== undefined) {
      const agentIds = yield* ws.getConfiguredAgents();
      const inspections = yield* inspectMcpServerAcrossAgents({
        workspaceRoot: ws.baseDir,
        scope: ws.scope,
        agentIds,
        serverName: args.name,
        entry,
      });
      agents = inspections.map((inspection) => ({
        agent: inspection.agentId,
        status: inspection.status,
        path: inspection.path,
        fields: [...inspection.fields],
        warnings: [...inspection.warnings],
        ...(inspection.reason === undefined ? {} : { reason: inspection.reason }),
      }));
    }
  }

  const result = {
    item: {
      type: args.type,
      name: args.name,
      enabled,
      source,
      version: lockEntry === undefined ? null : lockEntryVersion(lockEntry),
      scope: ws.scope,
      locked: lockEntry !== undefined,
    },
    agents,
  };

  if (yield* renderer.result(result, ExtensionShowResultSchema)) return;

  yield* renderer.detail(
    {
      type: args.type,
      name: args.name,
      enabled: enabled === null ? "n/a" : yesNo(enabled),
      source,
      version: result.item.version ?? "n/a",
      scope: ws.scope,
      locked: yesNo(result.item.locked),
    },
    ShowDetail,
    `${label} ${args.name}`,
  );

  if (agents.length > 0) {
    yield* renderer.table(
      agents.map((agent) => ({
        agent: agent.agent,
        status: agent.status,
        path: agent.path ?? "",
        detail:
          agent.reason ??
          (agent.status === "drift"
            ? agent.fields.join(", ")
            : agent.warnings.length > 0
              ? agent.warnings.join("; ")
              : ""),
      })),
      AgentTable,
      "Agent placements",
    );
  }
});

/**
 * Builds one group's `show` verb. Every catalog type gets the same argument
 * shape and the same result document; only the type id differs.
 */
export const makeExtensionShowCommand = (args: {
  readonly type: CatalogExtensionType;
  readonly group: string;
  readonly exampleName: string;
}) => {
  const label = extensionTypeSentenceLabels[args.type];
  const showConfig = {
    name: Argument.string("name").pipe(Argument.withDescription(`Name of the ${label} to inspect`)),
    scope: scopeFlag.pipe(
      Flag.withDescription("Inspect project (default) or user-level configuration"),
    ),
  } as const;

  return Command.make("show", showConfig, ({ name, scope }) =>
    handleExtensionShow({ type: args.type, name }).pipe(
      withWorkspace({ scope, allowUninitialized: true }),
      withRuntime(`${args.group} show`),
    ),
  ).pipe(
    withArgvTracking(showConfig),
    Command.withDescription(`Inspect one installed ${label}`),
    Command.withExamples([
      {
        command: `axm ${args.group} show ${args.exampleName}`,
        description: `Inspect one installed ${label}`,
      },
      {
        command: `axm ${args.group} show ${args.exampleName} --scope user`,
        description: `Inspect a user-level ${label}`,
      },
    ]),
  );
};
