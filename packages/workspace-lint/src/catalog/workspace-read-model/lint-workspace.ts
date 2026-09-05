// @effect-diagnostics anyUnknownInErrorContext:off — lint converts opaque read-model failures into fact-only findings at this boundary
/**
 * `LintWorkspace` — single helper that produces both the per-rule
 * `WorkspaceRuleContext` and the flat `LintWorkspaceView` projection a lint
 * run needs, sharing one `WorkspaceReadModelLive` setup.
 *
 * `LintWorkspaceView` exposes `installedSkills: InstalledSkillInfo[]` and
 * `installedPacks: InstalledPackInfo[]` with per-provenance `displayRoot`s:
 *
 *   Registry-installed native skill: `agent_extensions/<source>/<@owner>/skills/<name>/src/`
 *   Portable acquired skill:         `agent_extensions/<source>/<source-full-name>/`
 *   Registry pack:                   `agent_extensions/<source>/<@owner>/packs/<name>/`
 *                                    (NO `src/` — matches the on-disk layout.)
 *
 * The companion `WorkspaceRuleContext` is scoped to project or user.
 * User-scope resolution uses `.axm/workspace/` under `$AXM_USER_HOME` when set,
 * otherwise under `$HOME`; a follow-up owns the broader XDG story.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { AgentRootResolverLive } from "@agentxm/workspace-state";
import {
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
  type WorkspaceReadModel,
} from "@agentxm/workspace-state";
import { AXM_DIR_NAME, USER_WORKSPACE_DIRECTORY } from "@agentxm/workspace-state";
import type {
  LockfileReadError,
  SettingsReadError,
  WorkspaceRootEscape,
} from "@agentxm/workspace-state";
import type {
  ActualMcpServer,
  ActualPack,
  ActualSkill,
  ActualSubagent,
  InstalledHook,
  InstalledKnowledgeBundle,
  InstalledMcpServer,
  InstalledPack,
  InstalledRule,
  InstalledSkill,
  InstalledSubagent,
} from "@agentxm/workspace-state";
import type {
  HookRuleContext,
  KnowledgeRuleContext,
  McpServerRuleContext,
  RuleRuleContext,
  SubagentRuleContext,
} from "@agentxm/registry-protocol/unstable/lint/context";
import type {
  InstalledExtensionManifest,
  WorkspaceInstructionAccessor,
  WorkspaceProjectionsAccessor,
  WorkspaceRuleContext,
} from "../../workspace-context.js";
import type { InstalledSkillInfo } from "@agentxm/registry-protocol/unstable/lint/catalog/skill-accessor/contexts";
import type { InstalledPackInfo } from "@agentxm/registry-protocol/unstable/lint/catalog/pack-accessor/contexts";
import { makePlatformSkillFileAccessor } from "@agentxm/extension-workspace";
import { makePlatformPackFileAccessor } from "@agentxm/extension-workspace";
import {
  acquiredExtensionDisplayPathFromLockEntry,
  type ExtensionPathLockEntry,
} from "@agentxm/workspace-state";
import { parseRegistrySourceRef } from "@agentxm/extension-model/unstable/extensions/registry-source";
import type { SkillLockEntry } from "@agentxm/workspace-state";
import { HOOK_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import { KNOWLEDGE_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import {
  inspectKnowledgePackage,
  buildPackDependencyReachability,
  type PackDependencyAuthority,
  type PackDependencyMemberObservation,
  type PackDependencyReachability,
  readAxmSkillWorkspaceCompatibility,
  observeInstructionProjection,
  resolveInstructionsConfig,
} from "@agentxm/extension-workspace";
import type { KnowledgeInspection } from "@agentxm/registry-protocol/unstable/knowledge/okf";
import { MCP_SERVER_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { canonicalDisplayRoot } from "../workspace/display-paths.js";
import { RULE_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/rules/manifest-schema";
import { PACK_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { PackManifestSchema } from "@agentxm/extension-model/unstable/packs/manifest-schema";
import { MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/skills/manifest-schema";
import type { AxmSkillCompatibilityPolicyService } from "@agentxm/extension-workspace";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME } from "@agentxm/extension-model/unstable/subagents/manifest-schema";
import { readManifestJson } from "./manifest-json.js";
import type {
  ExtensionType,
  ExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";

// -----------------------------------------------------------------------------
// LintWorkspaceView
// -----------------------------------------------------------------------------

/**
 * Flat projection of the workspace read model that the lint accessor builders
 * consume. `buildSkillRuleContexts` reads `installedSkills`;
 * `buildPackRuleContexts` reads `installedPacks`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LintWorkspaceView {
  readonly installedSkills: ReadonlyArray<InstalledSkillInfo>;
  readonly installedPacks: ReadonlyArray<InstalledPackInfo>;
  readonly subagentContexts: ReadonlyArray<SubagentRuleContext>;
  readonly mcpServerContexts: ReadonlyArray<McpServerRuleContext>;
  readonly hookContexts: ReadonlyArray<HookRuleContext>;
  readonly ruleContexts: ReadonlyArray<RuleRuleContext>;
  readonly knowledgeContexts: ReadonlyArray<KnowledgeRuleContext>;
}

// -----------------------------------------------------------------------------
// buildLintWorkspace
// -----------------------------------------------------------------------------

/**
 * Argument shape for `buildLintWorkspace`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface BuildLintWorkspaceArgs {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspaceRoot: string;
  /**
   * User home directory used by {@link makeWorkspaceReadModel} to validate
   * the alternate scope's root against `allowedRoot`. Supplied even when
   * only one scope is queried so root-escape checks stay symmetric.
   */
  readonly userHome: string;
  readonly scope: "project" | "user";
  /** The filesystem is a materialized Git-index snapshot, not the live workspace. */
  readonly gitIndexView?: boolean;
  /**
   * Optional `displayRoot` override for the `WorkspaceRuleContext`. Defaults
   * to `""` (accessor-relative paths render under the workspace root).
   */
  readonly displayRoot?: string;
  /** Runtime-pinned evaluator used by status and the compatibility lint rule. */
  readonly axmSkillCompatibilityPolicy?: AxmSkillCompatibilityPolicyService;
  /** Caller-bound effective workspace owner accessor. */
  readonly owner?: Effect.Effect<Option.Option<Handle>>;
  /** Caller-bound read-back currency for aggregate managed output units. */
  readonly projections?: WorkspaceProjectionsAccessor;
  /** Test seam for proving one package inspection per selected bundle. */
  readonly inspectKnowledge?: (
    packageRoot: string,
  ) => Effect.Effect<
    { readonly inspection: KnowledgeInspection },
    unknown,
    FileSystem.FileSystem | Path.Path
  >;
}

