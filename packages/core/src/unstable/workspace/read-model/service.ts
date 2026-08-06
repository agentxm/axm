/** Per-scope read-only workspace model factory and configuration. */

import * as Brand from "effect/Brand";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../agents/registry.js";
import type { CatalogExtensionType } from "../../extension-types/schema.js";
import { LOCKFILE_NAME } from "../../lockfile/lockfile.js";
import { parseExtensionFqnParts, type ExtensionName } from "../../extensions/common.js";
import { type Handle } from "../../extensions/handle.js";
import { SETTINGS_FILENAME } from "../../settings/settings.js";
import type { SourceHostConfig } from "../../settings/schema.js";
import { makeAbsolutePath, type AbsolutePath } from "../../utils/path-types.js";
import { AXM_DIR_NAME } from "../paths.js";
import { AgentRootResolver } from "./agent-root-resolver.js";
import { makeScopedAgentsApi, type ScopedAgentsApi } from "./agents/index.js";
import { type AgentScannerObservations } from "./agents/types.js";
import { makeDiagnostics, type Diagnostics, type Warning } from "./diagnostics.js";
import {
  WorkspaceRootEscape,
  type LockfileIoError,
  type SettingsIoError,
  type SettingsReadError,
} from "./errors.js";
import {
  makeCommandExtensionsApi,
  makeFilesExtensionsApi,
  makeHookExtensionsApi,
  makeKnowledgeExtensionsApi,
  makeMcpServerExtensionsApi,
  makePackExtensionsApi,
  makeRuleExtensionsApi,
  makeSkillExtensionsApi,
  makeSubagentExtensionsApi,
  type CommandExtensionsApi,
  type FilesExtensionsApi,
  type HookExtensionsApi,
  type InstalledPackForCommands,
  type InstalledPackForFiles,
  type InstalledPackForHooks,
  type InstalledPackForMcpServers,
  type InstalledPackForRules,
  type InstalledPackForSkills,
  type InstalledPackForSubagents,
  type KnowledgeExtensionsApi,
  type McpServerExtensionsApi,
  type PackExtensionsApi,
  type RuleExtensionsApi,
  type SkillExtensionsApi,
  type SubagentExtensionsApi,
} from "./extensions/index.js";
import {
  makeAgentDirScanner,
  makeAgentSettingsScanner,
  makeCanonicalExtensionsScanner,
  makeMcpConfigScanner,
  type AgentDirOccurrence,
  type AgentRootResolverState,
  type AgentSettingsOccurrence,
  type McpConfigOccurrence,
  type CanonicalExtensionOccurrence,
} from "./scanners/index.js";
import { makeScopedStateApi, type RawSourceBytes, type ScopedStateLoaders } from "./state.js";
import type { Scope } from "./types.js";

// ---------------------------------------------------------------------------
// Public surface types
// ---------------------------------------------------------------------------

export type { RawSourceBytes } from "./state.js";

/** Scoped state cells; `raw(source)` reads cached bytes (absent → `Option.none`). */
export interface ScopedStateApi {
  readonly settings: ScopedStateLoaders["settings"];
  readonly lockfile: ScopedStateLoaders["lockfile"];
  readonly raw: (
    source: "settings" | "lockfile",
  ) => Effect.Effect<Option.Option<RawSourceBytes>, SettingsIoError | LockfileIoError>;
}

/** Scoped source-host views over the cached settings loader. */
export interface ScopedSourceHostsApi {
  readonly declared: Effect.Effect<ReadonlyArray<SourceHostConfig>, SettingsReadError>;
  readonly effective: Effect.Effect<ReadonlyArray<SourceHostConfig>, SettingsReadError>;
  readonly registryHosts: Effect.Effect<
    ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>,
    SettingsReadError
  >;
  readonly byName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, SettingsReadError>;
}

/** Scoped owner view over the cached settings loader (declared owner; no fallback). */
export type ScopedOwnerApi = Effect.Effect<Option.Option<Handle>, SettingsReadError>;

/**
 * Workspace read model for a single scope (project or user).
 *
 * Returned by {@link makeWorkspaceReadModel}. Each invocation builds its own
 * scoped cells; cells cache for the lifetime of the returned value.
 */
