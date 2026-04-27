/** Scoped read-only workspace model service and live layer. */

import * as Brand from "effect/Brand";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../agents/registry.js";
import { LOCKFILE_NAME } from "../../lockfile/lockfile.js";
import { parseFullyQualifiedNameParts, type ExtensionName } from "../../extensions/common.js";
import { decodeHandleSync, type Handle } from "../../extensions/handle.js";
import { SETTINGS_FILENAME } from "../../settings/settings.js";
import type { SourceHostConfig } from "../../settings/schema.js";
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
  makeFileExtensionsApi,
  makeMcpServerExtensionsApi,
  makePackExtensionsApi,
  makeRuleExtensionsApi,
  makeSkillExtensionsApi,
  makeSubagentExtensionsApi,
  type CommandExtensionsApi,
  type FileExtensionsApi,
  type InstalledPackForCommands,
  type InstalledPackForFiles,
  type InstalledPackForMcpServers,
  type InstalledPackForRules,
  type InstalledPackForSkills,
  type InstalledPackForSubagents,
  type McpServerExtensionsApi,
  type PackExtensionsApi,
  type RuleExtensionsApi,
  type SkillExtensionsApi,
  type SubagentExtensionsApi,
} from "./extensions/index.js";
import {
  detectAgentRootCollisions,
  makeAgentDirScanner,
  makeAgentRootResolverState,
  makeAgentSettingsScanner,
  makeCanonicalExtensionsScanner,
  makeMcpConfigScanner,
  type AgentDirOccurrence,
  type AgentRootResolverState,
  type AgentSettingsOccurrence,
  type McpConfigOccurrence,
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

/** Scoped profile views over the cached settings loader. */
export interface ScopedProfileApi {
  readonly declared: Effect.Effect<Option.Option<Handle>, SettingsReadError>;
  readonly effective: Effect.Effect<Handle, SettingsReadError>;
}

/** Public surface returned by `ctx.scope(scope)`. */
export interface ScopedWorkspaceReadModel {
  readonly scope: Scope;
  readonly skills: SkillExtensionsApi;
  readonly commands: CommandExtensionsApi;
  readonly mcpServers: McpServerExtensionsApi;
  readonly subagents: SubagentExtensionsApi;
  readonly files: FileExtensionsApi;
  readonly rules: RuleExtensionsApi;
  readonly packs: PackExtensionsApi;
  readonly agents: ScopedAgentsApi;
  readonly state: ScopedStateApi;
  readonly sourceHosts: ScopedSourceHostsApi;
  readonly profile: ScopedProfileApi;
  readonly diagnostics: Effect.Effect<ReadonlyArray<Warning>>;
}

// ---------------------------------------------------------------------------
// Live Layer configuration
// ---------------------------------------------------------------------------

/** Configuration the Live Layer requires beyond `FileSystem` and `Path`. */
export interface WorkspaceReadModelConfigService {
  readonly projectRoot: string;
  readonly userHome: string;
  readonly allowedRoot: string;
}

/** Service tag for the `WorkspaceReadModelConfigService` value the Live Layer requires. */
export class WorkspaceReadModelConfig extends ServiceMap.Service<
  WorkspaceReadModelConfig,
  WorkspaceReadModelConfigService
>()("axm/WorkspaceReadModel/Config") {}

// ---------------------------------------------------------------------------
// WorkspaceReadModel service tag
// ---------------------------------------------------------------------------

/** The single workspace read-model service tag. */
export class WorkspaceReadModel extends ServiceMap.Service<
  WorkspaceReadModel,
  {
    readonly scope: (scope: Scope) => ScopedWorkspaceReadModel;
    /** Test-only: cached-effect count for the most recent construction. */
    readonly __debugCachedEffectCount: Effect.Effect<number>;
  }
>()("axm/WorkspaceReadModel") {}

// ---------------------------------------------------------------------------
// Workspace-root validation
// ---------------------------------------------------------------------------

/** Workspace root that has been validated against `allowedRoot`. */
export type ResolvedWorkspaceRoot = string & Brand.Brand<"ResolvedWorkspaceRoot">;
const ResolvedWorkspaceRoot = Brand.nominal<ResolvedWorkspaceRoot>();

/** Resolve and validate a workspace root resides within `allowedRoot`. */
const validateRoot = (
  pathSvc: Path.Path,
  candidate: string,
  allowedRoot: string,
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

// ---------------------------------------------------------------------------
// Default profile
// ---------------------------------------------------------------------------

const DEFAULT_PROFILE: Handle = decodeHandleSync("@community");

const memberNamesFromResolvedMap = (
  resolvedMap: Readonly<Record<string, unknown>>,
): ReadonlyArray<ExtensionName> =>
  Object.keys(resolvedMap).flatMap((fqn) => {
    const parts = parseFullyQualifiedNameParts(fqn);
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
}

// ---------------------------------------------------------------------------
// Per-scope wiring
// ---------------------------------------------------------------------------

interface BuildScopeDeps {
  readonly scope: Scope;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: ResolvedWorkspaceRoot;
  readonly settingsPath: string;
  readonly lockfilePath: string | null;
  readonly bumpCacheCount: () => Effect.Effect<void>;
  readonly rootResolverState: AgentRootResolverState;
  /**
   * Diagnostics-buffer Ref shared with the live layer. The live layer
   * pre-seeds this buffer (e.g. agent-root collision warnings detected at
   * construction time); per-scope projection and scanner emissions append
   * onto the same buffer.
   */
  readonly diagnosticsRef: Ref.Ref<ReadonlyArray<Warning>>;
}

const buildScope = Effect.fn("workspace.read-model.live.build-scope")(function* (
  deps: BuildScopeDeps,
) {
  const {
    scope,
    fs,
    path,
    workspaceRoot,
    settingsPath,
    lockfilePath,
    bumpCacheCount,
    rootResolverState,
    diagnosticsRef,
  } = deps;

  // Diagnostics buffer (Ref provided by the live layer so collision warnings
  // detected at Live construction can be pre-seeded for the project scope).
  const diagnostics: Diagnostics = makeDiagnostics(diagnosticsRef);

  // Cached state-source cells: settings/settingsRaw + lockfile/lockfileRaw.
  const loaders = yield* makeScopedStateApi(scope, {
    fs,
    path,
    settingsPath,
    lockfilePath,
  });
  yield* bumpCacheCount(); // settings
  yield* bumpCacheCount(); // settingsRaw
  if (lockfilePath !== null) {
    yield* bumpCacheCount(); // lockfile
    yield* bumpCacheCount(); // lockfileRaw
  }

  // Scanner cells — eagerly enumerate the closed scanner key set.
  // 4 scanners × 1 scope = 4 cached cells.
  const canonicalScanner = yield* Effect.cached(
    makeCanonicalExtensionsScanner({
      fs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
    }),
  );
  yield* bumpCacheCount();
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
  yield* bumpCacheCount();
  const mcpConfigScanner = yield* Effect.cached(
    makeMcpConfigScanner({
      fs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
      agentRegistry: AGENTS,
      rootResolverState,
    }),
  );
  yield* bumpCacheCount();
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
  yield* bumpCacheCount();

  // Build the pack subject first; per-subject pack-member input derives from it.
  const packsApi = yield* makePackExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
    ignoredNames: new Set<string>(),
    diagnostics,
  });

  // Cache the installed-packs rollup once per scope; shared across subjects.
  const installedPackMembers: Effect.Effect<ReadonlyArray<PackMemberSets>> = yield* Effect.cached(
    Effect.gen(function* () {
      const installed = yield* packsApi.installed;
      return installed.map<PackMemberSets>((row) => {
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
        return {
          key: row.key,
          skills: skillNames,
          commands: commandNames,
          mcpServers: mcpServerNames,
          subagents: subagentNames,
        };
      });
    }),
  );
  yield* bumpCacheCount();

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

  const filesInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForFiles>> = Effect.succeed(
    [],
  );
  const rulesInstalledPacks: Effect.Effect<ReadonlyArray<InstalledPackForRules>> = Effect.succeed(
    [],
  );

  const skills = yield* makeSkillExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, agentDir: agentDirScanner },
    installedPacks: skillsInstalledPacks,
    ignoredNames: new Set<string>(),
    diagnostics,
  });

  const commands = yield* makeCommandExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, agentDir: agentDirScanner },
    installedPacks: commandsInstalledPacks,
    ignoredNames: new Set<string>(),
    diagnostics,
  });

  const mcpServers = yield* makeMcpServerExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, mcpConfig: mcpConfigScanner },
    installedPacks: mcpServersInstalledPacks,
    ignoredNames: new Set<string>(),
    diagnostics,
  });

  const subagents = yield* makeSubagentExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, agentDir: agentDirScanner },
    installedPacks: subagentsInstalledPacks,
    ignoredNames: new Set<string>(),
    diagnostics,
  });

  const files = yield* makeFileExtensionsApi({
    scope,
    scanners: { canonical: canonicalScanner },
    installedPacks: filesInstalledPacks,
    ignoredNames: new Set<string>(),
    diagnostics,
  });

  const rules = yield* makeRuleExtensionsApi({
    scope,
    scanners: { canonical: canonicalScanner },
    installedPacks: rulesInstalledPacks,
    ignoredNames: new Set<string>(),
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
  yield* bumpCacheCount();

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

  // Profile views over the cached settings loader.
  const declaredProfile: ScopedProfileApi["declared"] = loaders.settings.pipe(
    Effect.map((opt) =>
      Option.flatMap(opt, (settings) => Option.fromUndefinedOr(settings.profile)),
    ),
  );
  const effectiveProfile: ScopedProfileApi["effective"] = declaredProfile.pipe(
    Effect.map((opt) => Option.getOrElse(opt, () => DEFAULT_PROFILE)),
  );
  const profile: ScopedProfileApi = {
    declared: declaredProfile,
    effective: effectiveProfile,
  };

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
    packs: packsApi,
    agents,
    state,
    sourceHosts,
    profile,
    diagnostics: diagnostics.snapshot,
  } satisfies ScopedWorkspaceReadModel;
});