/**
 * The combined output of `buildLintWorkspace`: the per-rule
 * `WorkspaceRuleContext` plus the flat `LintWorkspaceView`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LintWorkspace {
  readonly rule: WorkspaceRuleContext;
  readonly view: LintWorkspaceView;
}

/**
 * Build the per-rule `WorkspaceRuleContext` and the flat `LintWorkspaceView`
 * via a single {@link makeWorkspaceReadModel} invocation.
 *
 * `WorkspaceRootEscape` is surfaced in the error channel by the factory when
 * `workspaceRoot` or `userHome` escape the filesystem root.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildLintWorkspace = (
  args: BuildLintWorkspaceArgs,
): Effect.Effect<LintWorkspace, WorkspaceRootEscape | SettingsReadError | LockfileReadError> => {
  const platformLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, args.platform.fs),
    Layer.succeed(Path.Path, args.platform.path),
  );
  const env = Layer.mergeAll(
    platformLayer,
    Layer.succeed(WorkspaceReadModelConfig, {
      projectRoot: makeAbsolutePath(args.platform.path, args.workspaceRoot),
      userHome: makeAbsolutePath(args.platform.path, args.userHome),
      allowedRoot: makeAbsolutePath(args.platform.path, "/"),
    }),
    AgentRootResolverLive.pipe(Layer.provide(platformLayer)),
  );
  return Effect.gen(function* () {
    const readModel = yield* makeWorkspaceReadModel(args.scope);
    const axmDir =
      args.scope === "user"
        ? args.platform.path.join(
            args.userHome,
            AXM_DIR_NAME,
            USER_WORKSPACE_DIRECTORY,
            AXM_DIR_NAME,
          )
        : args.platform.path.join(args.workspaceRoot, AXM_DIR_NAME);
    const projection = yield* buildLintWorkspaceView({
      platform: args.platform,
      workspaceRoot: args.workspaceRoot,
      readModel,
      scope: args.scope,
      inspectKnowledge: args.inspectKnowledge ?? inspectKnowledgePackage,
    });
    const rule: WorkspaceRuleContext = {
      subject: { root: args.workspaceRoot, scope: args.scope },
      workspace: readModel,
      axmDirExists: args.platform.fs.exists(axmDir).pipe(Effect.catch(() => Effect.succeed(false))),
      instructions: yield* makeInstructionAccessor({
        platform: args.platform,
        workspaceRoot: args.workspaceRoot,
        scope: args.scope,
        readModel,
        gitIndexView: args.gitIndexView === true,
      }),
      // The projection already read every installed manifest; hand the same
      // values to workspace rules rather than re-reading them per rule.
      installedExtensions: { manifests: Effect.succeed(projection.installedManifests) },
      packDependencyReachability: Effect.succeed(projection.packDependencyReachability),
      ...(args.owner === undefined ? {} : { owner: args.owner }),
      ...(args.projections === undefined ? {} : { projections: args.projections }),
      ...(args.axmSkillCompatibilityPolicy === undefined
        ? {}
        : {
            axmSkillCompatibility: readAxmSkillWorkspaceCompatibility({
              platform: args.platform,
              workspace: readModel,
              policy: args.axmSkillCompatibilityPolicy,
            }),
          }),
      displayRoot: args.displayRoot ?? "",
    };
    return { rule, view: projection.view };
  }).pipe(Effect.provide(env));
};

/**
 * The instruction rules share one observation per lint run: roots are
 * discovered and the plan is expanded once, and every rule reads target and
 * `.gitignore` facts from the same snapshot.
 */
