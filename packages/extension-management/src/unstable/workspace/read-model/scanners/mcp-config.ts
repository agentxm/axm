/**
 * MCP-config scanner: plans physical targets from the capability catalog,
 * reads each physical file once, and emits one occurrence per declared server.
 * Shared targets remain shared observations; agent-native targets retain the
 * exact agent id whose private surface supplied the observation.
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
import { parse, type ParseError } from "jsonc-parser";
import { getHome } from "../../../agents/constants.js";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import type { AgentDescriptor, AgentId } from "@agentxm/extension-model/unstable/agents/types";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type Agent,
  type ConfigurableAgentId as CapabilityAgentId,
  type McpConfig,
  type McpConfigTarget,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  ExtensionNameSchema,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { isPathSafe } from "../../../utils/index.js";
import type { Diagnostics } from "../diagnostics.js";
import type { Scope } from "../types.js";
import type { McpConfigOccurrence, McpConfigSurface } from "./types.js";

const SCANNER_NAME = "mcp-config";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Inputs the live layer captures before invoking the scanner. The optional
 * `agentRegistry` mirrors the agent-dir scanner.
 */
export interface McpConfigScannerDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly scope: Scope;
  readonly diagnostics: Diagnostics;
  readonly agentRegistry?: Readonly<Partial<Record<AgentId, AgentDescriptor>>>;
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

// MCP configs can contain arbitrary, user-authored server names. Only names that
// are valid AXM extension names can be managed; skip the rest instead of letting
// a non-conforming name (e.g. uppercase or underscore) crash the whole scan.
const decodeExtensionNameOption = Schema.decodeUnknownOption(ExtensionNameSchema);

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
    : Object.entries(decoded[serversKey]).flatMap(([name, config]) => {
        if (!isRecord(config)) return [];
        const decodedName = decodeExtensionNameOption(name);
        return Option.isNone(decodedName) ? [] : [{ name: decodedName.value, config }];
      });

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
        try: (): unknown => {
          const errors: Array<ParseError> = [];
          const value: unknown = parse(read.success, errors, { allowTrailingComma: true });
          if (errors.length > 0) throw errors;
          return value;
        },
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
// Physical-surface planning and scanning
// ---------------------------------------------------------------------------

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

const isCapabilityAgentId = (id: string): id is CapabilityAgentId =>
  id in CONFIGURABLE_AGENTS_BY_ID;

const capabilityFor = (descriptor: AgentDescriptor): ConfiguredMcpCapability | undefined => {
  if (!isCapabilityAgentId(descriptor.id)) return undefined;
  const agent = CONFIGURABLE_AGENTS_BY_ID[descriptor.id];
  const capability = agent.capabilities["mcp-server"];
  return hasMcpConfig(capability) ? capability : undefined;
};

interface McpSurfaceScanPlan {
  readonly surface: McpConfigSurface;
  readonly target: McpConfigTarget;
  readonly serversKey: string;
}

const surfacePlanKey = (plan: McpSurfaceScanPlan): string =>
  plan.surface._tag === "shared"
    ? `shared:${plan.target.scope}:${plan.target.path}`
    : `agent:${plan.surface.agentId}:${plan.target.scope}:${plan.target.path}`;

const planMcpSurfaces = (
  scope: Scope,
  registry: Readonly<Partial<Record<AgentId, AgentDescriptor>>>,
): ReadonlyArray<McpSurfaceScanPlan> => {
  const plans = new Map<string, McpSurfaceScanPlan>();
  for (const descriptor of Object.values(registry)) {
    const capability = capabilityFor(descriptor);
    if (capability === undefined) continue;
    for (const target of capability.axm.writer.config.targets) {
      if (target.scope !== scope) continue;
      const surface: McpConfigSurface =
        target.attribution === "shared"
          ? { _tag: "shared" }
          : { _tag: "agent", agentId: descriptor.id };
      const plan = {
        surface,
        target,
        serversKey: capability.axm.writer.config.serversKey,
      } satisfies McpSurfaceScanPlan;
      const key = surfacePlanKey(plan);
      if (!plans.has(key)) plans.set(key, plan);
    }
  }
  return [...plans.values()];
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

    if (target.scope === "project" && !isPathSafe(path, workspaceRoot, configPath)) {
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

const scanMcpSurface = (
  deps: McpConfigScannerDeps,
  plan: McpSurfaceScanPlan,
  cache: McpConfigReadCache,
): Effect.Effect<ReadonlyArray<McpConfigOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, scope, diagnostics } = deps;
    const filePathOpt = yield* resolveMcpConfigTargetPath(deps, plan.target);
    if (Option.isNone(filePathOpt)) return [];
    const decoded = yield* readMcpConfigCached(cache, fs, diagnostics, filePathOpt.value);
    if (Option.isNone(decoded)) return [];
    const servers = extractServers(decoded.value, plan.serversKey);
    const contentLocation = makeAbsolutePath(path, filePathOpt.value);
    return servers.map<McpConfigOccurrence>((server) => ({
      _tag: "mcp-config",
      scope,
      surface: plan.surface,
      name: server.name,
      contentLocation,
      config: server.config,
    }));
  });

// ---------------------------------------------------------------------------
// Scanner body
// ---------------------------------------------------------------------------

const scanMcpConfig = Effect.fn("workspace.read-model.scanner.mcp-config")(function* (
  deps: McpConfigScannerDeps,
) {
  const registry = deps.agentRegistry ?? AGENTS;
  const cache: McpConfigReadCache = new Map();
  const plans = planMcpSurfaces(deps.scope, registry);
  const occurrences = yield* Effect.forEach(plans, (plan) => scanMcpSurface(deps, plan, cache), {
    concurrency: 1,
  });
  return occurrences.flat();
});
