/**
 * `LintWorkspace` — single helper that produces both the per-rule
 * `WorkspaceRuleContext` and the flat `LintWorkspaceView` projection a lint
 * run needs, sharing one `WorkspaceReadModelLive` setup.
 *
 * `LintWorkspaceView` exposes `installedSkills: InstalledSkillInfo[]` and
 * `installedPacks: InstalledPackInfo[]` with per-provenance `displayRoot`s:
 *
 *   Registry-installed native skill: `.axm/extensions/<@owner>/skills/<name>/src/`
 *   External skill:                  `.axm/extensions/external/skills/<name>/`
 *   Registry pack:                   `.axm/extensions/<@owner>/packs/<name>/`
 *                                    (NO `src/` — matches the on-disk layout.)
 *
 * The companion `WorkspaceRuleContext` is scoped to project or user.
 * User-scope root resolution for v1 is `$AXM_USER_HOME/.axm/` when set,
 * otherwise `$HOME/.axm/`; a follow-up owns the broader XDG story.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { makeAbsolutePath } from "../../../utils/path-types.js";
import {
  getInstructionsGitignoreStatus,
  getInstructionsStatus,
  resolveInstructionsConfig,
} from "../../../agents/instructions.js";
import { AgentRootResolverLive } from "../../../workspace/read-model/agent-root-resolver.js";
import {
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
  type WorkspaceReadModel,
} from "../../../workspace/read-model/service.js";
import type { WorkspaceRootEscape } from "../../../workspace/read-model/errors.js";
import type {
  ActualCommand,
  ActualFilesPackage,
  ActualMcpServer,
  ActualPack,
  ActualSkill,
  ActualSubagent,
  InstalledCommand,
  InstalledFilesPackage,
  InstalledMcpServer,
  InstalledPack,
  InstalledSkill,
  InstalledSubagent,
} from "../../../workspace/read-model/extensions/index.js";
import type {
  CommandRuleContext,
  FilesRuleContext,
  McpServerRuleContext,
  SubagentRuleContext,
  WorkspaceInstructionAccessor,
  WorkspaceRuleContext,
} from "../../context.js";
import type { InstalledSkillInfo } from "../skill-accessor/contexts.js";
import type { InstalledPackInfo } from "../pack-accessor/contexts.js";
import { makePlatformSkillFileAccessor } from "../skill-accessor/platform.js";
import { makePlatformPackFileAccessor } from "../pack-accessor/platform.js";
import { makePlatformFilesAccessor } from "../files-accessor/platform.js";
import { parseRegistrySource } from "../workspace/helpers/registry-source.js";
import { COMMAND_MANIFEST_FILENAME } from "../../../commands/manifest-schema.js";
import { FILES_MANIFEST_FILENAME } from "../../../files/manifest-schema.js";
import { MCP_SERVER_MANIFEST_FILENAME } from "../../../mcps/manifest-schema.js";
import { PACK_MANIFEST_FILENAME } from "../../../packs/manifest-schema.js";
import { MANIFEST_FILENAME as SKILL_MANIFEST_FILENAME } from "../../../skills/manifest-schema.js";
import { MANIFEST_FILENAME as SUBAGENT_MANIFEST_FILENAME } from "../../../subagents/manifest-schema.js";
import { readManifestJson } from "./manifest-json.js";

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
  readonly commandContexts: ReadonlyArray<CommandRuleContext>;
  readonly subagentContexts: ReadonlyArray<SubagentRuleContext>;
  readonly mcpServerContexts: ReadonlyArray<McpServerRuleContext>;
  readonly fileContexts: ReadonlyArray<FilesRuleContext>;
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
  /**
   * Optional `displayRoot` override for the `WorkspaceRuleContext`. Defaults
   * to `""` (accessor-relative paths render under the workspace root).
   */
  readonly displayRoot?: string;
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
): Effect.Effect<LintWorkspace, WorkspaceRootEscape> => {
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
        ? args.platform.path.join(args.userHome, ".axm")
        : args.platform.path.join(args.workspaceRoot, ".axm");
    const rule: WorkspaceRuleContext = {
      subject: { root: args.workspaceRoot, scope: args.scope },
      workspace: readModel,
      axmDirExists: args.platform.fs.exists(axmDir).pipe(Effect.catch(() => Effect.succeed(false))),
      instructions: makeInstructionAccessor({
        platform: args.platform,
        workspaceRoot: args.workspaceRoot,
        readModel,
      }),
      displayRoot: args.displayRoot ?? "",
    };
    const view = yield* buildLintWorkspaceView({
      platform: args.platform,
      workspaceRoot: args.workspaceRoot,
      readModel,
      scope: args.scope,
    });
    return { rule, view };
  }).pipe(Effect.provide(env));
};