export interface WorkspaceReadModel {
  readonly scope: Scope;
  readonly skills: SkillExtensionsApi;
  readonly commands: CommandExtensionsApi;
  readonly mcpServers: McpServerExtensionsApi;
  readonly subagents: SubagentExtensionsApi;
  readonly files: FilesExtensionsApi;
  readonly rules: RuleExtensionsApi;
  readonly hooks: HookExtensionsApi;
  readonly knowledge: KnowledgeExtensionsApi;
  readonly packs: PackExtensionsApi;
  readonly agents: ScopedAgentsApi;
  readonly state: ScopedStateApi;
  readonly sourceHosts: ScopedSourceHostsApi;
  readonly owner: ScopedOwnerApi;
  readonly diagnostics: Effect.Effect<ReadonlyArray<Warning>>;
  readonly canonicalExtensions: Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>>;
}

/**
 * The read-model family that carries each catalog extension type, or `null`
 * where no family exists yet.
 *
 * Total by construction: a new extension type fails compile here until its
 * read-model coverage is decided. The parity conformance suite reads this map
 * to check the read-model obligation, and every `null` must be matched by a
 * ledger row.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const READ_MODEL_EXTENSION_FAMILY_BY_TYPE = {
  skill: "skills",
  command: "commands",
  "mcp-server": "mcpServers",
  subagent: "subagents",
  files: "files",
  rule: "rules",
  hook: "hooks",
  knowledge: "knowledge",
} as const satisfies Record<CatalogExtensionType, keyof WorkspaceReadModel | null>;

// ---------------------------------------------------------------------------
// Factory configuration
// ---------------------------------------------------------------------------

/** Configuration the factory requires beyond `FileSystem` and `Path`. */
export interface WorkspaceReadModelConfigService {
  readonly projectRoot: AbsolutePath;
  readonly userHome: AbsolutePath;
  readonly allowedRoot: AbsolutePath;
}

/** Service tag for the {@link WorkspaceReadModelConfigService} the factory requires. */
export class WorkspaceReadModelConfig extends ServiceMap.Service<
  WorkspaceReadModelConfig,
  WorkspaceReadModelConfigService
>()("@agentxm/client-core/unstable/workspace/read-model/service/WorkspaceReadModelConfig") {}

// ---------------------------------------------------------------------------
// Workspace-root validation
// ---------------------------------------------------------------------------

/** Workspace root that has been validated against `allowedRoot`. */
export type ResolvedWorkspaceRoot = string & Brand.Brand<"ResolvedWorkspaceRoot">;
const ResolvedWorkspaceRoot = Brand.nominal<ResolvedWorkspaceRoot>();

/** Resolve and validate a workspace root resides within `allowedRoot`. */
const validateRoot = (
  pathSvc: Path.Path,
  candidate: AbsolutePath,
  allowedRoot: AbsolutePath,
): Effect.Effect<ResolvedWorkspaceRoot, WorkspaceRootEscape> =>
  Effect.gen(function* () {
    const resolved = pathSvc.resolve(candidate);
    const resolvedAllowed = pathSvc.resolve(allowedRoot);

    if (resolved === resolvedAllowed) return ResolvedWorkspaceRoot(resolved);

    const relative = pathSvc.relative(resolvedAllowed, resolved);
    if (relative !== "" && (relative.startsWith("..") || pathSvc.isAbsolute(relative))) {
      return yield* new WorkspaceRootEscape({
        workspaceRoot: candidate,
        allowedRoot,
      });
    }
    return ResolvedWorkspaceRoot(resolved);
  });

const memberNamesFromResolvedMap = (
  resolvedMap: Readonly<Record<string, unknown>>,
): ReadonlyArray<ExtensionName> =>
  Object.keys(resolvedMap).flatMap((fqn) => {
    const parts = parseExtensionFqnParts(fqn);
    return parts === undefined ? [] : [parts.name];
  });

// ---------------------------------------------------------------------------
// Pack-member maps for cross-subject implicit installation
// ---------------------------------------------------------------------------