const makeInstructionAccessor = (args: {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly readModel: WorkspaceReadModel;
  readonly gitIndexView: boolean;
}): Effect.Effect<WorkspaceInstructionAccessor> =>
  Effect.gen(function* () {
    const platformLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, args.platform.fs),
      Layer.succeed(Path.Path, args.platform.path),
    );
    const snapshot = yield* Effect.cached(
      Effect.gen(function* () {
        const settings = yield* args.readModel.state.settings.pipe(
          Effect.catch(() => Effect.succeed(Option.none())),
        );
        if (Option.isNone(settings)) return Option.none();
        const rawConfig = Option.fromUndefinedOr(settings.value.instructionFiles);
        if (Option.isNone(rawConfig) || rawConfig.value === false) return Option.none();
        return Option.some(
          yield* observeInstructionProjection({
            workspaceRoot: args.workspaceRoot,
            scope: args.scope,
            configuredAgents: settings.value.agents ?? [],
            config: resolveInstructionsConfig(rawConfig.value),
            gitIndexView: args.gitIndexView,
          }).pipe(Effect.provide(platformLayer)),
        );
      }),
    );
    return { snapshot };
  });

// -----------------------------------------------------------------------------
// LintWorkspaceView projection (internal)
// -----------------------------------------------------------------------------

interface BuildLintWorkspaceViewArgs {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspaceRoot: string;
  readonly readModel: WorkspaceReadModel;
  readonly scope: "project" | "user";
  readonly inspectKnowledge: (
    packageRoot: string,
  ) => Effect.Effect<
    { readonly inspection: KnowledgeInspection },
    unknown,
    FileSystem.FileSystem | Path.Path
  >;
}

/**
 * A per-extension rule context paired with the identity the workspace-level
 * accessor needs: the extension's workspace name and the path of the manifest
 * the projection read. The `LintWorkspaceView` keeps only the contexts; the
 * `installedExtensions` accessor keeps only the manifests.
 */
interface NamedContext<C> {
  readonly name: string;
  readonly manifestPath: string;
  readonly context: C;
}

interface NamedSkill {
  readonly name: string;
  readonly manifestPath: string;
  readonly info: InstalledSkillInfo;
}

interface NamedPack {
  readonly installed: InstalledPack;
  readonly info: InstalledPackInfo;
}

/** Combined output of the workspace projection. */
interface LintWorkspaceProjection {
  readonly view: LintWorkspaceView;
  readonly installedManifests: ReadonlyArray<InstalledExtensionManifest>;
  readonly packDependencyReachability: ReadonlyArray<PackDependencyReachability>;
}

const joinManifestPath = (root: string, filename: string): string =>
  root === "" || root === "." ? filename : `${root}/${filename}`;

