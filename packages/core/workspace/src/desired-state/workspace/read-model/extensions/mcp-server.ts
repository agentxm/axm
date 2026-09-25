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
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import {
  decodeExtensionNameSync,
  type ExtensionName,
} from "@agentxm/extension-model/unstable/extensions/common";
import { parseSourceQualifiedRegistrySourcePatternParts } from "@agentxm/extension-model/unstable/extensions";
import type { Lockfile, McpServerLockEntry } from "../../../lockfile/schema.js";
import { lockEntryToSourceParams } from "../../lock-entry-to-source-params.js";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { isSourcedMcpServerEntry } from "../../../settings/schema.js";
import type { McpServerEntry, Settings } from "../../../settings/schema.js";
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
  projectPackMemberRows,
  type PackMemberBinding,
  type SubjectPolicy,
} from "./projection.js";

// ---------------------------------------------------------------------------
// Detection origin
// ---------------------------------------------------------------------------

export type McpServerDetectionOrigin =
  | { readonly _tag: "canonical-axm-mcp-server" }
  | { readonly _tag: "external-axm-mcp-server" }
  | { readonly _tag: "workspace-mcp-config" }
  | { readonly _tag: "agent-mcp-config"; readonly agentId: MaterializationTargetId };

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

const resolvedFromState = (settings: Settings, lockfile: Lockfile): ResolvedMcpServers => {
  const locked = Object.values(lockfile.mcpServers ?? {});
  const resolved: ResolvedMcpServer[] = [];
  const names = new Set<string>();
  for (const [localName, entry] of Object.entries(settings.mcpServers ?? {})) {
    // Inline connections define themselves; configuration-only entries name no
    // source. Neither resolves through a shared source identity.
    if (!isSourcedMcpServerEntry(entry)) continue;
    const parsed = parseSourceQualifiedRegistrySourcePatternParts(entry.source);
    // A spelled source pins the accepted endpoint; an unqualified locator's
    // binding is the desired-state graph's decision, not this row's.
    const spelledSource =
      parsed === undefined ? undefined : Option.getOrUndefined(parsed.sourceName);
    const configuredRegistry =
      spelledSource === undefined
        ? undefined
        : settings.sources?.find(
            (source) => source.type === "registry" && source.name === spelledSource,
          );
    const lockEntry = locked.find((candidate) => {
      if (parsed !== undefined && candidate.source.type === "registry") {
        return (
          candidate.identity.owner === parsed.owner &&
          candidate.identity.name === parsed.name &&
          (configuredRegistry?.type !== "registry" ||
            configuredRegistry.location.href === candidate.source.url.href)
        );
      }
      return printSourceParams(lockEntryToSourceParams(candidate)) === entry.source;
    });
    if (lockEntry === undefined) continue;
    names.add(localName);
    resolved.push({ name: decodeExtensionNameSync(localName), lockEntry });
  }
  return resolved;
};