/** Pack ref + resolved member names per cross-subject namespace. */
interface PackMemberSets {
  readonly key: { readonly scope: Scope; readonly type: "pack"; readonly name: string };
  readonly skills: ReadonlyArray<ExtensionName>;
  readonly commands: ReadonlyArray<ExtensionName>;
  readonly mcpServers: ReadonlyArray<ExtensionName>;
  readonly subagents: ReadonlyArray<ExtensionName>;
  readonly files: ReadonlyArray<ExtensionName>;
  readonly rules: ReadonlyArray<ExtensionName>;
  readonly hooks: ReadonlyArray<ExtensionName>;
}

// ---------------------------------------------------------------------------
// Per-scope wiring
// ---------------------------------------------------------------------------

interface BuildScopeDeps {
  readonly scope: Scope;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: ResolvedWorkspaceRoot;
  readonly settingsPath: AbsolutePath;
  readonly lockfilePath: AbsolutePath | null;
  readonly rootResolverState: AgentRootResolverState;
  /**
   * Diagnostics-buffer Ref shared with the factory. The factory pre-seeds
   * this buffer for the project scope (e.g. agent-root collision warnings
   * detected by the resolver layer); per-scope projection and scanner
   * emissions append onto the same buffer.
   */
  readonly diagnosticsRef: Ref.Ref<ReadonlyArray<Warning>>;
}