const buildLintWorkspaceView = (
  args: BuildLintWorkspaceViewArgs,
): Effect.Effect<
  LintWorkspaceProjection,
  SettingsReadError | LockfileReadError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const [skills, packs, subagents, mcpServers, hooks, rules, knowledge] = yield* Effect.all(
      [
        args.readModel.skills.installed,
        args.readModel.packs.installed,
        args.readModel.subagents.installed,
        args.readModel.mcpServers.installed,
        args.readModel.hooks.installed,
        args.readModel.rules.installed,
        args.readModel.knowledge.installed,
      ],
      { concurrency: "unbounded" },
    );
    const namedSkills = skills.flatMap((skill): ReadonlyArray<NamedSkill> => {
      const built = installedSkillToInfo(args, skill);
      return built === undefined
        ? []
        : [
            {
              name: skill.key.name,
              manifestPath: joinManifestPath(built.packageDisplayRoot, SKILL_MANIFEST_FILENAME),
              info: built.info,
            },
          ];
    });
    const installedPacks = packs.flatMap((pack): ReadonlyArray<NamedPack> => {
      const info = installedPackToInfo(args, pack);
      return info === undefined ? [] : [{ installed: pack, info }];
    });
    const namedSubagents = subagents.flatMap((subagent) => {
      const context = installedSubagentToContext(args, subagent);
      return context === undefined
        ? []
        : [namedContext(subagent.key.name, context, SUBAGENT_MANIFEST_FILENAME)];
    });
    const namedMcpServers = mcpServers.flatMap((mcpServer) => {
      const context = installedMcpServerToContext(args, mcpServer);
      return context === undefined
        ? []
        : [namedContext(mcpServer.key.name, context, MCP_SERVER_MANIFEST_FILENAME)];
    });
    const namedHooks = hooks.flatMap((hook) => {
      const context = installedHookToContext(args, hook);
      return context === undefined
        ? []
        : [namedContext(hook.key.name, context, HOOK_MANIFEST_FILENAME)];
    });
    const namedRules = rules.flatMap((rule) => {
      const context = installedRuleToContext(args, rule);
      return context === undefined
        ? []
        : [namedContext(rule.key.name, context, RULE_MANIFEST_FILENAME)];
    });
    const namedKnowledge = knowledge.flatMap((bundle) => {
      const context = installedKnowledgeToContext(args, bundle);
      return context === undefined
        ? []
        : [namedContext(bundle.key.name, context, KNOWLEDGE_MANIFEST_FILENAME)];
    });

    const [
      skillsWithJson,
      installedPacksWithJson,
      subagentsWithJson,
      mcpServersWithJson,
      hooksWithJson,
      rulesWithJson,
      knowledgeWithJson,
    ] = yield* Effect.all(
      [
        populateSkillManifestJson(namedSkills),
        populatePackManifestJson(installedPacks),
        populateSubagentManifestJson(namedSubagents),
        populateMcpServerManifestJson(namedMcpServers),
        populateHookManifestJson(namedHooks),
        populateRuleManifestJson(namedRules),
        populateKnowledgeManifestJson(namedKnowledge, args.inspectKnowledge),
      ],
      { concurrency: "unbounded" },
    );

    return {
      view: {
        installedSkills: skillsWithJson.map((entry) => entry.info),
        installedPacks: installedPacksWithJson.map((entry) => entry.info),
        subagentContexts: subagentsWithJson.map((entry) => entry.context),
        mcpServerContexts: mcpServersWithJson.map((entry) => entry.context),
        hookContexts: hooksWithJson.map((entry) => entry.context),
        ruleContexts: rulesWithJson.map((entry) => entry.context),
        knowledgeContexts: knowledgeWithJson.map((entry) => entry.context),
      },
      installedManifests: [
        ...skillsWithJson.map((entry): InstalledExtensionManifest => ({
          extensionType: "skill",
          name: entry.name,
          manifestPath: entry.manifestPath,
          manifestJson: entry.info.skillJson,
        })),
        ...toManifests("subagent", subagentsWithJson, (c) => c.subject.subagentJson),
        ...toManifests("mcp-server", mcpServersWithJson, (c) => c.subject.mcpServerJson),
        ...toManifests("hook", hooksWithJson, (c) => c.subject.hookJson),
        ...toManifests("rule", rulesWithJson, (c) => c.subject.ruleJson),
        ...toManifests("knowledge", knowledgeWithJson, (c) => c.subject.knowledgeJson),
      ],
      packDependencyReachability: buildPackDependencyReachability({
        packs: installedPacksWithJson.flatMap(toPackDependencyDeclaration),
        members: [
          ...skills.flatMap((entry) => memberObservation("skill", entry.resolved)),
          ...subagents.flatMap((entry) => memberObservation("subagent", entry.resolved)),
          ...mcpServers.flatMap((entry) => memberObservation("mcp-server", entry.resolved)),
          ...hooks.flatMap((entry) => memberObservation("hook", entry.resolved)),
          ...rules.flatMap((entry) => memberObservation("rule", entry.resolved)),
          ...knowledge.flatMap((entry) => memberObservation("knowledge", entry.resolved)),
        ],
      }),
    };
  });

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const memberObservation = (
  extensionType: Exclude<ExtensionType, "pack">,
  resolved: Option.Option<{ readonly lockEntry: unknown }>,
): ReadonlyArray<PackDependencyMemberObservation> => {
  if (Option.isNone(resolved) || !isRecord(resolved.value.lockEntry)) return [];
  const entry = resolved.value.lockEntry;
  const authority = entry["type"];
  const owner = entry["owner"];
  const name = entry["name"];
  const version = authority === "workspace" ? entry["version"] : entry["resolvedVersion"];
  if (
    (authority !== "workspace" && authority !== "registry") ||
    typeof owner !== "string" ||
    typeof name !== "string" ||
    typeof version !== "string"
  ) {
    return [];
  }
  return [
    {
      fqn: `${owner}/${toExtensionTypePlural(extensionType)}/${name}`,
      version,
      authority,
    },
  ];
};

const installedPackAuthority = (installed: InstalledPack): PackDependencyAuthority => {
  if (Option.isSome(installed.resolved)) {
    return "registry";
  }
  if (installed.installationOrigin._tag !== "direct") return "registry";
  const declared = installed.installationOrigin.declared.entry;
  const source = typeof declared === "string" ? declared : declared.source;
  return source === "workspace" ? "workspace" : "registry";
};

const toPackDependencyDeclaration = (entry: NamedPack) => {
  const decoded = Schema.decodeUnknownResult(PackManifestSchema)(entry.info.packJson);
  if (Result.isFailure(decoded)) return [];
  const manifest = decoded.success;
  return [
    {
      packFqn: `${manifest.owner}/packs/${manifest.name}`,
      packAuthority: installedPackAuthority(entry.installed),
      manifestPath: joinManifestPath(entry.info.displayRoot, PACK_MANIFEST_FILENAME),
      dependencies: manifest.dependencies,
    },
  ];
};

const namedContext = <C extends { readonly displayRoot: string }>(
  name: string,
  context: C,
  manifestFilename: string,
): NamedContext<C> => ({
  name,
  manifestPath: joinManifestPath(context.displayRoot, manifestFilename),
  context,
});

const toManifests = <C>(
  extensionType: InstalledExtensionManifest["extensionType"],
  entries: ReadonlyArray<NamedContext<C>>,
  manifestJson: (context: C) => unknown,
): ReadonlyArray<InstalledExtensionManifest> =>
  entries.map((entry) => ({
    extensionType,
    name: entry.name,
    manifestPath: entry.manifestPath,
    manifestJson: manifestJson(entry.context),
  }));

