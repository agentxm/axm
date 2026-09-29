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
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type {
  AgentDescriptor,
  MaterializationTargetId,
} from "@agentxm/extension-model/unstable/agents/types";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type McpConfigTarget,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  readNativeMcpConfig,
  readNativeMcpServers,
  resolveAgentMcpConfigTargetPath,
} from "../../../agent-adapters/index.js";
import {
  ExtensionNameSchema,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import { resolveNativeReadLocation, type NativeDirectoryInputs } from "../../../locations/index.js";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { Diagnostics, Warning } from "../diagnostics.js";
import type { Scope } from "../types.js";
import { dedupeByIdentity, type McpConfigOccurrence, type McpConfigSurface } from "./types.js";

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
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: Scope;
  readonly diagnostics: Diagnostics;
  readonly agentRegistry?: Readonly<Partial<Record<MaterializationTargetId, AgentDescriptor>>>;
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

// MCP configs can contain arbitrary, user-authored server names. Only names that
// are valid AXM extension names can be managed; skip the rest instead of letting
// a non-conforming name (e.g. uppercase or underscore) crash the whole scan.
const decodeExtensionNameOption = Schema.decodeUnknownOption(ExtensionNameSchema);

const extractServers = (
  servers: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): ReadonlyArray<{
  readonly name: ExtensionName;
  readonly config: Readonly<Record<string, unknown>>;
}> =>
  Object.entries(servers).flatMap(([name, config]) => {
    const decodedName = decodeExtensionNameOption(name);
    return Option.isNone(decodedName) ? [] : [{ name: decodedName.value, config }];
  });

const readMcpConfig = (
  fs: FileSystem.FileSystem,
  diagnostics: Diagnostics,
  filePath: string,
  format: McpConfigTarget["format"],
  serversPath: ReadonlyArray<string>,
): Effect.Effect<Option.Option<Readonly<Record<string, Readonly<Record<string, unknown>>>>>> =>
  Effect.gen(function* () {
    const read = yield* Effect.result(
      readNativeMcpConfig(filePath).pipe(Effect.provideService(FileSystem.FileSystem, fs)),
    );
    if (read._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${SCANNER_NAME}: cannot ${read.failure.detail.startsWith("Failed to inspect") ? "stat" : "read"} ${filePath}`,
        path: filePath,
        code: "scanner-io",
      });
      return Option.none();
    }
    if (Option.isNone(read.success)) return Option.none();

    const parsed = yield* Effect.result(
      readNativeMcpServers({ format, configPath: filePath, raw: read.success.value, serversPath }),
    );
    if (parsed._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${SCANNER_NAME}: cannot parse ${format.toUpperCase()} at ${filePath}`,
        path: filePath,
        code: "scanner-parse",
      });
      return Option.none();
    }

    return Option.some(parsed.success);
  });

type McpConfigReadCache = Map<
  string,
  Option.Option<Readonly<Record<string, Readonly<Record<string, unknown>>>>>
>;

const readMcpConfigCached = (
  cache: McpConfigReadCache,
  fs: FileSystem.FileSystem,
  diagnostics: Diagnostics,
  filePath: string,
  format: McpConfigTarget["format"],
  serversPath: ReadonlyArray<string>,
): Effect.Effect<Option.Option<Readonly<Record<string, Readonly<Record<string, unknown>>>>>> => {
  const key = JSON.stringify([filePath, format, serversPath]);
  const existing = cache.get(key);
  if (existing !== undefined) return Effect.succeed(existing);
  return readMcpConfig(fs, diagnostics, filePath, format, serversPath).pipe(
    Effect.tap((decoded) =>
      Effect.sync(() => {
        cache.set(key, decoded);
      }),
    ),
  );
};

// ---------------------------------------------------------------------------
// Physical-surface planning and scanning
// ---------------------------------------------------------------------------

interface McpSurfaceScanPlan {
  readonly surface: McpConfigSurface;
  readonly target: McpConfigTarget;
  readonly serversPath: ReadonlyArray<string>;
}