const makeInstructionAccessor = (args: {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspaceRoot: string;
  readonly readModel: WorkspaceReadModel;
}): WorkspaceInstructionAccessor => {
  const platformLayer = Layer.mergeAll(
    Layer.succeed(FileSystem.FileSystem, args.platform.fs),
    Layer.succeed(Path.Path, args.platform.path),
  );
  const load = Effect.gen(function* () {
    const settings = yield* args.readModel.state.settings.pipe(
      Effect.catch(() => Effect.succeed(Option.none())),
    );
    if (Option.isNone(settings)) {
      return Option.none<{
        readonly configuredAgents: ReadonlyArray<string>;
        readonly config: ReturnType<typeof resolveInstructionsConfig>;
      }>();
    }
    const rawConfig = Option.fromUndefinedOr(settings.value.rulesConfig?.instructions);
    if (Option.isNone(rawConfig) || rawConfig.value === false) {
      return Option.none<{
        readonly configuredAgents: ReadonlyArray<string>;
        readonly config: ReturnType<typeof resolveInstructionsConfig>;
      }>();
    }
    return Option.some({
      configuredAgents: settings.value.agents ?? [],
      config: resolveInstructionsConfig(rawConfig.value),
    });
  });
  return {
    status: Effect.gen(function* () {
      const loaded = yield* load;
      if (Option.isNone(loaded)) return Option.none();
      const status = yield* getInstructionsStatus({
        workspaceRoot: args.workspaceRoot,
        configuredAgents: loaded.value.configuredAgents,
        config: loaded.value.config,
      }).pipe(Effect.provide(platformLayer));
      return Option.some(status);
    }),
    gitignore: Effect.gen(function* () {
      const loaded = yield* load;
      if (Option.isNone(loaded)) return Option.none();
      const status = yield* getInstructionsGitignoreStatus({
        workspaceRoot: args.workspaceRoot,
        configuredAgents: loaded.value.configuredAgents,
        config: loaded.value.config,
      }).pipe(Effect.provide(platformLayer));
      return Option.some(status);
    }),
  };
};

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
}

