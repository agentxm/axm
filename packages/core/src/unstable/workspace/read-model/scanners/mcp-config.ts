/**
 * MCP-config scanner: parses the workspace `.mcp.json` plus per-agent native
 * MCP config files (`.cursor/mcp.json`, `.codex/mcp.json`, etc.) and emits one
 * occurrence per declared server.
 *
 * Per Decision 5, scanner output is occurrence-shaped; the discriminator
 * `origin: "workspace" | "agent"` distinguishes the two surfaces, and the
 * agent surface carries its `agentId` so per-subject modules can map cleanly
 * into agent-scoped origins. The two variants are a discriminated union over
 * `origin`: `WorkspaceMcpConfigOccurrence` omits `agentId` entirely;
 * `AgentMcpConfigOccurrence` carries it non-nullable.
 *
 * Per-file partial failures (unreadable config, bad JSON, schema-incompatible
 * payload) become diagnostic warnings rather than errors. The error channel
 * stays empty.
 *
 * MCP config layout:
 *
 * ```json
 * {
 *   "mcpServers": {
 *     "<server-name>": { ... }
 *   }
 * }
 * ```
 *
 * The scanner emits one occurrence per `<server-name>` and captures each
 * record-shaped server payload for import/adoption flows.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { getHome } from "../../../agents/constants.js";
import { AGENTS } from "../../../agents/registry.js";
import type { AgentDescriptor, AgentId } from "../../../agents/types.js";
import {
  AGENTS_BY_ID,
  type Agent,
  type AgentId as CapabilityAgentId,
  type McpConfig,
  type McpConfigTarget,
} from "../../../agent-capabilities/index.js";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import { makeAbsolutePath } from "../../../utils/path-types.js";
import { isPathSafe } from "../../../utils/index.js";
import type { Diagnostics } from "../diagnostics.js";
import type { Scope } from "../types.js";
import {
  agentRootSegment,
  makeAgentRootResolverState,
  type AgentRootResolverState,
} from "./agent-root.js";
import type {
  AgentMcpConfigOccurrence,
  McpConfigOccurrence,
  WorkspaceMcpConfigOccurrence,
} from "./types.js";

const SCANNER_NAME = "mcp-config";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Inputs the live layer captures before invoking the scanner. The optional
 * `agentRegistry` mirrors the agent-dir scanner. `rootResolverState` lets
 * the live layer share heuristic-warning state across `mcp-config` and
 * `agent-settings`; when omitted, a fresh state is used (one warning per
 * scanner invocation per agent).
 */
export interface McpConfigScannerDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly scope: Scope;
  readonly diagnostics: Diagnostics;
  readonly agentRegistry?: Readonly<Partial<Record<AgentId, AgentDescriptor>>>;
  readonly rootResolverState?: AgentRootResolverState;
}

/**
 * Closure helper: returns the dependency-closed scanner effect.
 */
export const makeMcpConfigScanner = (
  deps: McpConfigScannerDeps,
): Effect.Effect<ReadonlyArray<McpConfigOccurrence>> => scanMcpConfig(deps);

// ---------------------------------------------------------------------------
// Helpers: read + parse + extract server names
// ---------------------------------------------------------------------------

/**
 * Minimum shape the scanner needs from an MCP config file: a top-level
 * object that may contain an agent-configured server record. Per-server payloads stay
 * opaque (`Schema.Unknown`) — Phase 7's MCP server subject module decodes
 * them through its own schema. The scanner only emits one occurrence per
 * server name.
 */
const McpConfigShapeSchema = Schema.Record(Schema.String, Schema.Unknown);

const decodeMcpConfigShape = Schema.decodeUnknownEffect(McpConfigShapeSchema);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractServers = (
  decoded: typeof McpConfigShapeSchema.Type,
  serversKey: string,
): ReadonlyArray<{
  readonly name: ExtensionName;
  readonly config: Readonly<Record<string, unknown>>;
}> =>
  !isRecord(decoded[serversKey])
    ? []
    : Object.entries(decoded[serversKey]).flatMap(([name, config]) =>
        isRecord(config)
          ? [
              {
                name: decodeExtensionNameSync(name),
                config,
              },
            ]
          : [],
      );

const readMcpConfig = (
  fs: FileSystem.FileSystem,
  diagnostics: Diagnostics,
  filePath: string,
): Effect.Effect<Option.Option<typeof McpConfigShapeSchema.Type>> =>
  Effect.gen(function* () {
    const exists = yield* Effect.result(fs.exists(filePath));
    if (exists._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${SCANNER_NAME}: cannot stat ${filePath}`,
        path: filePath,
        code: "scanner-io",
      });
      return Option.none();
    }
    if (!exists.success) return Option.none();

    const read = yield* Effect.result(fs.readFileString(filePath));
    if (read._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${SCANNER_NAME}: cannot read ${filePath}`,
        path: filePath,
        code: "scanner-io",
      });
      return Option.none();
    }

    const parsed = yield* Effect.result(
      Effect.try({
        try: (): unknown => JSON.parse(read.success),
        catch: (cause: unknown): { readonly cause: unknown } => ({ cause }),
      }),
    );
    if (parsed._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${SCANNER_NAME}: cannot parse JSON at ${filePath}`,
        path: filePath,
        code: "scanner-parse",
      });
      return Option.none();
    }

    const decoded = yield* Effect.result(decodeMcpConfigShape(parsed.success));
    if (decoded._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${SCANNER_NAME}: invalid MCP config shape at ${filePath}: ${decoded.failure.message}`,
        path: filePath,
        code: "scanner-parse",
      });
      return Option.none();
    }
    return Option.some(decoded.success);
  });

