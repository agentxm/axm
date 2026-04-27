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
 * The scanner emits one occurrence per `<server-name>`. The per-server payload
 * (command, args, env, etc.) is intentionally not parsed here — Phase 7's MCP
 * server subject module decodes it through its own schema. The scanner's
 * contract is "this server name is observed at this surface", not "this
 * server is well-formed".
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { AGENTS } from "../../../agents/registry.js";
import type { AgentDescriptor, AgentId } from "../../../agents/types.js";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
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
  readonly agentRegistry?: Readonly<Record<AgentId, AgentDescriptor>>;
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
 * object that may contain an `mcpServers` record. Per-server payloads stay
 * opaque (`Schema.Unknown`) — Phase 7's MCP server subject module decodes
 * them through its own schema. The scanner only emits one occurrence per
 * server name.
 */
const McpConfigShapeSchema = Schema.Struct({
  mcpServers: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});

const decodeMcpConfigShape = Schema.decodeUnknownEffect(McpConfigShapeSchema);

const extractServerNames = (
  decoded: typeof McpConfigShapeSchema.Type,
): ReadonlyArray<ExtensionName> =>
  decoded.mcpServers === undefined
    ? []
    : Object.keys(decoded.mcpServers).map((name) => decodeExtensionNameSync(name));

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

// ---------------------------------------------------------------------------
// Per-surface scanners
// ---------------------------------------------------------------------------

const scanWorkspaceMcp = (
  deps: McpConfigScannerDeps,
): Effect.Effect<ReadonlyArray<WorkspaceMcpConfigOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, workspaceRoot, scope, diagnostics } = deps;
    const filePath = path.join(workspaceRoot, ".mcp.json");
    const decoded = yield* readMcpConfig(fs, diagnostics, filePath);
    if (Option.isNone(decoded)) return [];
    const names = extractServerNames(decoded.value);
    return names.map<WorkspaceMcpConfigOccurrence>((name) => ({
      _tag: "mcp-config",
      scope,
      origin: "workspace",
      name,
      contentLocation: filePath,
    }));
  });

const scanAgentMcp = (
  deps: McpConfigScannerDeps,
  descriptor: AgentDescriptor,
  rootResolverState: AgentRootResolverState,
): Effect.Effect<ReadonlyArray<AgentMcpConfigOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, workspaceRoot, scope, diagnostics } = deps;
    // Resolve the per-agent root segment. `Option.none()` means the
    // descriptor opts out of native-config scanning — skip it.
    const rootSegmentOpt = yield* agentRootSegment(
      path,
      descriptor,
      diagnostics,
      rootResolverState,
    );
    if (Option.isNone(rootSegmentOpt)) return [];
    const filePath = path.join(workspaceRoot, rootSegmentOpt.value, "mcp.json");
    const decoded = yield* readMcpConfig(fs, diagnostics, filePath);
    if (Option.isNone(decoded)) return [];
    const names = extractServerNames(decoded.value);
    return names.map<AgentMcpConfigOccurrence>((name) => ({
      _tag: "mcp-config",
      scope,
      origin: "agent",
      agentId: descriptor.id,
      name,
      contentLocation: filePath,
    }));
  });

// ---------------------------------------------------------------------------
// Scanner body
// ---------------------------------------------------------------------------

const scanMcpConfig = Effect.fn("workspace.context.scanner.mcp-config")(function* (
  deps: McpConfigScannerDeps,
) {
  const registry = deps.agentRegistry ?? AGENTS;
  const rootResolverState = deps.rootResolverState ?? makeAgentRootResolverState();
  const workspaceOccurrences = yield* scanWorkspaceMcp(deps);
  const agentOccurrences = yield* Effect.forEach(
    Object.values(registry),
    (descriptor) => scanAgentMcp(deps, descriptor, rootResolverState),
    { concurrency: "unbounded" },
  );
  const out: ReadonlyArray<McpConfigOccurrence> = [
    ...workspaceOccurrences,
    ...agentOccurrences.flat(),
  ];
  return out;
});