const buildScope = Effect.fn("workspace.read-model.build-scope")(function* (deps: BuildScopeDeps) {
  const {
    scope,
    fs,
    path,
    workspaceRoot,
    settingsPath,
    lockfilePath,
    rootResolverState,
    diagnosticsRef,
  } = deps;

  // Diagnostics buffer (Ref provided by the factory so collision warnings
  // detected by the resolver layer can be pre-seeded for the project scope).
  const diagnostics: Diagnostics = makeDiagnostics(diagnosticsRef);

  // Cached state-source cells: settings/settingsRaw + lockfile/lockfileRaw.
  const loaders = yield* makeScopedStateApi(scope, {
    fs,
    path,
    settingsPath,
    lockfilePath,
  });

  // Scanner cells — eagerly enumerate the closed scanner key set.
  const canonicalScanner = yield* Effect.cached(
    makeCanonicalExtensionsScanner({
      fs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
    }),
  );
  const agentDirScanner = yield* Effect.cached(
    makeAgentDirScanner({
      fs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
      agentRegistry: AGENTS,
    }),
  );
  const mcpConfigScanner = yield* Effect.cached(
    makeMcpConfigScanner({
      fs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
      agentRegistry: AGENTS,
    }),
  );
  const agentSettingsScanner = yield* Effect.cached(
    makeAgentSettingsScanner({
      fs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
      agentRegistry: AGENTS,
      rootResolverState,
    }),
  );

  // Build the pack subject first; per-subject pack-member input derives from it.
  const packsApi = yield* makePackExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
    diagnostics,
  });

  // Cache the installed-packs rollup once per scope; shared across subjects.
  const installedPackMembers: Effect.Effect<ReadonlyArray<PackMemberSets>> = yield* Effect.cached(
    Effect.gen(function* () {
      const active = yield* packsApi.active;
      return active.map<PackMemberSets>((row) => {
        const resolvedSome = Option.match(row.resolved, {
          onNone: () => null,
          onSome: (r) => r.lockEntry,
        });
        const skillNames =
          resolvedSome === null ? [] : memberNamesFromResolvedMap(resolvedSome.resolvedSkills);
        const commandNames =
          resolvedSome === null ? [] : memberNamesFromResolvedMap(resolvedSome.resolvedCommands);
        const mcpServerNames =
          resolvedSome === null ? [] : memberNamesFromResolvedMap(resolvedSome.resolvedMcpServers);
        const subagentNames =
          resolvedSome === null ? [] : memberNamesFromResolvedMap(resolvedSome.resolvedSubagents);
        const filesNames =
          resolvedSome === null ? [] : memberNamesFromResolvedMap(resolvedSome.resolvedFiles ?? {});
        const ruleNames =
          resolvedSome === null ? [] : memberNamesFromResolvedMap(resolvedSome.resolvedRules ?? {});
        const hookNames =
          resolvedSome === null ? [] : memberNamesFromResolvedMap(resolvedSome.resolvedHooks ?? {});
        return {
          key: row.key,
          skills: skillNames,
          commands: commandNames,
          mcpServers: mcpServerNames,
          subagents: subagentNames,
          files: filesNames,
          rules: ruleNames,
          hooks: hookNames,
        };
      });
    }),
  );

  const skillsInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForSkills>> =
    installedPackMembers.pipe(
      Effect.map((packs) =>
        packs.map((p) => ({
          ref: { key: p.key },
          skills: p.skills.map((name) => ({
            name,
            providingPack: { key: p.key },
          })),
        })),
      ),
    );

  const commandsInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForCommands>> =
    installedPackMembers.pipe(
      Effect.map((packs) =>
        packs.map((p) => ({
          ref: { key: p.key },
          commands: p.commands.map((name) => ({
            name,
            providingPack: { key: p.key },
          })),
        })),
      ),
    );

  const mcpServersInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForMcpServers>> =
    installedPackMembers.pipe(
      Effect.map((packs) =>
        packs.map((p) => ({
          ref: { key: p.key },
          mcpServers: p.mcpServers.map((name) => ({
            name,
            providingPack: { key: p.key },
          })),
        })),
      ),
    );

  const subagentsInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForSubagents>> =
    installedPackMembers.pipe(
      Effect.map((packs) =>
        packs.map((p) => ({
          ref: { key: p.key },
          subagents: p.subagents.map((name) => ({
            name,
            providingPack: { key: p.key },
          })),
        })),
      ),
    );

  const filesInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForFiles>> =
    installedPackMembers.pipe(
      Effect.map((packs) =>
        packs.map((p) => ({
          ref: { key: p.key },
          files: p.files.map((name) => ({
            name,
            providingPack: { key: p.key },
          })),
        })),
      ),
    );
  const rulesInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForRules>> =
    installedPackMembers.pipe(
      Effect.map((packs) =>
        packs.map((p) => ({
          ref: { key: p.key },
          rules: p.rules.map((name) => ({
            name,
            providingPack: { key: p.key },
          })),
        })),
      ),
    );
  const hooksInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForHooks>> =
    installedPackMembers.pipe(
      Effect.map((packs) =>
        packs.map((p) => ({
          ref: { key: p.key },
          hooks: p.hooks.map((name) => ({
            name,
            providingPack: { key: p.key },
          })),
        })),
      ),
    );

  const skills = yield* makeSkillExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, agentDir: agentDirScanner },
    installedPacks: skillsInstalledPacks,
    diagnostics,
  });

  const commands = yield* makeCommandExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, agentDir: agentDirScanner },
    installedPacks: commandsInstalledPacks,
    diagnostics,
  });

  const mcpServers = yield* makeMcpServerExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, mcpConfig: mcpConfigScanner },
    installedPacks: mcpServersInstalledPacks,
    diagnostics,
  });

  const subagents = yield* makeSubagentExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, agentDir: agentDirScanner },
    installedPacks: subagentsInstalledPacks,
    diagnostics,
  });

  const files = yield* makeFilesExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
    installedPacks: filesInstalledPacks,
    diagnostics,
  });

  const rules = yield* makeRuleExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
    installedPacks: rulesInstalledPacks,
    diagnostics,
  });

  const hooks = yield* makeHookExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
    installedPacks: hooksInstalledPacks,
    diagnostics,
  });

  const knowledge = yield* makeKnowledgeExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
    diagnostics,
  });

  // Cached fold of the three scanner cells into the shape agents expects.
  const observations: Effect.Effect<AgentScannerObservations> = yield* Effect.cached(
    Effect.gen(function* () {
      const agentDir: ReadonlyArray<AgentDirOccurrence> = yield* agentDirScanner;
      const agentSettings: ReadonlyArray<AgentSettingsOccurrence> = yield* agentSettingsScanner;
      const mcpConfig: ReadonlyArray<McpConfigOccurrence> = yield* mcpConfigScanner;
      return { agentDir, agentSettings, mcpConfig };
    }),
  );

  // Project settings into the narrowed `DeclaredSettingsShape` agents needs.
  const agentsSettings = loaders.settings.pipe(
    Effect.map((opt) =>
      Option.map(opt, (settings) => ({
        agents: settings.agents ?? [],
      })),
    ),
  );
  const agents: ScopedAgentsApi = makeScopedAgentsApi({
    scope,
    settings: agentsSettings,
    observations,
  });

  // Source-host views over the cached settings loader.
  const emptySources: ReadonlyArray<SourceHostConfig> = [];
  const declaredSourceHosts: ScopedSourceHostsApi["declared"] = loaders.settings.pipe(
    Effect.map((opt) =>
      Option.match(opt, {
        onNone: () => emptySources,
        onSome: (settings) => settings.sources ?? emptySources,
      }),
    ),
  );

  const sourceHosts: ScopedSourceHostsApi = {
    declared: declaredSourceHosts,
    effective: declaredSourceHosts,
    registryHosts: declaredSourceHosts.pipe(
      Effect.map((all) =>
        all.filter(
          (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
        ),
      ),
    ),
    byName: (name: string) =>
      declaredSourceHosts.pipe(
        Effect.map((all) => Option.fromUndefinedOr(all.find((s) => s.name === name))),
      ),
  };

  // Owner view over the cached settings loader.
  const owner: ScopedOwnerApi = loaders.settings.pipe(
    Effect.map((opt) => Option.flatMap(opt, (settings) => Option.fromUndefinedOr(settings.owner))),
  );

  // Raw-bytes accessor reads from the cached raw cell; absent (`Option.none`)
  // is distinct from unreadable (IO error in the channel).
  const raw: ScopedStateApi["raw"] = (source) =>
    source === "settings" ? loaders.settingsRaw : loaders.lockfileRaw;

  const state: ScopedStateApi = {
    settings: loaders.settings,
    lockfile: loaders.lockfile,
    raw,
  };

  return {
    scope,
    skills,
    commands,
    mcpServers,
    subagents,
    files,
    rules,
    hooks,
    knowledge,
    packs: packsApi,
    agents,
    state,
    sourceHosts,
    owner,
    diagnostics: diagnostics.snapshot,
    canonicalExtensions: canonicalScanner,
  } satisfies WorkspaceReadModel;
});

