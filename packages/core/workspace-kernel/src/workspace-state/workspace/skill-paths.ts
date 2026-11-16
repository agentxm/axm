import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { extractSkillMetadata, skillDirectoryName } from "@agentxm/extension-content";
import { sanitizeName } from "./extension-name.js";
/**
 * Centralized skill path computation.
 *
 * Provides types and a pure function for computing skill directory paths
 * based on source type (registry vs non-registry).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { computeExtensionPathsForLayout, type ExtensionPathSource } from "./extension-paths.js";
import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceLayout } from "./layout.js";
import { isNotFound, readFileStringIfPresent } from "@agentxm/host-primitives";
import type { PlatformError } from "effect/PlatformError";
import * as Result from "effect/Result";

/**
 * Minimal structural discriminant for determining skill path layout.
 *
 * Every acquired ref carries enough source coordinates to derive its
 * source-qualified canonical path.
 */
export type SkillPathSource = ExtensionPathSource;

/**
 * Computed paths for an installed skill directory.
 *
 * - `canonicalPath`: root of the installed skill
 * - `skillSrcPath`: where actual skill source files live
 *
 * Native packages use `<canonicalPath>/src`; portable Agent Skills use the
 * source-qualified package root directly.
 */
export interface SkillDirPaths {
  readonly canonicalPath: AbsolutePath;
  readonly skillSrcPath: AbsolutePath;
}

export const computeSkillPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: SkillPathSource,
  sanitizedName: string,
): SkillDirPaths => {
  const paths = computeExtensionPathsForLayout(join, layout, source, "skills", sanitizedName);
  return { canonicalPath: paths.canonicalPath, skillSrcPath: paths.extensionSrcPath };
};

const directoryNameFromContent = (content: Option.Option<string>, packageName: string) =>
  skillDirectoryName(
    extractSkillMetadata(Option.getOrElse(content, () => "")).name,
    sanitizeName(packageName),
  );

/** Read native identity from content; absent content retains a diagnostic fallback. */
export const readSkillDirectoryName = (contentRoot: string, packageName: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const content = yield* readFileStringIfPresent(fs, path.join(contentRoot, "SKILL.md"));
    return directoryNameFromContent(content, packageName);
  });

/**
 * Native identity from the outcome of a SKILL.md read already made, mapped as
 * `readSkillDirectoryName` maps its own read: absence keeps the fallback and
 * any other failure fails with the read's error.
 */
export const skillDirectoryNameFromRead = (
  outcome: Result.Result<string, PlatformError>,
  packageName: string,
): Effect.Effect<string, PlatformError> =>
  Result.isSuccess(outcome)
    ? Effect.succeed(directoryNameFromContent(Option.some(outcome.success), packageName))
    : isNotFound(outcome.failure)
      ? Effect.succeed(directoryNameFromContent(Option.none(), packageName))
      : Effect.fail(outcome.failure);
