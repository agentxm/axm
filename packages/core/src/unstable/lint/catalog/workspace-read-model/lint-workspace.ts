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
import type * as ServiceMap from "effect/Context";
import {
  WorkspaceReadModel,
  WorkspaceReadModelConfig,
  WorkspaceReadModelLive,
} from "../../../workspace/read-model/service.js";
import type { WorkspaceRootEscape } from "../../../workspace/read-model/errors.js";
import type {
  ActualPack,
  ActualSkill,
  InstalledPack,
  InstalledSkill,
} from "../../../workspace/read-model/extensions/index.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { InstalledSkillInfo } from "../skill-accessor/contexts.js";
import type { InstalledPackInfo } from "../pack-accessor/contexts.js";
import { makePlatformSkillFileAccessor } from "../skill-accessor/platform.js";
import { makePlatformPackFileAccessor } from "../pack-accessor/platform.js";
import { parseRegistrySource } from "../workspace/helpers/registry-source.js";

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
   * User home directory used to construct the user-scope side of
   * `WorkspaceReadModel`. Required because `WorkspaceReadModelLive` builds
   * both scopes eagerly even when only one is queried by the rule run.
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
 * in a single `WorkspaceReadModelLive` setup.
 *
 * `WorkspaceRootEscape` is surfaced in the error channel by the live layer
 * when `workspaceRoot` or `userHome` escape the filesystem root.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildLintWorkspace = (
  args: BuildLintWorkspaceArgs,
): Effect.Effect<LintWorkspace, WorkspaceRootEscape> => {
  const readModelLayer = WorkspaceReadModelLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, args.platform.fs),
        Layer.succeed(Path.Path, args.platform.path),
        Layer.succeed(WorkspaceReadModelConfig, {
          projectRoot: args.workspaceRoot,
          userHome: args.userHome,
          allowedRoot: "/",
        }),
      ),
    ),
  );
  return Effect.gen(function* () {
    const readModel = yield* WorkspaceReadModel;
    const axmDir =
      args.scope === "user"
        ? args.platform.path.join(args.userHome, ".axm")
        : args.platform.path.join(args.workspaceRoot, ".axm");
    const rule: WorkspaceRuleContext = {
      subject: { root: args.workspaceRoot, scope: args.scope },
      workspace: readModel,
      axmDirExists: args.platform.fs.exists(axmDir).pipe(Effect.catch(() => Effect.succeed(false))),
      displayRoot: args.displayRoot ?? "",
    };
    const view = yield* buildLintWorkspaceView({
      platform: args.platform,
      workspaceRoot: args.workspaceRoot,
      readModel,
      scope: args.scope,
    });
    return { rule, view };
  }).pipe(Effect.provide(readModelLayer));
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
  readonly readModel: ServiceMap.Service.Shape<typeof WorkspaceReadModel>;
  readonly scope: "project" | "user";
}

const buildLintWorkspaceView = (
  args: BuildLintWorkspaceViewArgs,
): Effect.Effect<LintWorkspaceView> =>
  Effect.gen(function* () {
    const scoped = args.readModel.scope(args.scope);
    const [skills, packs] = yield* Effect.all([scoped.skills.installed, scoped.packs.installed], {
      concurrency: "unbounded",
    });
    return {
      installedSkills: skills
        .filter((skill) => skill.actual.length > 0 || Option.isSome(skill.resolved))
        .map((skill) => installedSkillToInfo(args, skill)),
      installedPacks: packs.flatMap((pack) => {
        const info = installedPackToInfo(args, pack);
        return info === undefined ? [] : [info];
      }),
    };
  });

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

const chooseSkillActual = (actual: ReadonlyArray<ActualSkill>): ActualSkill | undefined =>
  actual.find((entry) => entry.origin._tag !== "agent-skill-dir") ?? actual[0];

const choosePackActual = (actual: ReadonlyArray<ActualPack>): ActualPack | undefined => actual[0];

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
 * `axm/packages/core/src/unstable/packs/paths.ts#computeExtensionPackPaths`.
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