const buildLintWorkspaceView = (
  args: BuildLintWorkspaceViewArgs,
): Effect.Effect<LintWorkspaceView> =>
  Effect.gen(function* () {
    const [skills, packs, commands, subagents, mcpServers, filesPackages] = yield* Effect.all(
      [
        args.readModel.skills.installed,
        args.readModel.packs.installed,
        args.readModel.commands.installed,
        args.readModel.subagents.installed,
        args.readModel.mcpServers.installed,
        args.readModel.files.installed,
      ],
      { concurrency: "unbounded" },
    );
    const installedSkills = skills
      .filter((skill) => skill.actual.length > 0 || Option.isSome(skill.resolved))
      .map((skill) => installedSkillToInfo(args, skill));
    const installedPacks = packs.flatMap((pack) => {
      const info = installedPackToInfo(args, pack);
      return info === undefined ? [] : [info];
    });
    const commandContexts = commands.flatMap((command) => {
      const context = installedCommandToContext(args, command);
      return context === undefined ? [] : [context];
    });
    const subagentContexts = subagents.flatMap((subagent) => {
      const context = installedSubagentToContext(args, subagent);
      return context === undefined ? [] : [context];
    });
    const mcpServerContexts = mcpServers.flatMap((mcpServer) => {
      const context = installedMcpServerToContext(args, mcpServer);
      return context === undefined ? [] : [context];
    });
    const fileContexts = filesPackages.flatMap((filesPackage) => {
      const context = installedFilesPackageToContext(args, filesPackage);
      return context === undefined ? [] : [context];
    });

    const [
      installedSkillsWithJson,
      installedPacksWithJson,
      commandContextsWithJson,
      subagentContextsWithJson,
      mcpServerContextsWithJson,
      fileContextsWithJson,
    ] = yield* Effect.all(
      [
        populateSkillManifestJson(installedSkills),
        populatePackManifestJson(installedPacks),
        populateCommandManifestJson(commandContexts),
        populateSubagentManifestJson(subagentContexts),
        populateMcpServerManifestJson(mcpServerContexts),
        populateFilesManifestJson(fileContexts),
      ],
      { concurrency: "unbounded" },
    );

    return {
      installedSkills: installedSkillsWithJson,
      installedPacks: installedPacksWithJson,
      commandContexts: commandContextsWithJson,
      subagentContexts: subagentContextsWithJson,
      mcpServerContexts: mcpServerContextsWithJson,
      fileContexts: fileContextsWithJson,
    };
  });

const populateSkillManifestJson = (
  installedSkills: ReadonlyArray<InstalledSkillInfo>,
): Effect.Effect<ReadonlyArray<InstalledSkillInfo>> =>
  Effect.forEach(
    installedSkills,
    (info) =>
      Effect.gen(function* () {
        if (!info.isNative) {
          return info;
        }
        const skillJson = yield* readManifestJson(info.packageFiles, SKILL_MANIFEST_FILENAME);
        return { ...info, skillJson };
      }),
    { concurrency: "unbounded" },
  );

const populatePackManifestJson = (
  installedPacks: ReadonlyArray<InstalledPackInfo>,
): Effect.Effect<ReadonlyArray<InstalledPackInfo>> =>
  Effect.forEach(
    installedPacks,
    (info) =>
      Effect.gen(function* () {
        const packJson = yield* readManifestJson(info.files, PACK_MANIFEST_FILENAME);
        return { ...info, packJson };
      }),
    { concurrency: "unbounded" },
  );

const populateCommandManifestJson = (
  commandContexts: ReadonlyArray<CommandRuleContext>,
): Effect.Effect<ReadonlyArray<CommandRuleContext>> =>
  Effect.forEach(
    commandContexts,
    (context) =>
      Effect.gen(function* () {
        const commandJson = yield* readManifestJson(context.files, COMMAND_MANIFEST_FILENAME);
        return { ...context, subject: { commandJson } };
      }),
    { concurrency: "unbounded" },
  );

const populateSubagentManifestJson = (
  subagentContexts: ReadonlyArray<SubagentRuleContext>,
): Effect.Effect<ReadonlyArray<SubagentRuleContext>> =>
  Effect.forEach(
    subagentContexts,
    (context) =>
      Effect.gen(function* () {
        const subagentJson = yield* readManifestJson(context.files, SUBAGENT_MANIFEST_FILENAME);
        return { ...context, subject: { subagentJson } };
      }),
    { concurrency: "unbounded" },
  );

const populateMcpServerManifestJson = (
  mcpServerContexts: ReadonlyArray<McpServerRuleContext>,
): Effect.Effect<ReadonlyArray<McpServerRuleContext>> =>
  Effect.forEach(
    mcpServerContexts,
    (context) =>
      Effect.gen(function* () {
        const mcpServerJson = yield* readManifestJson(context.files, MCP_SERVER_MANIFEST_FILENAME);
        return { ...context, subject: { mcpServerJson } };
      }),
    { concurrency: "unbounded" },
  );