type McpConfigReadCache = Map<string, Option.Option<typeof McpConfigShapeSchema.Type>>;

const readMcpConfigCached = (
  cache: McpConfigReadCache,
  fs: FileSystem.FileSystem,
  diagnostics: Diagnostics,
  filePath: string,
): Effect.Effect<Option.Option<typeof McpConfigShapeSchema.Type>> => {
  const existing = cache.get(filePath);
  if (existing !== undefined) return Effect.succeed(existing);
  return readMcpConfig(fs, diagnostics, filePath).pipe(
    Effect.tap((decoded) =>
      Effect.sync(() => {
        cache.set(filePath, decoded);
      }),
    ),
  );
};

// ---------------------------------------------------------------------------
// Per-surface scanners
// ---------------------------------------------------------------------------

const scanWorkspaceMcp = (
  deps: McpConfigScannerDeps,
  cache: McpConfigReadCache,
): Effect.Effect<ReadonlyArray<WorkspaceMcpConfigOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, workspaceRoot, scope, diagnostics } = deps;
    const filePath = path.join(workspaceRoot, ".mcp.json");
    const decoded = yield* readMcpConfigCached(cache, fs, diagnostics, filePath);
    if (Option.isNone(decoded)) return [];
    const servers = extractServers(decoded.value, "mcpServers");
    const contentLocation = makeAbsolutePath(path, filePath);
    return servers.map<WorkspaceMcpConfigOccurrence>((server) => ({
      _tag: "mcp-config",
      scope,
      origin: "workspace",
      name: server.name,
      contentLocation,
      config: server.config,
    }));
  });

type AgentMcpCapability = Agent["capabilities"]["mcp-server"];
type ConfiguredMcpCapability = AgentMcpCapability & {
  readonly axm: {
    readonly writer: {
      readonly config: McpConfig;
    };
  };
};

const hasMcpConfig = (capability: AgentMcpCapability): capability is ConfiguredMcpCapability =>
  capability.axm.writer !== null;

const isCapabilityAgentId = (id: string): id is CapabilityAgentId => id in AGENTS_BY_ID;

const capabilityFor = (descriptor: AgentDescriptor): ConfiguredMcpCapability | undefined => {
  if (!isCapabilityAgentId(descriptor.id)) return undefined;
  const agent = AGENTS_BY_ID[descriptor.id];
  const capability = agent.capabilities["mcp-server"];
  return hasMcpConfig(capability) ? capability : undefined;
};

const resolveMcpConfigTargetPath = (
  deps: McpConfigScannerDeps,
  target: McpConfigTarget,
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const { path, workspaceRoot, diagnostics } = deps;
    const home = yield* getHome;
    const configPath =
      target.scope === "user"
        ? target.path.startsWith("~/")
          ? path.join(home, target.path.slice(2))
          : path.resolve(home, target.path)
        : path.resolve(workspaceRoot, target.path);

    if (target.scope === "project" && !isPathSafe(workspaceRoot, configPath)) {
      yield* diagnostics.append({
        source: "scanner",
        message: `${SCANNER_NAME}: MCP config target escapes workspace root: ${target.path}`,
        path: configPath,
        code: "scanner-config",
      });
      return Option.none();
    }
    return Option.some(configPath);
  });

const scanAgentMcp = (
  deps: McpConfigScannerDeps,
  descriptor: AgentDescriptor,
  rootResolverState: AgentRootResolverState,
  cache: McpConfigReadCache,
): Effect.Effect<ReadonlyArray<AgentMcpConfigOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, scope, diagnostics } = deps;
    const capability = capabilityFor(descriptor);
    if (capability === undefined) return [];
    // Resolve the root segment for legacy descriptors whose MCP config target
    // is still the default `<agent-root>/mcp.json`.
    yield* agentRootSegment(path, descriptor, diagnostics, rootResolverState);
    const config = capability.axm.writer.config;
    const targets = config.targets.filter((target) => target.scope === scope);
    const perTarget = yield* Effect.forEach(
      targets,
      (target) =>
        Effect.gen(function* () {
          const filePathOpt = yield* resolveMcpConfigTargetPath(deps, target);
          if (Option.isNone(filePathOpt)) return [];
          const decoded = yield* readMcpConfigCached(cache, fs, diagnostics, filePathOpt.value);
          if (Option.isNone(decoded)) return [];
          const servers = extractServers(decoded.value, config.serversKey);
          const contentLocation = makeAbsolutePath(path, filePathOpt.value);
          return servers.map<AgentMcpConfigOccurrence>((server) => ({
            _tag: "mcp-config",
            scope,
            origin: "agent",
            agentId: descriptor.id,
            name: server.name,
            contentLocation,
            config: server.config,
          }));
        }),
      { concurrency: 1 },
    );
    return perTarget.flat();
  });

// ---------------------------------------------------------------------------
// Scanner body
// ---------------------------------------------------------------------------

const scanMcpConfig = Effect.fn("workspace.read-model.scanner.mcp-config")(function* (
  deps: McpConfigScannerDeps,
) {
  const registry = deps.agentRegistry ?? AGENTS;
  const rootResolverState = deps.rootResolverState ?? makeAgentRootResolverState();
  const cache: McpConfigReadCache = new Map();
  const workspaceOccurrences = yield* scanWorkspaceMcp(deps, cache);
  const agentOccurrences = yield* Effect.forEach(
    Object.values(registry),
    (descriptor) => scanAgentMcp(deps, descriptor, rootResolverState, cache),
    { concurrency: 1 },
  );
  const out: ReadonlyArray<McpConfigOccurrence> = [
    ...workspaceOccurrences,
    ...agentOccurrences.flat(),
  ];
  return out;
});
