/** Per-scope read-only workspace model factory and configuration. */

import * as Brand from "effect/Brand";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import type { WorkspaceLayoutError } from "../errors.js";
import { AgentPresenceProbe } from "../../../projection/agent-adapters/index.js";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import type { CatalogExtensionType } from "@agentxm/extension-model/unstable/extension-types/schema";
import { type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { Settings, SourceHostConfig } from "../../settings/schema.js";
import {
  isWithinOrEqual,
  makeAbsolutePath,
  type AbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";
import {
  resolveProjectWorkspaceLayout,
  resolveProjectWorkspaceStatePaths,
  resolveUserWorkspaceLayout,
  type WorkspaceLayout,
} from "../layout.js";
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
  makeHookExtensionsApi,
  makeKnowledgeExtensionsApi,
  makeMcpServerExtensionsApi,
  makePackExtensionsApi,
  makeRuleExtensionsApi,
  makeSkillExtensionsApi,
  makeSubagentExtensionsApi,
  type HookExtensionsApi,
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
import { makeScannerFileSystem } from "./scanners/fs-helpers.js";
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
  readonly mcpServers: McpServerExtensionsApi;
  readonly subagents: SubagentExtensionsApi;
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
  /** The resolved storage layout, or none when the layout could not be resolved. */
  readonly layout: Option.Option<WorkspaceLayout>;
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
  "mcp-server": "mcpServers",
  subagent: "subagents",
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
>()("@agentxm/workspace/desired-state/workspace/read-model/service/WorkspaceReadModelConfig") {}

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
    if (!isWithinOrEqual(pathSvc, allowedRoot, resolved)) {
      return yield* new WorkspaceRootEscape({
        workspaceRoot: candidate,
        allowedRoot,
      });
    }
    return ResolvedWorkspaceRoot(resolved);
  });

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

  const settingsResult = yield* Effect.result(loaders.settings);
  const layoutSettings: Settings = Result.isSuccess(settingsResult)
    ? Option.getOrElse(settingsResult.success, () => ({}))
    : {};
  const resolveLayout = (): Effect.Effect<WorkspaceLayout, WorkspaceLayoutError> =>
    scope === "project"
      ? resolveProjectWorkspaceLayout(makeAbsolutePath(path, workspaceRoot), layoutSettings).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        )
      : resolveUserWorkspaceLayout(makeAbsolutePath(path, workspaceRoot), layoutSettings).pipe(
          Effect.provideService(Path.Path, path),
        );
  const layoutResult = yield* Effect.result(resolveLayout());
  if (Result.isFailure(layoutResult)) {
    yield* diagnostics.append({
      source: "scanner",
      message: `workspace-layout: ${layoutResult.failure.message}`,
      code: "scanner-io",
    });
  }

  // Scanner cells — eagerly enumerate the closed scanner key set.
  const scannerFs = yield* makeScannerFileSystem(fs);
  const canonicalScanner = yield* Effect.cached(
    Result.isFailure(layoutResult)
      ? Effect.succeed<ReadonlyArray<CanonicalExtensionOccurrence>>([])
      : makeCanonicalExtensionsScanner({
          fs: scannerFs,
          path,
          workspaceRoot,
          diagnostics,
          layout: layoutResult.success,
        }),
  );
  const agentDirScanner = yield* Effect.cached(
    makeAgentDirScanner({
      fs: scannerFs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
      agentRegistry: AGENT_DESCRIPTORS,
    }),
  );
  const mcpConfigScanner = yield* Effect.cached(
    makeMcpConfigScanner({
      fs: scannerFs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
      agentRegistry: AGENT_DESCRIPTORS,
    }),
  );
  const agentSettingsScanner = yield* Effect.cached(
    makeAgentSettingsScanner({
      fs: scannerFs,
      path,
      workspaceRoot,
      scope,
      diagnostics,
      agentRegistry: AGENT_DESCRIPTORS,
      rootResolverState,
    }),
  );

  // Membership is a reachability fact the desired-state graph owns; every
  // subject below shapes only the direct rows its own sources declare.
  const packsApi = yield* makePackExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
  });

  const skills = yield* makeSkillExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, agentDir: agentDirScanner },
  });

  const mcpServers = yield* makeMcpServerExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, mcpConfig: mcpConfigScanner },
  });

  const subagents = yield* makeSubagentExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner, agentDir: agentDirScanner },
  });

  const rules = yield* makeRuleExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
  });

  const hooks = yield* makeHookExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
  });

  const knowledge = yield* makeKnowledgeExtensionsApi({
    scope,
    loaders,
    scanners: { canonical: canonicalScanner },
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
  const presenceProbe = yield* Effect.serviceOption(AgentPresenceProbe);
  const presence = yield* Effect.cached(
    Option.match(presenceProbe, {
      onNone: () => Effect.succeed(new Set<MaterializationTargetId>()),
      onSome: (probe) =>
        probe.detect(workspaceRoot, scope).pipe(
          Effect.map((detected) => new Set<MaterializationTargetId>(detected)),
          Effect.catchTag("AgentPresenceUnavailable", (error) =>
            diagnostics
              .append({
                source: "scanner",
                message: `agent-presence: structured detection failed: ${error.message}`,
                code: "scanner-io",
              })
              .pipe(Effect.map(() => new Set<MaterializationTargetId>())),
          ),
        ),
    }),
  );
  const agents: ScopedAgentsApi = makeScopedAgentsApi({
    scope,
    settings: agentsSettings,
    presence,
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
    mcpServers,
    subagents,
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
    layout: Result.isFailure(layoutResult) ? Option.none() : Option.some(layoutResult.success),
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
    const projectPaths = resolveProjectWorkspaceStatePaths(pathSvc, config.projectRoot);
    const userLayout = yield* resolveUserWorkspaceLayout(
      makeAbsolutePath(pathSvc, userHomeResolved),
    ).pipe(Effect.provideService(Path.Path, pathSvc));
    const settingsPath = scope === "project" ? projectPaths.settingsPath : userLayout.settingsPath;
    const lockfilePath = scope === "project" ? projectPaths.lockPath : userLayout.lockPath;

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