const populateFilesManifestJson = (
  fileContexts: ReadonlyArray<FilesRuleContext>,
): Effect.Effect<ReadonlyArray<FilesRuleContext>> =>
  Effect.forEach(
    fileContexts,
    (context) =>
      Effect.gen(function* () {
        const filesJson = yield* readManifestJson(context.files, FILES_MANIFEST_FILENAME);
        return { ...context, subject: { filesJson } };
      }),
    { concurrency: "unbounded" },
  );

const installedSkillToInfo = (
  args: BuildLintWorkspaceViewArgs,
  skill: InstalledSkill,
): InstalledSkillInfo => {
  const actual = chooseSkillActual(skill.actual);
  if (actual !== undefined) {
    const files = makePlatformSkillFileAccessor(args.platform, actual.contentRoot);
    const packageRoot = actual.packageRoot ?? actual.contentRoot;
    return {
      isNative: isNativeSkill(skill, actual),
      skillJson: undefined,
      displayRoot: relativeDisplayRoot(args, actual.contentRoot),
      files,
      packageFiles: makePlatformSkillFileAccessor(args.platform, packageRoot),
    };
  }

  const resolved = skill.resolved;
  if (Option.isSome(resolved) && resolved.value.lockEntry.type === "registry") {
    return buildNativeInstalledSkillInfo({
      platform: args.platform,
      workspaceRoot: args.workspaceRoot,
      owner: resolved.value.lockEntry.owner,
      name: skill.key.name,
      skillJson: undefined,
    });
  }

  if (skill.installationOrigin._tag === "direct") {
    const parsed = parseRegistrySource(skill.installationOrigin.declared.entry.source);
    if (parsed !== undefined && parsed.type === "skills") {
      return buildNativeInstalledSkillInfo({
        platform: args.platform,
        workspaceRoot: args.workspaceRoot,
        owner: parsed.owner,
        name: skill.key.name,
        skillJson: undefined,
      });
    }
  }

  return buildExternalInstalledSkillInfo({
    platform: args.platform,
    workspaceRoot: args.workspaceRoot,
    name: skill.key.name,
  });
};

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
      owner: resolved.value.lockEntry.owner,
      name: pack.key.name,
      packJson: undefined,
    });
  }

  if (pack.installationOrigin._tag === "direct") {
    const parsed = parseRegistrySource(pack.installationOrigin.declared.entry.source);
    if (parsed !== undefined && parsed.type === "packs") {
      return buildInstalledPackInfo({
        platform: args.platform,
        workspaceRoot: args.workspaceRoot,
        owner: parsed.owner,
        name: pack.key.name,
        packJson: undefined,
      });
    }
  }

  return undefined;
};