// ---------------------------------------------------------------------------
// Live Layer
// ---------------------------------------------------------------------------

/** Production Live Layer for `WorkspaceReadModel`. */
export const WorkspaceReadModelLive: Layer.Layer<
  WorkspaceReadModel,
  WorkspaceRootEscape,
  FileSystem.FileSystem | Path.Path | WorkspaceReadModelConfig
> = Layer.effect(
  WorkspaceReadModel,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const config = yield* WorkspaceReadModelConfig;

    // Validate roots eagerly — the only path that surfaces `WorkspaceRootEscape`.
    const projectRootResolved = yield* validateRoot(
      pathSvc,
      config.projectRoot,
      config.allowedRoot,
    );
    const userHomeResolved = yield* validateRoot(pathSvc, config.userHome, config.allowedRoot);

    // Per-instance debug counter exposed as `__debugCachedEffectCount`.
    const cachedEffectCountRef = yield* Ref.make(0);
    const bumpCacheCount = (): Effect.Effect<void> =>
      Ref.update(cachedEffectCountRef, (n: number) => n + 1);

    // Workspace path layout per scope.
    const projectAxmDir = pathSvc.join(projectRootResolved, ".axm");
    const projectSettingsPath = pathSvc.join(projectAxmDir, SETTINGS_FILENAME);
    const projectLockfilePath = pathSvc.join(projectAxmDir, LOCKFILE_NAME);
    const userAxmDir = pathSvc.join(userHomeResolved, ".axm");
    const userSettingsPath = pathSvc.join(userAxmDir, SETTINGS_FILENAME);
    const userLockfilePath = pathSvc.join(userAxmDir, LOCKFILE_NAME);

    // Shared agent-root resolver state — one tracker per `WorkspaceReadModelLive`
    // instance so the heuristic-fallback warning fires at most once per agent
    // across both scopes and both `mcp-config` / `agent-settings` scanners.
    const rootResolverState = makeAgentRootResolverState();

    // Per-scope diagnostics buffers built up-front so the live layer can
    // pre-seed agent-root collision warnings into the project scope before
    // `buildScope` runs.
    const projectDiagnosticsRef = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const userDiagnosticsRef = yield* Ref.make<ReadonlyArray<Warning>>([]);
    yield* detectAgentRootCollisions(
      pathSvc,
      Object.values(AGENTS),
      makeDiagnostics(projectDiagnosticsRef),
    );

    // Memoize per-scope build so `ctx.scope("project")` is idempotent.
    const scoped = new Map<Scope, ScopedWorkspaceReadModel>();

    const buildAndStore = (scope: Scope): Effect.Effect<ScopedWorkspaceReadModel> =>
      Effect.gen(function* () {
        const cached = scoped.get(scope);
        if (cached !== undefined) return cached;
        const value = yield* buildScope({
          scope,
          fs,
          path: pathSvc,
          workspaceRoot: scope === "project" ? projectRootResolved : userHomeResolved,
          settingsPath: scope === "project" ? projectSettingsPath : userSettingsPath,
          lockfilePath: scope === "project" ? projectLockfilePath : userLockfilePath,
          bumpCacheCount,
          rootResolverState,
          diagnosticsRef: scope === "project" ? projectDiagnosticsRef : userDiagnosticsRef,
        });
        scoped.set(scope, value);
        return value;
      });

    // Materialize both scopes eagerly; IO still runs lazily inside each cell.
    const projectScope = yield* buildAndStore("project");
    const userScope = yield* buildAndStore("user");

    // The `scope()` selector returns the pre-built memoized scoped read model.
    const scopeSelector = (s: Scope): ScopedWorkspaceReadModel =>
      s === "project" ? projectScope : userScope;

    return WorkspaceReadModel.of({
      scope: scopeSelector,
      __debugCachedEffectCount: Ref.get(cachedEffectCountRef),
    });
  }).pipe(Effect.withSpan("workspace.read-model.live.build")),
);