const populateSkillManifestJson = (
  namedSkills: ReadonlyArray<NamedSkill>,
): Effect.Effect<ReadonlyArray<NamedSkill>> =>
  Effect.forEach(
    namedSkills,
    (entry) =>
      Effect.gen(function* () {
        if (!entry.info.isNative) {
          return entry;
        }
        const skillJson = yield* readManifestJson(entry.info.packageFiles, SKILL_MANIFEST_FILENAME);
        return { ...entry, info: { ...entry.info, skillJson } };
      }),
    { concurrency: "unbounded" },
  );

const populateSubagentManifestJson = (
  entries: ReadonlyArray<NamedContext<SubagentRuleContext>>,
): Effect.Effect<ReadonlyArray<NamedContext<SubagentRuleContext>>> =>
  Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const subagentJson = yield* readManifestJson(
          entry.context.files,
          SUBAGENT_MANIFEST_FILENAME,
        );
        return { ...entry, context: { ...entry.context, subject: { subagentJson } } };
      }),
    { concurrency: "unbounded" },
  );

const populateMcpServerManifestJson = (
  entries: ReadonlyArray<NamedContext<McpServerRuleContext>>,
): Effect.Effect<ReadonlyArray<NamedContext<McpServerRuleContext>>> =>
  Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const mcpServerJson = yield* readManifestJson(
          entry.context.files,
          MCP_SERVER_MANIFEST_FILENAME,
        );
        return { ...entry, context: { ...entry.context, subject: { mcpServerJson } } };
      }),
    { concurrency: "unbounded" },
  );

const populateHookManifestJson = (
  entries: ReadonlyArray<NamedContext<HookRuleContext>>,
): Effect.Effect<ReadonlyArray<NamedContext<HookRuleContext>>> =>
  Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const hookJson = yield* readManifestJson(entry.context.files, HOOK_MANIFEST_FILENAME);
        return { ...entry, context: { ...entry.context, subject: { hookJson } } };
      }),
    { concurrency: "unbounded" },
  );

const populateRuleManifestJson = (
  entries: ReadonlyArray<NamedContext<RuleRuleContext>>,
): Effect.Effect<ReadonlyArray<NamedContext<RuleRuleContext>>> =>
  Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const ruleJson = yield* readManifestJson(entry.context.files, RULE_MANIFEST_FILENAME);
        return { ...entry, context: { ...entry.context, subject: { ruleJson } } };
      }),
    { concurrency: "unbounded" },
  );

const populateKnowledgeManifestJson = (
  entries: ReadonlyArray<NamedContext<KnowledgeRuleContext>>,
  inspectKnowledge: (
    packageRoot: string,
  ) => Effect.Effect<
    { readonly inspection: KnowledgeInspection },
    unknown,
    FileSystem.FileSystem | Path.Path
  >,
): Effect.Effect<
  ReadonlyArray<NamedContext<KnowledgeRuleContext>>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const knowledgeJson = yield* readManifestJson(
          entry.context.files,
          KNOWLEDGE_MANIFEST_FILENAME,
        );
        const inspection =
          entry.context.packageRoot === undefined
            ? undefined
            : yield* inspectKnowledge(entry.context.packageRoot).pipe(
                Effect.map((result) => result.inspection),
                Effect.catch(() => Effect.succeed(undefined)),
              );
        const subject = {
          knowledgeJson,
          ...(inspection === undefined ? {} : { inspection }),
        };
        return {
          ...entry,
          context: { ...entry.context, subject },
        };
      }),
    { concurrency: "unbounded" },
  );

const populatePackManifestJson = (
  installedPacks: ReadonlyArray<NamedPack>,
): Effect.Effect<ReadonlyArray<NamedPack>> =>
  Effect.forEach(
    installedPacks,
    (entry) =>
      Effect.gen(function* () {
        const packJson = yield* readManifestJson(entry.info.files, PACK_MANIFEST_FILENAME);
        return { ...entry, info: { ...entry.info, packJson } };
      }),
    { concurrency: "unbounded" },
  );

/**
 * `InstalledSkillInfo` plus the workspace-relative root of the skill's
 * *package* (the directory holding `skill.json`). `InstalledSkillInfo.displayRoot`
 * points at the *content* root, which for native skills is the `src/`
 * sub-directory — so it cannot locate the manifest on its own.
 */
interface BuiltSkillInfo {
  readonly info: InstalledSkillInfo;
  readonly packageDisplayRoot: string;
}

const installedSkillToInfo = (
  args: BuildLintWorkspaceViewArgs,
  skill: InstalledSkill,
): BuiltSkillInfo | undefined => {
  const actual = chooseSkillActual(skill.actual);
  if (actual !== undefined) {
    const files = makePlatformSkillFileAccessor(args.platform, actual.contentRoot);
    const packageRoot = actual.packageRoot ?? actual.contentRoot;
    return {
      info: {
        isNative: isNativeSkill(skill, actual),
        skillJson: undefined,
        expectedName: skill.key.name,
        displayRoot: relativeDisplayRoot(args, actual.contentRoot),
        files,
        packageFiles: makePlatformSkillFileAccessor(args.platform, packageRoot),
      },
      packageDisplayRoot: relativeDisplayRoot(args, packageRoot),
    };
  }

  const resolved = skill.resolved;
  if (Option.isSome(resolved)) {
    const info = buildAcquiredInstalledSkillInfo({
      platform: args.platform,
      workspaceRoot: args.workspaceRoot,
      scope: args.scope,
      lockEntry: resolved.value.lockEntry,
      name: skill.key.name,
    });
    return {
      info,
      packageDisplayRoot: acquiredPackageDisplayRoot(
        args.scope,
        resolved.value.lockEntry,
        "skills",
        skill.key.name,
      ),
    };
  }

  if (skill.installationOrigin._tag === "direct") {
    const parsed = parseRegistrySourceRef(skill.installationOrigin.declared.entry.source);
    if (parsed !== undefined && parsed.type === "skills") {
      return nativeSkillInfo(args, "agentxm", parsed.owner, skill.key.name);
    }
  }

  return undefined;
};

