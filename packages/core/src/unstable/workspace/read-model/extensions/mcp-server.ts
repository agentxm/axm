/**
 * MCP server subject module: declared/resolved/actual payloads, scanner
 * composition (canonical-extensions + mcp-config(workspace) + mcp-config(agent)),
 * and projections via the shared helper.
 *
 * MCP servers carry a declared `enabled` flag in settings. Disabled servers
 * remain installed on disk and in the lockfile but are removed from agent
 * configs unless the target agent has a native enabled toggle.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AgentId } from "../../../agents/types.js";
import { decodeExtensionNameSync, type ExtensionName } from "../../../extensions/common.js";
import type { Lockfile, McpServerLockEntry } from "../../../lockfile/schema.js";
import type { McpServerEntry, Settings } from "../../../settings/schema.js";
import type { Diagnostics, Warning } from "../diagnostics.js";
import type { LockfileReadError, SettingsReadError } from "../errors.js";
import type { CanonicalExtensionOccurrence, McpConfigOccurrence } from "../scanners/types.js";
import type {
  ActivationState,
  ExtensionKey,
  InstallationOrigin,
  InstalledPackRef,
  Scope,
} from "../types.js";
import { filterMapOccurrences } from "./actual-helpers.js";
import { canonicalAxmPackageRoot } from "./package-root.js";
import {
  makeProjectedSubjectCells,
  projectInstalledExtensions,
  type SubjectPolicy,
} from "./projection.js";

// ---------------------------------------------------------------------------
// Detection origin
// ---------------------------------------------------------------------------

export type McpServerDetectionOrigin =
  | { readonly _tag: "canonical-axm-mcp-server" }
  | { readonly _tag: "external-axm-mcp-server" }
  | { readonly _tag: "workspace-mcp-config" }
  | { readonly _tag: "agent-mcp-config"; readonly agentId: AgentId };

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export interface DeclaredMcpServer {
  readonly name: ExtensionName;
  readonly entry: McpServerEntry;
}
export type DeclaredMcpServers = ReadonlyArray<DeclaredMcpServer>;

export interface ResolvedMcpServer {
  readonly name: ExtensionName;
  readonly lockEntry: McpServerLockEntry;
}
export type ResolvedMcpServers = ReadonlyArray<ResolvedMcpServer>;

/**
 * One observable MCP server materialization. `configFile` is the absolute
 * path to the config file containing the server entry (workspace `.mcp.json`
 * or an agent-native MCP config). For canonical/external AXM occurrences,
 * `configFile` is null and `contentRoot` carries the package directory.
 */
export interface ActualMcpServer {
  readonly key: ExtensionKey<"mcp-server">;
  readonly origin: McpServerDetectionOrigin;
  readonly contentRoot: string | null;
  readonly packageRoot: string | null;
  readonly configFile: string | null;
  readonly config: Readonly<Record<string, unknown>> | null;
}
export type ActualMcpServers = ReadonlyArray<ActualMcpServer>;

export interface McpServerPackMember {
  readonly name: ExtensionName;
  readonly providingPack: InstalledPackRef;
}

export interface InstalledMcpServer {
  readonly key: ExtensionKey<"mcp-server">;
  readonly installationOrigin: InstallationOrigin<DeclaredMcpServer, McpServerPackMember>;
  readonly activation: ActivationState;
  readonly resolved: Option.Option<ResolvedMcpServer>;
  readonly actual: ReadonlyArray<ActualMcpServer>;
  readonly providingPacks: ReadonlyArray<InstalledPackRef>;
}

export interface UnmanagedMcpServer {
  readonly key: ExtensionKey<"mcp-server">;
  readonly actual: ActualMcpServer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const declaredFromSettings = (settings: Settings): DeclaredMcpServers => {
  if (settings.mcpServers === undefined) return [];
  return Object.entries(settings.mcpServers).map(([name, entry]) => ({
    name: decodeExtensionNameSync(name),
    entry,
  }));
};

const resolvedFromLockfile = (lockfile: Lockfile): ResolvedMcpServers => {
  if (lockfile.mcpServers === undefined) return [];
  return Object.entries(lockfile.mcpServers).map(([name, lockEntry]) => ({
    name: decodeExtensionNameSync(name),
    lockEntry,
  }));
};

const canonicalToActual = (occ: CanonicalExtensionOccurrence, scope: Scope): ActualMcpServer => {
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "mcp-server", name: occ.name },
    origin:
      occ.origin === "canonical-axm"
        ? { _tag: "canonical-axm-mcp-server" }
        : { _tag: "external-axm-mcp-server" },
    contentRoot: occ.contentLocation,
    packageRoot,
    configFile: null,
    config: null,
  };
};