const canonicalToActual = (
  occ: CanonicalExtensionOccurrence,
  scope: Scope,
  localName: ExtensionName = occ.name,
): ActualMcpServer => {
  const packageRoot = canonicalAxmPackageRoot(occ);
  return {
    key: { scope, type: "mcp-server", name: localName },
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
    occ.surface._tag === "shared"
      ? { _tag: "workspace-mcp-config" }
      : { _tag: "agent-mcp-config", agentId: occ.surface.agentId },
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

export interface McpServerExtensionsApiDeps {
  readonly scope: Scope;
  readonly loaders: McpServerScopedLoaders;
  readonly scanners: McpServerScanners;
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
  /** Rows for the Pack-supplied members the desired-state graph bound to this subject. */
  readonly packMemberRows: (
    bindings: ReadonlyArray<PackMemberBinding>,
  ) => Effect.Effect<ReadonlyArray<InstalledMcpServer>, SettingsReadError | LockfileReadError>;
  readonly unmanaged: Effect.Effect<
    ReadonlyArray<UnmanagedMcpServer>,
    SettingsReadError | LockfileReadError
  >;
}

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
  declaredActivation: (entry) => (entry.entry.enabled === false ? "disabled" : "enabled"),
  // An inline connection defines itself; only a source-less, non-inline entry
  // configures a member another Pack supplies.
  declaresAcquisition: (entry) => entry.entry.kind !== "configuration",
  resolvedEntries: (r) => r,
  resolvedName: (e) => e.name,
  actualEntries: (a) => a,
  actualName: (e) => e.key.name,
  packMember: ({ name, pack }) => ({ name, providingPack: pack }),
  attachActualToInstalled: (name, actual) => actual.filter((a) => a.key.name === name),
  notClaimedBySubjectPolicy: () => true,
  buildInstalledRow: (input) => ({
    key: { scope, type: "mcp-server", name: input.name },
    installationOrigin: input.installationOrigin,
    activation: input.activation,
    resolved: input.resolved,
    actual: input.actual,
  }),
  buildUnmanagedRow: (entry) => ({
    key: { scope, type: "mcp-server", name: entry.key.name },
    actual: entry,
  }),
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
    const { scope, loaders, scanners } = deps;

    const declared: McpServerExtensionsApi["declared"] = loaders.settings.pipe(
      Effect.map((opt) => Option.map(opt, declaredFromSettings)),
    );
    const resolved: McpServerExtensionsApi["resolved"] = Effect.all({
      settings: loaders.settings.pipe(Effect.catch(() => Effect.succeed(Option.none()))),
      lockfile: loaders.lockfile,
    }).pipe(
      Effect.map(({ settings, lockfile }) =>
        Option.all({ settings, lockfile }).pipe(
          Option.map(({ settings: decodedSettings, lockfile: decodedLockfile }) =>
            resolvedFromState(decodedSettings, decodedLockfile),
          ),
        ),
      ),
    );
    // A Pack-supplied server has no settings source to resolve through; its
    // accepted lock row is the one whose identity carries the member's name.
    const memberResolved: McpServerExtensionsApi["resolved"] = loaders.lockfile.pipe(
      Effect.map((opt) =>
        Option.map(opt, (lockfile) =>
          Object.values(lockfile.mcpServers ?? {}).map((lockEntry) => ({
            name: lockEntry.identity.name,
            lockEntry,
          })),
        ),
      ),
    );
    const actual: McpServerExtensionsApi["actual"] = Effect.gen(function* () {
      const canonical = yield* scanners.canonical;
      const mcpConfig = yield* scanners.mcpConfig;
      const accepted = yield* resolved.pipe(Effect.catch(() => Effect.succeed(Option.none())));
      const resolvedEntries = Option.getOrElse(accepted, () => []);
      const fromCanonical = filterMapOccurrences(canonical, "mcp-server", (occ) => occ).flatMap(
        (occ) => {
          const matchingNames = resolvedEntries
            .filter(
              (entry) =>
                entry.lockEntry.source.type === "registry" &&
                entry.lockEntry.identity.name === occ.name,
            )
            .map((entry) => entry.name);
          return matchingNames.length === 0
            ? [canonicalToActual(occ, scope)]
            : matchingNames.map((name) => canonicalToActual(occ, scope, name));
        },
      );
      const fromMcpConfig = mcpConfig.map((occ) => mcpConfigToActual(occ, scope));
      return [...fromCanonical, ...fromMcpConfig];
    });

    const policy = mcpServerPolicy(scope);
    const project = yield* Effect.cached(
      projectInstalledExtensions({
        declared,
        resolved,
        actual,
        policy,
      }),
    );

    return {
      ...makeProjectedSubjectCells({
        declared,
        resolved,
        actual,
        project,
      }),
      packMemberRows: (bindings) =>
        projectPackMemberRows({ bindings, declared, resolved: memberResolved, actual, policy }),
    } satisfies McpServerExtensionsApi;
  });