const surfacePlanKey = (plan: McpSurfaceScanPlan): string =>
  JSON.stringify([
    plan.surface,
    plan.target.scope,
    plan.target.path,
    plan.target.format,
    plan.serversPath,
  ]);

const planMcpSurfaces = (
  deps: McpConfigScannerDeps,
  registry: Readonly<Partial<Record<MaterializationTargetId, AgentDescriptor>>>,
): ReadonlyArray<McpSurfaceScanPlan> => {
  const plans = new Map<string, McpSurfaceScanPlan>();
  for (const descriptor of Object.values(registry)) {
    const native = CONFIGURABLE_AGENTS_BY_ID[descriptor.id].capabilities["mcp-server"].native;
    if (!("locations" in native)) continue;
    for (const location of native.locations) {
      if (location.keyPath === undefined || location.attribution === undefined) continue;
      const resolved = resolveNativeReadLocation(
        deps.path,
        descriptor.id,
        location,
        deps,
        deps.nativeDirectoryInputs,
      );
      if (resolved === undefined) continue;
      const target: McpConfigTarget = {
        scope: location.scope,
        nativeRoot: resolved.nativeRoot,
        path: resolved.path,
        format: location.format,
        attribution: location.attribution,
      };
      const surface: McpConfigSurface =
        target.attribution === "shared"
          ? { _tag: "shared" }
          : { _tag: "agent", agentId: descriptor.id };
      const plan = {
        surface,
        target,
        serversPath: location.keyPath,
      } satisfies McpSurfaceScanPlan;
      const key = surfacePlanKey(plan);
      if (!plans.has(key)) plans.set(key, plan);
    }
  }
  return [...plans.values()];
};

const scanMcpSurface = (
  deps: McpConfigScannerDeps,
  plan: McpSurfaceScanPlan,
  cache: McpConfigReadCache,
): Effect.Effect<ReadonlyArray<McpConfigOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, scope, diagnostics } = deps;
    const resolved = yield* Effect.result(
      resolveAgentMcpConfigTargetPath(deps.workspaceRoot, plan.target).pipe(
        Effect.provideService(Path.Path, path),
        Effect.provideService(FileSystem.FileSystem, fs),
      ),
    );
    if (resolved._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${SCANNER_NAME}: ${resolved.failure.detail}`,
        path: plan.target.path,
        code: "scanner-config",
      });
      return [];
    }
    const decoded = yield* readMcpConfigCached(
      cache,
      fs,
      diagnostics,
      resolved.success,
      plan.target.format,
      plan.serversPath,
    );
    if (Option.isNone(decoded)) return [];
    const servers = extractServers(decoded.value);
    const contentLocation = makeAbsolutePath(path, resolved.success);
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
  const registry = deps.agentRegistry ?? AGENT_DESCRIPTORS;
  const cache: McpConfigReadCache = new Map();
  const warnings = new Map<string, { readonly warning: Warning; readonly messages: Set<string> }>();
  const collectedWarnings = (): ReadonlyArray<Warning> =>
    [...warnings.values()].map(({ warning, messages }) => ({
      ...warning,
      message: [...messages].join("; "),
    }));
  const diagnostics: Diagnostics = {
    append: (warning) =>
      Effect.sync(() => {
        const key = JSON.stringify([
          warning.source,
          warning.code,
          warning.path,
          warning.code === "scanner-parse" ? undefined : warning.message,
        ]);
        const existing = warnings.get(key);
        if (existing === undefined) {
          warnings.set(key, { warning, messages: new Set([warning.message]) });
        } else {
          existing.messages.add(warning.message);
        }
      }),
    snapshot: Effect.sync(collectedWarnings),
  };
  const scopedDeps = { ...deps, diagnostics };
  const plans = planMcpSurfaces(deps, registry);
  const occurrences = yield* Effect.forEach(
    plans,
    (plan) => scanMcpSurface(scopedDeps, plan, cache),
    {
      concurrency: 1,
    },
  );
  yield* Effect.forEach(collectedWarnings(), deps.diagnostics.append);
  return dedupeByIdentity(occurrences.flat());
});