const mcpConfigToActual = (occ: McpConfigOccurrence, scope: Scope): ActualMcpServer => ({
  key: { scope, type: "mcp-server", name: occ.name },
  origin:
    occ.origin === "workspace"
      ? { _tag: "workspace-mcp-config" }
      : { _tag: "agent-mcp-config", agentId: occ.agentId },
  contentRoot: null,
  packageRoot: null,
  configFile: occ.contentLocation,
  config: occ.config,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface McpServerScopedLoaders {
  readonly settings: Effect.Effect<Option.Option<Settings>, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<Lockfile>, LockfileReadError>;
}

export interface McpServerScanners {
  readonly canonical: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
  readonly mcpConfig: Effect.Effect<ReadonlyArray<McpConfigOccurrence>>;
}

export interface InstalledPackForMcpServers {
  readonly ref: InstalledPackRef;
  readonly mcpServers: ReadonlyArray<McpServerPackMember>;
}

export interface McpServerExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: McpServerScopedLoaders;
  readonly scanners: McpServerScanners;
  readonly installedPacks: Effect.Effect<
    ReadonlyArray<InstalledPackForMcpServers>,
    SettingsReadError | LockfileReadError
  >;
  readonly diagnostics: Diagnostics;
}

export interface McpServerExtensionsApi {
  readonly declared: Effect.Effect<Option.Option<DeclaredMcpServers>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<ResolvedMcpServers>, LockfileReadError>;
  readonly actual: Effect.Effect<ActualMcpServers>;
  readonly installed: Effect.Effect<
    ReadonlyArray<InstalledMcpServer>,
    SettingsReadError | LockfileReadError
  >;
  readonly byName: (
    name: string,
  ) => Effect.Effect<Option.Option<InstalledMcpServer>, SettingsReadError | LockfileReadError>;
  readonly declaredByName: (
    name: string,
  ) => Effect.Effect<Option.Option<DeclaredMcpServer>, SettingsReadError>;
  readonly active: Effect.Effect<
    ReadonlyArray<InstalledMcpServer>,
    SettingsReadError | LockfileReadError
  >;
  readonly unmanaged: Effect.Effect<
    ReadonlyArray<UnmanagedMcpServer>,
    SettingsReadError | LockfileReadError
  >;
}

const orphanResolvedWarning = (name: string): Warning => ({
  source: "lockfile",
  message: `mcp-server: lockfile entry "${name}" has no matching declared or pack-member home`,
  code: "orphan-resolved",
});

const mcpServerPolicy = (
  scope: Scope,
): SubjectPolicy<
  DeclaredMcpServers,
  ResolvedMcpServers,
  ActualMcpServers,
  McpServerPackMember,
  InstalledMcpServer,
  UnmanagedMcpServer
> => ({
  declaredEntries: (d) => d,
  declaredName: (e) => e.name,
  declaredActivation: (entry) => (entry.entry.enabled ? "enabled" : "disabled"),
  resolvedEntries: (r) => r,
  resolvedName: (e) => e.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  packMemberName: (m) => m.name,
  packMemberActivation: () => "enabled",
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "mcp-server", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
    providingPacks: input.providingPacks,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "mcp-server", name: entry.key.name },
    actual: entry,
  }),
  resolvedOrphanWarning: orphanResolvedWarning,
});

/**
 * Build the MCP server subject API. Returns an `Effect` because the
 * projection cell is wrapped in `Effect.cached` so the four derived cells
 * share one in-flight execution per scope, mirroring `state.ts`.
 */
export const makeMcpServerExtensionsApi = (
  deps: McpServerExtensionsApiDeps,
): Effect.Effect<McpServerExtensionsApi> =>
  Effect.gen(function* () {
    const { scope, loaders, scanners, installedPacks, diagnostics } = deps;

    const declared: McpServerExtensionsApi["declared"] = loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: McpServerExtensionsApi["resolved"] = loaders.lockfile.pipe(
      Effect.map((opt) => Option.map(opt, resolvedFromLockfile)),
    );
    const actual: McpServerExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      const mcpConfig = yield* scanners.mcpConfig;
      const fromCanonical = filterMapOccurrences(canonical, "mcp-server", (occ) =>
        canonicalToActual(occ, scope),
      );
      const fromMcpConfig = mcpConfig.map((occ) => mcpConfigToActual(occ, scope));
      return [...fromCanonical, ...fromMcpConfig];
    });

    const project = yield* Effect.cached(
      projectInstalledExtensions({
        declared,
        resolved,
        actual,
        installedPacks: installedPacks.pipe(
          Effect.map((packs) => packs.map((p) => ({ ref: p.ref, members: p.mcpServers }))),
        ),
        packMembers: (pack: {
          readonly ref: InstalledPackRef;
          readonly members: ReadonlyArray<McpServerPackMember>;
        }) => pack.members,
        packRef: (pack) => pack.ref,
        policy: mcpServerPolicy(scope),
        diagnostics,
      }),
    );

    return makeProjectedSubjectCells({
      declared,
      resolved,
      actual,
      project,
    }) satisfies McpServerExtensionsApi;
  });