// ---------------------------------------------------------------------------
// Per-scope factory
// ---------------------------------------------------------------------------

/**
 * Build a {@link WorkspaceReadModel} for the requested scope.
 *
 * Each invocation produces a fresh instance with its own cached cells; call
 * once at the command boundary and pass the value inward. Callers that need
 * both scopes invoke the factory twice.
 *
 * Cross-scope state (the agent-root resolver and its collision warnings) is
 * supplied by {@link AgentRootResolver}, which must be provided in the
 * environment so the same warnings flow into every scope built against the
 * same layer.
 */
export const makeWorkspaceReadModel = (
  scope: Scope,
): Effect.Effect<
  WorkspaceReadModel,
  WorkspaceRootEscape,
  FileSystem.FileSystem | Path.Path | WorkspaceReadModelConfig | AgentRootResolver
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const config = yield* WorkspaceReadModelConfig;
    const resolver = yield* AgentRootResolver;

    // Validate roots eagerly — the only path that surfaces `WorkspaceRootEscape`.
    const projectRootResolved = yield* validateRoot(
      pathSvc,
      config.projectRoot,
      config.allowedRoot,
    );
    const userHomeResolved = yield* validateRoot(pathSvc, config.userHome, config.allowedRoot);

    // Workspace path layout per scope.
    const workspaceRoot = scope === "project" ? projectRootResolved : userHomeResolved;
    const axmDir = pathSvc.join(workspaceRoot, AXM_DIR_NAME);
    const settingsPath = makeAbsolutePath(pathSvc, pathSvc.join(axmDir, SETTINGS_FILENAME));
    const lockfilePath = makeAbsolutePath(pathSvc, pathSvc.join(axmDir, LOCKFILE_NAME));

    // Pre-seed agent-root collision warnings into the project scope only;
    // the user scope receives a clean buffer.
    const diagnosticsRef = yield* Ref.make<ReadonlyArray<Warning>>(
      scope === "project" ? resolver.collisionWarnings : [],
    );

    return yield* buildScope({
      scope,
      fs,
      path: pathSvc,
      workspaceRoot,
      settingsPath,
      lockfilePath,
      rootResolverState: resolver.state,
      diagnosticsRef,
    });
  }).pipe(Effect.withSpan("workspace.read-model.make"));
