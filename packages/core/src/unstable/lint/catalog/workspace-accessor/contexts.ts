/**
 * `WorkspaceIndex` and `buildWorkspaceRuleContext`.
 *
 * The `WorkspaceIndex` satisfies both Phase 3a's `SkillIndexView` and Phase
 * 3b's `PackIndexView` — it exposes `installedSkills: InstalledSkillInfo[]`
 * and `installedPacks: InstalledPackInfo[]` with per-provenance
 * `displayRoot`s:
 *
 *   Registry-installed native skill: `.axm/extensions/<@owner>/skills/<name>/src/`
 *   External skill:                  `.axm/extensions/external/skills/<name>/`
 *   Registry pack:                   `.axm/extensions/<@owner>/packs/<name>/`
 *                                    (NO `src/` — matches the on-disk layout
 *                                    per Phase 3b finding.)
 *
 * The `buildWorkspaceRuleContext` helper constructs a `WorkspaceRuleContext`
 * from a resolved `WorkspaceLintAccessor` and a requested scope. User-scope
 * root resolution for v1 is `$HOME/.axm/` per design doc Open Items #10; a
 * `--scope=user` follow-up owns the XDG story.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { WorkspaceRuleContext } from "../../context.js";
import {
  buildSkillRuleContexts,
  type InstalledSkillInfo,
  type SkillIndexView,
} from "../skill-accessor/contexts.js";
import {
  buildPackRuleContexts,
  type InstalledPackInfo,
  type PackIndexView,
} from "../pack-accessor/contexts.js";
import { makePlatformSkillFileAccessor } from "../skill-accessor/platform.js";
import { makePlatformPackFileAccessor } from "../pack-accessor/platform.js";
import { makePlatformWorkspaceLintAccessor } from "./platform.js";
import type { WorkspaceAccessorPlatform, WorkspaceIndexView } from "./platform.js";

// -----------------------------------------------------------------------------
// WorkspaceIndex
// -----------------------------------------------------------------------------

/**
 * The `WorkspaceIndex` shape — satisfies `SkillIndexView` and `PackIndexView`
 * simultaneously, so it can be passed to `buildSkillRuleContexts` and
 * `buildPackRuleContexts` without adaptation. The implementation yields
 * `SkillRuleContext[]` / `PackRuleContext[]` via the respective builders.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceIndex extends SkillIndexView, PackIndexView {
  readonly installedSkills: ReadonlyArray<InstalledSkillInfo>;
  readonly installedPacks: ReadonlyArray<InstalledPackInfo>;
}

// -----------------------------------------------------------------------------
// buildWorkspaceRuleContext
// -----------------------------------------------------------------------------

/**
 * Argument shape for `buildWorkspaceRuleContext`.
 */
export interface BuildWorkspaceRuleContextArgs {
  readonly platform: WorkspaceAccessorPlatform;
  readonly workspaceRoot: string;
  readonly index: WorkspaceIndex;
  readonly scope: "project" | "user";
  /**
   * Optional `displayRoot` override. Defaults to `""` (accessor-relative
   * paths render under the workspace root).
   */
  readonly displayRoot?: string;
}

/**
 * Construct a `WorkspaceRuleContext` scoped to project or user.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const buildWorkspaceRuleContext = (
  args: BuildWorkspaceRuleContextArgs,
): WorkspaceRuleContext => {
  const indexView = toWorkspaceIndexView(args.index);
  const accessor = makePlatformWorkspaceLintAccessor({
    platform: args.platform,
    workspaceRoot: args.workspaceRoot,
    index: indexView,
    scope: args.scope,
  });
  return {
    subject: { root: args.workspaceRoot, scope: args.scope },
    workspace: accessor,
    displayRoot: args.displayRoot ?? "",
  };
};

// -----------------------------------------------------------------------------
// Index → accessor plumbing
// -----------------------------------------------------------------------------

const toWorkspaceIndexView = (index: WorkspaceIndex): WorkspaceIndexView => ({
  installedSkills: Effect.sync(() => buildSkillRuleContexts(index)),
  installedPacks: Effect.sync(() => buildPackRuleContexts(index)),
});

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
 * `axm/packages/core/src/unstable/packs/paths.ts#computeExtensionPackPaths`
 * (Phase 3b finding).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const registryPackDisplayRoot = (owner: string, name: string): string =>
  `.axm/extensions/${owner}/packs/${name}`;

// -----------------------------------------------------------------------------
// Build-a-skill-info helpers (thin wrappers over the skill / pack accessors
// previously landed in Phase 3a/3b).
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
  const absoluteRoot = args.platform.path.resolve(
    args.workspaceRoot,
    `.axm/extensions/${args.owner}/skills/${args.name}/src`,
  );
  return {
    isNative: true,
    skillJson: args.skillJson,
    displayRoot: registryNativeSkillDisplayRoot(args.owner, args.name),
    files: makePlatformSkillFileAccessor(args.platform, absoluteRoot),
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
  return {
    isNative: false,
    skillJson: undefined,
    displayRoot: externalSkillDisplayRoot(args.name),
    files: makePlatformSkillFileAccessor(args.platform, absoluteRoot),
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
