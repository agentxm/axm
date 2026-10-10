import {
  mcpDistributionCandidates,
  mcpDistributionDestination,
  mcpDistributionId,
  manifestInputs,
  mcpInputVariables,
  mcpInputId,
  resolveMcpInvocation,
  mcpRunner,
  readMcpServerManifestAt,
} from "@agentxm/workspace-kernel/agent-adapters";
import { withInspectionReadView } from "../read-view.js";
/**
 * What one installed extension's state is, uniformly for every installable type.
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
  InstallableExtensionTypeSchema,
  type InstallableExtensionType,
} from "@agentxm/extension-model/unstable/extensions/installable-types";
import { inspectDesiredMcpServer } from "@agentxm/workspace-kernel/projection";
import {
  ShowAgentOutcomeSchema,
  filterShowAgentOutcomes,
  type ShowAgentOutcome,
} from "./agent-outcomes.js";
import {
  DesiredStateReader,
  LockfileReader,
  lockEntryVersion,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "@agentxm/workspace-kernel/workspace-state";

import { ExtensionNotInstalled } from "../errors.js";

/**
 * Installed-state detail for one extension. Identical field set for every
 * installable type — the per-type variation lives in the sibling `agentOutcomes` array,
 * never in `item`.
 */
const ShowItemSchema = Schema.Struct({
  type: InstallableExtensionTypeSchema,
  name: Schema.String,
  enabled: Schema.NullOr(Schema.Boolean),
  source: Schema.String,
  version: Schema.NullOr(Schema.String),
  scope: Schema.Literals(["project", "user"]),
  locked: Schema.Boolean,
});

const nativeMcpRoutes: Readonly<Record<string, string>> = {
  "claude-code": "Open /mcp in Claude Code and select this server",
  codex: "Open /mcp in Codex and select this server",
  cursor: "Open Cursor MCP settings and select this server",
  "github-copilot-cli": "Open /mcp in Copilot CLI and select this server in the dashboard",
  opencode: "Open /mcps in OpenCode V2 and select this server",
  vscode: "Run MCP: List Servers in the selected VS Code profile and select this server",
  pi: "Open /mcp in Pi 1.0 or later and select this server",
};

const McpFactsSchema = Schema.Struct({
  sourceVersionLocked: Schema.Boolean,
  runtimeArtifactPinned: Schema.NullOr(Schema.Boolean),
  cwd: Schema.Literals(["host-default", "directory", "missing", "unverified", "not-applicable"]),
  runtime: Schema.Literal("not-checked"),
  distributions: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: Schema.String,
      transport: Schema.String,
      destination: Schema.String,
      selected: Schema.Boolean,
      supported: Schema.Boolean,
      reason: Schema.optionalKey(Schema.String),
      inputs: Schema.Array(
        Schema.Struct({
          id: Schema.String,
          required: Schema.Boolean,
          secret: Schema.Boolean,
          repeated: Schema.Boolean,
          hasDefault: Schema.Boolean,
        }),
      ),
    }),
  ),
});

export const ExtensionShowResultSchema = Schema.Struct({
  item: ShowItemSchema,
  agentOutcomes: Schema.Array(ShowAgentOutcomeSchema),
  mcp: Schema.optionalKey(McpFactsSchema),
});
export type ExtensionShowResult = typeof ExtensionShowResultSchema.Type;

/** Field order of `item`, pinned so every `<type> show` stays uniform. */
export const EXTENSION_SHOW_ITEM_FIELDS = Object.keys(ShowItemSchema.fields);

/**
 * The version a physically present extension declares, read from its own
 * manifest. Used only when nothing is accepted for it in the lockfile.
 */