const nativeSkillInfo = (
  args: BuildLintWorkspaceViewArgs,
  sourceName: string,
  owner: string,
  name: string,
): BuiltSkillInfo => ({
  info: buildNativeInstalledSkillInfo({
    platform: args.platform,
    workspaceRoot: args.workspaceRoot,
    scope: args.scope,
    sourceName,
    owner,
    name,
    skillJson: undefined,
  }),
  packageDisplayRoot: `${canonicalDisplayRoot(args.scope)}/${sourceName}/${owner}/skills/${name}`,
});

const installedPackToInfo = (
  args: BuildLintWorkspaceViewArgs,
  pack: InstalledPack,
): InstalledPackInfo | undefined => {
  const actual = choosePackActual(pack.actual);
  if (actual !== undefined) {
    return {
      packJson: undefined,
      displayRoot: relativeDisplayRoot(args, actual.contentRoot),
      files: makePlatformPackFileAccessor(args.platform, actual.contentRoot),
    };
  }

  const resolved = pack.resolved;
  if (Option.isSome(resolved) && resolved.value.lockEntry.type === "registry") {
    return buildInstalledPackInfo({
      platform: args.platform,
      workspaceRoot: args.workspaceRoot,
      scope: args.scope,
      sourceName: resolved.value.lockEntry.sourceName,
      owner: resolved.value.lockEntry.owner,
      name: pack.key.name,
      packJson: undefined,
    });
  }

  if (pack.installationOrigin._tag === "direct") {
    const parsed = parseRegistrySourceRef(pack.installationOrigin.declared.entry.source);
    if (parsed !== undefined && parsed.type === "packs") {
      return buildInstalledPackInfo({
        platform: args.platform,
        workspaceRoot: args.workspaceRoot,
        scope: args.scope,
        sourceName: "agentxm",
        owner: parsed.owner,
        name: pack.key.name,
        packJson: undefined,
      });
    }
  }

  return undefined;
};

const installedSubagentToContext = (
  args: BuildLintWorkspaceViewArgs,
  subagent: InstalledSubagent,
): SubagentRuleContext | undefined => {
  const root = subagentPackageRoot(args, subagent);
  if (root === undefined) {
    return undefined;
  }
  return {
    subject: { subagentJson: undefined },
    files: makePlatformPackFileAccessor(args.platform, root),
    displayRoot: relativeDisplayRoot(args, root),
  };
};

const installedMcpServerToContext = (
  args: BuildLintWorkspaceViewArgs,
  mcpServer: InstalledMcpServer,
): McpServerRuleContext | undefined => {
  const root = mcpServerPackageRoot(args, mcpServer);
  if (root === undefined) {
    return undefined;
  }
  return {
    subject: { mcpServerJson: undefined },
    files: makePlatformPackFileAccessor(args.platform, root),
    displayRoot: relativeDisplayRoot(args, root),
  };
};

const installedHookToContext = (
  args: BuildLintWorkspaceViewArgs,
  hook: InstalledHook,
): HookRuleContext | undefined => {
  const root = canonicalPackageRoot(args, {
    name: hook.key.name,
    plural: "hooks",
    actual: hook.actual,
    resolved: hook.resolved,
    installationOrigin: hook.installationOrigin,
  });
  if (root === undefined) {
    return undefined;
  }
  return {
    subject: { hookJson: undefined },
    files: makePlatformPackFileAccessor(args.platform, root),
    displayRoot: relativeDisplayRoot(args, root),
  };
};

const installedRuleToContext = (
  args: BuildLintWorkspaceViewArgs,
  rule: InstalledRule,
): RuleRuleContext | undefined => {
  const root = canonicalPackageRoot(args, {
    name: rule.key.name,
    plural: "rules",
    actual: rule.actual,
    resolved: rule.resolved,
    installationOrigin: rule.installationOrigin,
  });
  if (root === undefined) {
    return undefined;
  }
  return {
    subject: { ruleJson: undefined },
    files: makePlatformPackFileAccessor(args.platform, root),
    displayRoot: relativeDisplayRoot(args, root),
  };
};

const installedKnowledgeToContext = (
  args: BuildLintWorkspaceViewArgs,
  bundle: InstalledKnowledgeBundle,
): KnowledgeRuleContext | undefined => {
  const root = canonicalPackageRoot(args, {
    name: bundle.key.name,
    plural: "knowledge",
    actual: bundle.actual,
    resolved: bundle.resolved,
    installationOrigin: bundle.installationOrigin,
  });
  if (root === undefined) {
    return undefined;
  }
  return {
    subject: { knowledgeJson: undefined },
    files: makePlatformPackFileAccessor(args.platform, root),
    displayRoot: relativeDisplayRoot(args, root),
    packageRoot: root,
  };
};

