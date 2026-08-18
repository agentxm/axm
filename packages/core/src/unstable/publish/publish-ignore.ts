/**
 * Publish ignore resolution.
 *
 * A manifest may declare `publish.ignore` to keep development-only files out of
 * the archive. AXM also excludes its reserved canonical completion marker so
 * installed packages can be republished without leaking workspace metadata.
 *
 * Some paths can never be ignored. Dropping the manifest would produce an
 * archive the registry cannot identify, and the failure would surface as a
 * confusing "manifest missing" error far from the pattern that caused it. This
 * module rejects such a pattern at its source instead.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import { makeAppError, type AppError } from "../app-error/index.js";
import type { ExtensionType } from "../extensions/common.js";
import { CANONICAL_MATERIALIZATION_MARKER_FILENAME } from "../extensions/materialization-marker.js";
import type { BuildZipArchiveOptions } from "../utils/build-zip-archive.js";
import { expandGlobs } from "../utils/glob.js";
import { manifestFilenameForType } from "./manifest-policy.js";

/** @experimental This API is unstable and may change without notice. */
export class PublishIgnoreError extends Data.TaggedError("PublishIgnoreError")<{
  readonly detail: string;
  readonly pattern: string;
  readonly path: string;
}> {}

/**
 * Archive-relative paths a publish ignore list may never remove.
 *
 * Only the manifest is protected here. Required body files (a skill's
 * `SKILL.md`, a hook's entrypoint, a knowledge bundle's root index) are
 * enforced by the publish lint gate, which reads the built archive and reports
 * the missing file by name.
 */
export const protectedPublishPaths = (type: ExtensionType): ReadonlyArray<string> => [
  manifestFilenameForType(type),
];

/**
 * Effective ignore patterns for a publish, or the first pattern that would drop
 * a protected path.
 */
export const resolvePublishIgnore = (
  type: ExtensionType,
  declared: ReadonlyArray<string> | undefined,
): Result.Result<ReadonlyArray<string>, PublishIgnoreError> => {
  if (declared === undefined || declared.length === 0) {
    return Result.succeed([CANONICAL_MATERIALIZATION_MARKER_FILENAME]);
  }

  const protectedPaths = protectedPublishPaths(type);
  for (const pattern of declared) {
    const [blocked] = expandGlobs([pattern], protectedPaths);
    if (blocked !== undefined) {
      return Result.fail(
        new PublishIgnoreError({
          detail: `publish.ignore pattern "${pattern}" would leave "${blocked}" out of the archive, and a ${type} package cannot be published without it.`,
          pattern,
          path: blocked,
        }),
      );
    }
  }

  return Result.succeed([...declared, CANONICAL_MATERIALIZATION_MARKER_FILENAME]);
};

/**
 * Archive options for one publish, as an Effect the per-type publish operations
 * can yield directly. AXM's canonical completion marker is always excluded;
 * ordinary authored trees do not contain it, so their archive bytes remain
 * unchanged.
 */
export const publishArchiveOptions = (
  type: ExtensionType,
  declared: ReadonlyArray<string> | undefined,
): Effect.Effect<BuildZipArchiveOptions, AppError> =>
  Effect.fromResult(resolvePublishIgnore(type, declared)).pipe(
    Effect.map((ignore): BuildZipArchiveOptions => ({ ignore })),
    Effect.mapError((cause) => makeAppError({ code: "validation", detail: cause.detail, cause })),
  );