const installedCommandToContext = (
  args: BuildLintWorkspaceViewArgs,
  command: InstalledCommand,
): CommandRuleContext | undefined => {
  const root = commandPackageRoot(args, command);
  if (root === undefined) {
    return undefined;
  }
  return {
    subject: { commandJson: undefined },
    files: makePlatformPackFileAccessor(args.platform, root),
    displayRoot: relativeDisplayRoot(args, root),
  };
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

const installedFilesPackageToContext = (
  args: BuildLintWorkspaceViewArgs,
  filesPackage: InstalledFilesPackage,
): FilesRuleContext | undefined => {
  const root = filesPackageRoot(args, filesPackage);
  if (root === undefined) {
    return undefined;
  }
  return {
    subject: { filesJson: undefined },
    files: makePlatformFilesAccessor(args.platform, root),
    displayRoot: relativeDisplayRoot(args, root),
  };
};

const chooseSkillActual = (actual: ReadonlyArray<ActualSkill>): ActualSkill | undefined =>
  actual.find((entry) => entry.origin._tag !== "agent-skill-dir") ?? actual[0];

const choosePackActual = (actual: ReadonlyArray<ActualPack>): ActualPack | undefined => actual[0];

const chooseCommandActual = (actual: ReadonlyArray<ActualCommand>): ActualCommand | undefined =>
  actual.find((entry) => entry.packageRoot !== null);

const chooseSubagentActual = (actual: ReadonlyArray<ActualSubagent>): ActualSubagent | undefined =>
  actual.find((entry) => entry.packageRoot !== null);

const chooseMcpServerActual = (
  actual: ReadonlyArray<ActualMcpServer>,
): ActualMcpServer | undefined => actual.find((entry) => entry.contentRoot !== null);

const chooseFilesActual = (
  actual: ReadonlyArray<ActualFilesPackage>,
): ActualFilesPackage | undefined => actual.find((entry) => entry.packageRoot !== null);

const commandPackageRoot = (
  args: BuildLintWorkspaceViewArgs,
  command: InstalledCommand,
): string | undefined => {
  const actual = chooseCommandActual(command.actual);
  if (actual?.packageRoot !== undefined && actual.packageRoot !== null) {
    return actual.packageRoot;
  }

  const resolved = command.resolved;
  if (Option.isSome(resolved) && resolved.value.lockEntry.type === "registry") {
    return args.platform.path.resolve(
      args.workspaceRoot,
      `.axm/extensions/${resolved.value.lockEntry.owner}/commands/${command.key.name}`,
    );
  }

  if (command.installationOrigin._tag === "direct") {
    const parsed = parseRegistrySource(command.installationOrigin.declared.entry.source);
    if (parsed !== undefined && parsed.type === "commands") {
      return args.platform.path.resolve(
        args.workspaceRoot,
        `.axm/extensions/${parsed.owner}/commands/${command.key.name}`,
      );
    }
  }

  return undefined;
};

const subagentPackageRoot = (
  args: BuildLintWorkspaceViewArgs,
  subagent: InstalledSubagent,
): string | undefined => {
  const actual = chooseSubagentActual(subagent.actual);
  if (actual?.packageRoot !== undefined && actual.packageRoot !== null) {
    return actual.packageRoot;
  }

  const resolved = subagent.resolved;
  if (Option.isSome(resolved) && resolved.value.lockEntry.type === "registry") {
    return args.platform.path.resolve(
      args.workspaceRoot,
      `.axm/extensions/${resolved.value.lockEntry.owner}/subagents/${subagent.key.name}`,
    );
  }

  if (subagent.installationOrigin._tag === "direct") {
    const parsed = parseRegistrySource(subagent.installationOrigin.declared.entry.source);
    if (parsed !== undefined && parsed.type === "subagents") {
      return args.platform.path.resolve(
        args.workspaceRoot,
        `.axm/extensions/${parsed.owner}/subagents/${subagent.key.name}`,
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
  if (Option.isSome(resolved) && resolved.value.lockEntry.type === "registry") {
    return args.platform.path.resolve(
      args.workspaceRoot,
      `.axm/extensions/${resolved.value.lockEntry.owner}/mcps/${mcpServer.key.name}`,
    );
  }

  if (mcpServer.installationOrigin._tag === "direct") {
    const parsed = parseRegistrySource(mcpServer.installationOrigin.declared.entry.source);
    if (parsed !== undefined && parsed.type === "mcps") {
      return args.platform.path.resolve(
        args.workspaceRoot,
        `.axm/extensions/${parsed.owner}/mcps/${mcpServer.key.name}`,
      );
    }
  }

  return undefined;
};

const filesPackageRoot = (
  args: BuildLintWorkspaceViewArgs,
  filesPackage: InstalledFilesPackage,
): string | undefined => {
  const actual = chooseFilesActual(filesPackage.actual);
  if (actual?.packageRoot !== undefined && actual.packageRoot !== null) {
    return actual.packageRoot;
  }

  return args.platform.path.resolve(
    args.workspaceRoot,
    `.axm/extensions/external/files/${filesPackage.key.name}`,
  );
};

const isNativeSkill = (skill: InstalledSkill, actual: ActualSkill): boolean => {
  const resolved = skill.resolved;
  if (Option.isSome(resolved)) {
    return resolved.value.lockEntry.type === "registry";
  }
  if (actual.origin._tag === "canonical-axm-skill") {
    return true;
  }
  if (skill.installationOrigin._tag !== "direct") {
    return false;
  }
  const parsed = parseRegistrySource(skill.installationOrigin.declared.entry.source);
  return parsed !== undefined && parsed.type === "skills";
};

const relativeDisplayRoot = (
  args: Pick<BuildLintWorkspaceViewArgs, "platform" | "workspaceRoot">,
  absoluteRoot: string,
): string => args.platform.path.relative(args.workspaceRoot, absoluteRoot);

// -----------------------------------------------------------------------------
// Provenance → displayRoot helpers
// -----------------------------------------------------------------------------

/**
 * Compute the `displayRoot` for a registry-installed native skill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const registryNativeSkillDisplayRoot = (owner: string, name: string): string =>
  `.axm/extensions/${owner}/skills/${name}/src`;

/**
 * Compute the `displayRoot` for an external (non-native) skill.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const externalSkillDisplayRoot = (name: string): string =>
  `.axm/extensions/external/skills/${name}`;

/**
 * Compute the `displayRoot` for a registry-installed pack.
 *
 * **No `src/` segment** — matches the on-disk layout at
 * `axm/packages/core/src/unstable/packs/paths.ts#computePackPaths`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const registryPackDisplayRoot = (owner: string, name: string): string =>
  `.axm/extensions/${owner}/packs/${name}`;

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
  readonly owner: string;
  readonly name: string;
  readonly skillJson: unknown;
}

/**
 * Build an `InstalledSkillInfo` rooted at `.axm/extensions/<owner>/skills/<name>/src/`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildNativeInstalledSkillInfo = (
  args: BuildInstalledSkillInfoNativeArgs,
): InstalledSkillInfo => {
  const packageRoot = args.platform.path.resolve(
    args.workspaceRoot,
    `.axm/extensions/${args.owner}/skills/${args.name}`,
  );
  const contentRoot = args.platform.path.resolve(packageRoot, "src");
  return {
    isNative: true,
    skillJson: args.skillJson,
    displayRoot: registryNativeSkillDisplayRoot(args.owner, args.name),
    files: makePlatformSkillFileAccessor(args.platform, contentRoot),
    packageFiles: makePlatformSkillFileAccessor(args.platform, packageRoot),
  };
};

/**
 * Options for building an `InstalledSkillInfo` for an external (non-native) skill.
 */
export interface BuildInstalledSkillInfoExternalArgs {
  readonly platform: {
    readonly fs: FileSystem.FileSystem;
    readonly path: Path.Path;
  };
  readonly workspaceRoot: string;
  readonly name: string;
}

/**
 * Build an `InstalledSkillInfo` rooted at `.axm/extensions/external/skills/<name>/`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildExternalInstalledSkillInfo = (
  args: BuildInstalledSkillInfoExternalArgs,
): InstalledSkillInfo => {
  const absoluteRoot = args.platform.path.resolve(
    args.workspaceRoot,
    `.axm/extensions/external/skills/${args.name}`,
  );
  const accessor = makePlatformSkillFileAccessor(args.platform, absoluteRoot);
  return {
    isNative: false,
    skillJson: undefined,
    displayRoot: externalSkillDisplayRoot(args.name),
    files: accessor,
    packageFiles: accessor,
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
  readonly owner: string;
  readonly name: string;
  readonly packJson: unknown;
}

/**
 * Build an `InstalledPackInfo` rooted at `.axm/extensions/<owner>/packs/<name>/`.
 *
 * **No `src/` segment** — matches the on-disk pack layout.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildInstalledPackInfo = (args: BuildInstalledPackInfoArgs): InstalledPackInfo => {
  const absoluteRoot = args.platform.path.resolve(
    args.workspaceRoot,
    `.axm/extensions/${args.owner}/packs/${args.name}`,
  );
  return {
    packJson: args.packJson,
    displayRoot: registryPackDisplayRoot(args.owner, args.name),
    files: makePlatformPackFileAccessor(args.platform, absoluteRoot),
  };
};
