/**
 * What one installed extension's state is, uniformly for every catalog type.
 *
 * The answer joins three views of the same extension — what the workspace
 * configured, what it accepted, and what is physically present — and decides
 * the facts a person asked for: whether it is installed at all, where it came
 * from, which version is in force, and how each agent that should carry it is
 * actually doing. Per-agent placement comes from the projection, never from a
 * manager the caller has to know about.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { ManifestIdentitySchema, manifestFilenameForType } from "@agentxm/extension-content";
import {
  CatalogExtensionTypeSchema,
  type CatalogExtensionType,
} from "@agentxm/extension-model/unstable/extension-types";
import { inspectMcpServerAcrossAgents } from "@agentxm/workspace-projection";
import {
  configuredRowsByName,
  ConfiguredAgentOutcomesProvider,
  LockfileReader,
  lockEntryVersion,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "@agentxm/workspace-state";

import { ExtensionNotInstalled } from "../errors.js";

/**
 * Per-agent placement row. `mcp-server` fills every field from its live config
 * inspection; the other per-agent types report the agents the read model
 * observed. Workspace-placement types emit an empty array.
 */
const ShowAgentSchema = Schema.Struct({
  agent: Schema.String,
  status: Schema.String,
  reasonCode: Schema.String,
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

type ShowAgent = typeof ShowAgentSchema.Type;

/**
 * The version a physically present extension declares, read from its own
 * manifest. Used only when nothing is accepted for it in the lockfile.
 */
const canonicalManifestVersion = Effect.fn("ShowExtension.canonicalManifestVersion")(
  function* (args: {
    readonly baseDir: string;
    readonly type: CatalogExtensionType;
    readonly name: string;
    readonly paths: ReadonlyArray<string>;
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestFilename = manifestFilenameForType(args.type);
    const versions = yield* Effect.forEach(
      args.paths,
      (root) =>
        fs.readFileString(path.resolve(args.baseDir, root, manifestFilename)).pipe(
          Effect.flatMap((content) =>
            Effect.try({
              try: () => JSON.parse(content),
              catch: () => null,
            }),
          ),
          Effect.map((value) => Schema.decodeUnknownResult(ManifestIdentitySchema)(value)),
          Effect.map((decoded) =>
            Result.isSuccess(decoded) &&
            decoded.success.type === args.type &&
            decoded.success.name === args.name
              ? decoded.success.version
              : null,
          ),
          Effect.orElseSucceed(() => null),
        ),
      { concurrency: 4 },
    );
    return versions.find((version) => version !== null) ?? null;
  },
);

export interface ShowExtensionRequest {
  readonly type: CatalogExtensionType;
  readonly name: string;
}

export const ShowExtension = {
  query: Effect.fn("ShowExtension.query")(function* (request: ShowExtensionRequest) {
    const location = yield* WorkspaceLocation;
    const records = yield* WorkspaceRecords;
    const lockfile = yield* LockfileReader;
    const settings = yield* SettingsReader;

    const [configured, locked, inventory] = yield* Effect.all(
      [
        records.rows(request.type).pipe(Effect.map(configuredRowsByName)),
        lockfile.entries(request.type),
        records.getExtensionInventory(request.type, {}),
      ],
      { concurrency: "unbounded" },
    );

    const configuredEntry = configured[request.name];
    const lockEntry = locked[request.name];
    const inventoryRow = inventory.items.find((row) => row.name === request.name);

    if (configuredEntry === undefined && lockEntry === undefined && inventoryRow === undefined) {
      return yield* new ExtensionNotInstalled({
        type: request.type,
        name: request.name,
        scope: location.scope,
      });
    }

    // Precedence: what the workspace configured, then what is physically
    // present, then the origins that observed it.
    const source =
      configuredEntry?.source ??
      inventoryRow?.source ??
      inventoryRow?.origins.join(", ") ??
      "unknown";
    const enabled = configuredEntry?.enabled ?? inventoryRow?.enabled ?? null;
    const observedManifestVersion =
      lockEntry === undefined && inventoryRow !== undefined
        ? yield* canonicalManifestVersion({
            baseDir: location.baseDir,
            type: request.type,
            name: request.name,
            paths: inventoryRow.paths,
          })
        : null;

    let agents: ReadonlyArray<ShowAgent> = (inventoryRow?.agentOutcomes ?? []).map((outcome) => ({
      agent: outcome.agentId,
      status: outcome.outcome,
      reasonCode: outcome.reasonCode,
      ...(outcome.path === undefined ? {} : { path: outcome.path }),
      fields: [],
      warnings: [],
      reason:
        outcome.mechanism === undefined
          ? outcome.reason
          : `${outcome.mechanism}: ${outcome.reason}`,
    }));

    if (request.type === "mcp-server") {
      const entry = (yield* settings.entries("mcp-server"))[request.name];
      if (entry !== undefined) {
        const inspections = yield* inspectMcpServerAcrossAgents({
          workspaceRoot: location.baseDir,
          scope: location.scope,
          agentIds: yield* settings.configuredAgents,
          serverName: request.name,
          entry,
        });
        agents = inspections.map((inspection) => ({
          agent: inspection.agentId,
          status:
            inspection.status === "match"
              ? "current"
              : inspection.status === "unsupported"
                ? "unsupported"
                : "failed",
          reasonCode: `mcp-${inspection.status}`,
          path: inspection.path,
          fields: [...inspection.fields],
          warnings: [...inspection.warnings],
          ...(inspection.reason === undefined ? {} : { reason: inspection.reason }),
        }));
      }
    }

    // A hook that is not disabled reports the outcomes a refining provider
    // observes on the agents' own surfaces, in place of the generic derivation.
    if (request.type === "hook" && enabled !== false && inventoryRow !== undefined) {
      const provider = yield* Effect.serviceOption(ConfiguredAgentOutcomesProvider);
      const refine = Option.flatMap(provider, (service) =>
        Option.fromUndefinedOr(service.byExtensionType["hook"]),
      );
      if (Option.isSome(refine)) {
        const outcomes = (yield* refine.value("current")).filter(
          ({ name }) => name === request.name,
        );
        agents = outcomes.map(({ agentId, outcome, reasonCode, mechanism, path, reason }) => ({
          agent: agentId,
          status: outcome,
          reasonCode,
          ...(path === undefined ? {} : { path }),
          fields: [],
          warnings: [],
          reason: mechanism === undefined ? reason : `${mechanism}: ${reason}`,
        }));
      }
    }

    return {
      item: {
        type: request.type,
        name: request.name,
        enabled,
        source,
        version: lockEntry === undefined ? observedManifestVersion : lockEntryVersion(lockEntry),
        scope: location.scope,
        locked: lockEntry !== undefined,
      },
      agents,
    } satisfies ExtensionShowResult;
  }),
};