/**
 * Locate an installed package's root the same way for every family whose
 * canonical layout is source-qualified: prefer a scanned `packageRoot`, then
 * reconstruct the exact path from the accepted lock entry.
 *
 * Returns `undefined` when neither applies — the extension is
 * configured but not on disk in a location lint can read, which is
 * `workspace/configured-but-not-installed`'s finding to make, not a per-type
 * manifest rule's.
 */
const canonicalPackageRoot = (
  args: BuildLintWorkspaceViewArgs,
  subject: {
    readonly name: string;
    readonly plural: ExtensionTypePlural;
    readonly actual: ReadonlyArray<{ readonly packageRoot: string | null }>;
    readonly resolved: Option.Option<{ readonly lockEntry: ExtensionPathLockEntry }>;
    readonly installationOrigin: { readonly _tag: string };
  },
): string | undefined => {
  const scanned = subject.actual.find((entry) => entry.packageRoot !== null);
  if (scanned?.packageRoot !== undefined && scanned.packageRoot !== null) {
    return scanned.packageRoot;
  }

  const resolved = subject.resolved;
  if (Option.isSome(resolved)) {
    return args.platform.path.resolve(
      args.workspaceRoot,
      acquiredPackageDisplayRoot(
        args.scope,
        resolved.value.lockEntry,
        subject.plural,
        subject.name,
      ),
    );
  }

  return undefined;
};

const chooseSkillActual = (actual: ReadonlyArray<ActualSkill>): ActualSkill | undefined =>
  actual.find((entry) => entry.origin._tag !== "agent-skill-dir") ?? actual[0];

const choosePackActual = (actual: ReadonlyArray<ActualPack>): ActualPack | undefined => actual[0];

const chooseSubagentActual = (actual: ReadonlyArray<ActualSubagent>): ActualSubagent | undefined =>
  actual.find((entry) => entry.packageRoot !== null);

const chooseMcpServerActual = (
  actual: ReadonlyArray<ActualMcpServer>,
): ActualMcpServer | undefined => actual.find((entry) => entry.contentRoot !== null);

const subagentPackageRoot = (
  args: BuildLintWorkspaceViewArgs,
  subagent: InstalledSubagent,
): string | undefined => {
  const actual = chooseSubagentActual(subagent.actual);
  if (actual?.packageRoot !== undefined && actual.packageRoot !== null) {
    return actual.packageRoot;
  }

  const resolved = subagent.resolved;
  if (Option.isSome(resolved)) {
    return args.platform.path.resolve(
      args.workspaceRoot,
      acquiredPackageDisplayRoot(
        args.scope,
        resolved.value.lockEntry,
        "subagents",
        subagent.key.name,
      ),
    );
  }

  if (subagent.installationOrigin._tag === "direct") {
    const parsed = parseRegistrySourceRef(subagent.installationOrigin.declared.entry.source);
    if (parsed !== undefined && parsed.type === "subagents") {
      return args.platform.path.resolve(
        args.workspaceRoot,
        `${canonicalDisplayRoot(args.scope)}/agentxm/${parsed.owner}/subagents/${subagent.key.name}`,
      );
    }
  }

  return undefined;
};

const mcpServerPackageRoot = (
  args: BuildLintWorkspaceViewArgs,
  mcpServer: InstalledMcpServer,
): string | undefined => {
  const actual = chooseMcpServerActual(mcpServer.actual);
  if (actual?.contentRoot !== undefined && actual.contentRoot !== null) {
    return actual.contentRoot;
  }

  const resolved = mcpServer.resolved;
  if (Option.isSome(resolved)) {
    return args.platform.path.resolve(
      args.workspaceRoot,
      acquiredPackageDisplayRoot(args.scope, resolved.value.lockEntry, "mcps", mcpServer.key.name),
    );
  }

  if (mcpServer.installationOrigin._tag === "direct") {
    const source = mcpServer.installationOrigin.declared.entry.source;
    if (source === undefined) return undefined;
    const parsed = parseRegistrySourceRef(source);
    if (parsed !== undefined && parsed.type === "mcps") {
      return args.platform.path.resolve(
        args.workspaceRoot,
        `${canonicalDisplayRoot(args.scope)}/agentxm/${parsed.owner}/mcps/${mcpServer.key.name}`,
      );
    }
  }

  return undefined;
};

const isNativeSkill = (skill: InstalledSkill, actual: ActualSkill): boolean => {
  const resolved = skill.resolved;
  if (Option.isSome(resolved)) {
    return resolved.value.lockEntry.packageFormat === "agentxm";
  }
  if (actual.origin._tag === "canonical-axm-skill") {
    return true;
  }
  if (skill.installationOrigin._tag !== "direct") {
    return false;
  }
  const parsed = parseRegistrySourceRef(skill.installationOrigin.declared.entry.source);
  return parsed !== undefined && parsed.type === "skills";
};

const relativeDisplayRoot = (
  args: Pick<BuildLintWorkspaceViewArgs, "platform" | "workspaceRoot">,
  absoluteRoot: string,
): string => args.platform.path.relative(args.workspaceRoot, absoluteRoot);