const canonicalManifestVersion = Effect.fn("ShowExtension.canonicalManifestVersion")(
  function* (args: {
    readonly baseDir: string;
    readonly type: InstallableExtensionType;
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
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly agents?: ReadonlyArray<string>;
}

export const ShowExtension = {
  query: Effect.fn("ShowExtension.query")(function* (request: ShowExtensionRequest) {
    const location = yield* WorkspaceLocation;
    const records = yield* WorkspaceRecords;
    const lockfile = yield* LockfileReader;
    const settings = yield* SettingsReader;

    const [locked, inventory] = yield* Effect.all(
      [
        // The accepted resolution the desired name resolves to: for a sourced
        // MCP connection that is its source's shared row, not a row under
        // the local name.
        lockfile.acceptedEntry(request.type, request.name),
        records.getExtensionInventory(request.type, {}),
      ],
      // eslint-disable-next-line axm-policy/no-unbounded-io -- fixed two-way join of accepted lock entry and inventory
      { concurrency: "unbounded" },
    );

    const lockEntry = Option.getOrUndefined(locked);
    const inventoryRow = inventory.items.find((row) => row.name === request.name);
    const configuredEntry =
      inventoryRow?.classification.lifecycle === "configured" ? inventoryRow : undefined;

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

    let agentOutcomes: ReadonlyArray<ShowAgentOutcome> = inventoryRow?.agentOutcomes ?? [];

    let mcp: typeof McpFactsSchema.Type | undefined;
    if (request.type === "mcp-server") {
      const entry = (yield* settings.entries("mcp-server"))[request.name];
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      let cwd: (typeof McpFactsSchema.Type)["cwd"] =
        entry?.connection?.transport === "stdio" ? "host-default" : "not-applicable";
      if (entry?.connection?.transport === "stdio" && entry.connection.cwd !== undefined) {
        const selected = entry.connection.cwd;
        const directory =
          selected.base === "absolute"
            ? selected.path
            : path.resolve(location.baseDir, selected.path);
        const result = yield* Effect.result(fs.stat(directory));
        cwd =
          result._tag === "Success"
            ? result.success.type === "Directory"
              ? "directory"
              : "missing"
            : result.failure.reason._tag === "NotFound"
              ? "missing"
              : "unverified";
      }
      let distributions: (typeof McpFactsSchema.Type)["distributions"] = [];
      let runtimeArtifactPinned: boolean | null = null;
      if (entry?.kind !== "inline") {
        for (const root of inventoryRow?.paths ?? []) {
          const directory = path.resolve(location.baseDir, root);
          // Inventory also includes native config files, which cannot contain
          // an authored or acquired package manifest.
          const stat = yield* Effect.result(fs.stat(directory));
          if (Result.isFailure(stat) || stat.success.type !== "Directory") continue;
          const manifest = yield* readMcpServerManifestAt(directory);
          if (Option.isNone(manifest)) continue;
          const resolved = resolveMcpInvocation({
            manifest: manifest.value,
            distribution: entry?.distribution,
            bindings: entry?.bindings,
            auth: entry?.auth,
          });
          if (resolved._tag === "resolved") {
            runtimeArtifactPinned = resolved.runtimeArtifactPinned;
            cwd = resolved.connection.transport === "stdio" ? "host-default" : "not-applicable";
          }
          distributions = mcpDistributionCandidates(manifest.value).map((candidate) => {
            const runner = candidate.kind === "package" ? mcpRunner(candidate.package) : undefined;
            return {
              id: candidate.id,
              kind: candidate.kind,
              transport: candidate.selector.transport,
              destination: mcpDistributionDestination(candidate),
              selected:
                entry?.distribution !== undefined &&
                mcpDistributionId(entry.distribution) === candidate.id,
              supported: runner?._tag !== "unsupported",
              ...(runner?._tag === "unsupported" ? { reason: runner.reason } : {}),
              inputs: manifestInputs(candidate)
                .flatMap((input) => [
                  input,
                  ...Object.entries(mcpInputVariables(input.input) ?? {}).map(
                    ([variable, nested]) => ({
                      ...input,
                      target: { ...input.target, variable },
                      input: nested,
                    }),
                  ),
                ])
                .map(({ target, input, repeated }) => ({
                  id: mcpInputId(target),
                  required: input.isRequired === true,
                  secret: input.isSecret === true,
                  repeated,
                  hasDefault: input.default !== undefined,
                })),
            };
          });
          break;
        }
      }
      mcp = {
        sourceVersionLocked: lockEntry !== undefined,
        runtimeArtifactPinned,
        cwd,
        runtime: "not-checked",
        distributions,
      };
      const desiredState = yield* DesiredStateReader;
      const graph = yield* desiredState.graph();
      const desiredNode = graph.nodes.find(
        (node) => node.type === "mcp-server" && node.name === request.name,
      );
      if (desiredNode !== undefined && desiredNode.enabled && enabled !== false) {
        const { inspections, outcomes } = yield* inspectDesiredMcpServer({
          nativeDirectoryInputs: location.nativeDirectoryInputs,
          workspaceRoot: location.baseDir,
          scope: location.scope,
          agentIds: yield* settings.configuredAgents,
          node: desiredNode,
          entry: (yield* settings.entries("mcp-server"))[request.name],
          canonicalPaths: inventoryRow?.paths ?? [],
        });
        agentOutcomes = outcomes.map((outcome, index) => {
          const inspection = inspections[index];
          return {
            ...outcome,
            fields: [...(inspection?.fields ?? [])],
            warnings: [...(inspection?.warnings ?? [])],
            reason: outcome.reason,
            configuration:
              inspection?.status === "blocked" || inspection?.status === "unsupported"
                ? "blocked"
                : inspection?.status === "unverified"
                  ? "unverified"
                  : "valid",
            projection: inspection?.status ?? "unverified",
            readiness:
              inspection?.status === "match" && cwd !== "missing" ? "unverified" : "blocked",
            runtime: "not-checked",
            manualActions: [
              `${nativeMcpRoutes[outcome.agentId] ?? "Open the native host's MCP management UI"} for ${location.scope} scope${outcome.path === undefined ? "" : ` at ${outcome.path}`}. This may start the configured process or contact the endpoint.`,
              "Make referenced environment variables available to the native host; AXM does not resolve their values.",
              "Review native folder trust, policy and tool approvals. Use the selected server's native login action if required; login starts authentication and lets the host store its session.",
              "Reload or restart the selected host after changing configuration, then invoke a harmless tool to verify the connection.",
            ],
          };
        });
      }
      if (desiredNode !== undefined && (!desiredNode.enabled || enabled === false)) {
        agentOutcomes = (yield* settings.configuredAgents).map((agentId) => ({
          extensionType: request.type,
          name: request.name,
          agentId,
          outcome: "not-applicable" as const,
          reasonCode: "extension-disabled",
          fields: [],
          warnings: [],
          reason: "The extension is disabled, so no agent projection is expected.",
          configuration: "valid" as const,
          projection: "disabled",
          readiness: "blocked" as const,
          runtime: "not-checked" as const,
          manualActions: [
            "Reload or restart the native host; removal from desired configuration does not prove a running connection has stopped.",
          ],
        }));
      }
    }

    return {
      item: {
        type: request.type,
        name: request.name,
        enabled,
        source,
        version:
          lockEntry === undefined ? observedManifestVersion : (lockEntryVersion(lockEntry) ?? null),
        scope: location.scope,
        locked: lockEntry !== undefined,
      },
      ...(mcp === undefined ? {} : { mcp }),
      agentOutcomes: filterShowAgentOutcomes({
        outcomes: agentOutcomes,
        requested: request.agents ?? [],
        configured: yield* settings.configuredAgents,
        type: request.type,
        name: request.name,
      }),
    } satisfies ExtensionShowResult;
  }, withInspectionReadView),
};