const acquiredPackageDisplayRoot = (
  scope: "project" | "user",
  entry: ExtensionPathLockEntry,
  type: ExtensionTypePlural,
  name: string,
): string =>
  acquiredExtensionDisplayPathFromLockEntry(canonicalDisplayRoot(scope), entry, type, name);

// -----------------------------------------------------------------------------
// Provenance → displayRoot helpers
// -----------------------------------------------------------------------------

/**
 * Compute the `displayRoot` for a registry-installed native skill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const registryNativeSkillDisplayRoot = (
  scope: "project" | "user",
  sourceName: string,
  owner: string,
  name: string,
): string => `${canonicalDisplayRoot(scope)}/${sourceName}/${owner}/skills/${name}/src`;

/**
 * Compute the content `displayRoot` for a source-qualified acquired skill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const acquiredSkillDisplayRoot = (
  scope: "project" | "user",
  entry: SkillLockEntry,
  name: string,
): string => {
  const packageRoot = acquiredPackageDisplayRoot(scope, entry, "skills", name);
  return entry.packageFormat === "agent-skill" ? packageRoot : `${packageRoot}/src`;
};

/**
 * Compute the `displayRoot` for a registry-installed pack.
 *
 * **No `src/` segment** — matches the on-disk layout at
 * `packages/workspace-state/src/workspace/pack-paths.ts#computePackPathsForLayout`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const registryPackDisplayRoot = (
  scope: "project" | "user",
  sourceName: string,
  owner: string,
  name: string,
): string => `${canonicalDisplayRoot(scope)}/${sourceName}/${owner}/packs/${name}`;

// -----------------------------------------------------------------------------
// Build-a-skill-info helpers (thin wrappers over the skill / pack accessors).
// -----------------------------------------------------------------------------

/**
 * Options for building an `InstalledSkillInfo` for a registry-installed
 * native skill. `owner` and `name` pin the on-disk layout.
 */
export interface BuildInstalledSkillInfoNativeArgs {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly sourceName: string;
  readonly owner: string;
  readonly name: string;
  readonly skillJson: unknown;
}

/**
 * Build an `InstalledSkillInfo` rooted at `agent_extensions/<owner>/skills/<name>/src/`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildNativeInstalledSkillInfo = (
  args: BuildInstalledSkillInfoNativeArgs,
): InstalledSkillInfo => {
  const packageRoot = args.platform.path.resolve(
    args.workspaceRoot,
    `${canonicalDisplayRoot(args.scope)}/${args.sourceName}/${args.owner}/skills/${args.name}`,
  );
  const contentRoot = args.platform.path.resolve(packageRoot, "src");
  return {
    isNative: true,
    skillJson: args.skillJson,
    expectedName: args.name,
    displayRoot: registryNativeSkillDisplayRoot(args.scope, args.sourceName, args.owner, args.name),
    files: makePlatformSkillFileAccessor(args.platform, contentRoot),
    packageFiles: makePlatformSkillFileAccessor(args.platform, packageRoot),
  };
};

/**
 * Options for building an `InstalledSkillInfo` from an accepted acquired skill.
 */
export interface BuildAcquiredInstalledSkillInfoArgs {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly lockEntry: SkillLockEntry;
  readonly name: string;
}

/**
 * Build an `InstalledSkillInfo` rooted at its exact accepted source-qualified path.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildAcquiredInstalledSkillInfo = (
  args: BuildAcquiredInstalledSkillInfoArgs,
): InstalledSkillInfo => {
  const packageRoot = args.platform.path.resolve(
    args.workspaceRoot,
    acquiredPackageDisplayRoot(args.scope, args.lockEntry, "skills", args.name),
  );
  const contentRoot =
    args.lockEntry.packageFormat === "agent-skill"
      ? packageRoot
      : args.platform.path.resolve(packageRoot, "src");
  return {
    isNative: args.lockEntry.packageFormat === "agentxm",
    skillJson: undefined,
    expectedName: args.name,
    displayRoot: acquiredSkillDisplayRoot(args.scope, args.lockEntry, args.name),
    files: makePlatformSkillFileAccessor(args.platform, contentRoot),
    packageFiles: makePlatformSkillFileAccessor(args.platform, packageRoot),
  };
};

/**
 * Options for building an `InstalledPackInfo` for a registry-installed pack.
 */
export interface BuildInstalledPackInfoArgs {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspaceRoot: string;
  readonly scope: "project" | "user";
  readonly sourceName: string;
  readonly owner: string;
  readonly name: string;
  readonly packJson: unknown;
}

/**
 * Build an `InstalledPackInfo` rooted at `agent_extensions/<owner>/packs/<name>/`.
 *
 * **No `src/` segment** — matches the on-disk pack layout.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildInstalledPackInfo = (args: BuildInstalledPackInfoArgs): InstalledPackInfo => {
  const absoluteRoot = args.platform.path.resolve(
    args.workspaceRoot,
    `${canonicalDisplayRoot(args.scope)}/${args.sourceName}/${args.owner}/packs/${args.name}`,
  );
  return {
    packJson: args.packJson,
    displayRoot: registryPackDisplayRoot(args.scope, args.sourceName, args.owner, args.name),
    files: makePlatformPackFileAccessor(args.platform, absoluteRoot),
  };
};
