/**
 * Pack expansion helpers for cross-type dependency expansion.
 *
 * - expandPackInstallRefs: Expands a pack ref into install refs (pack + dependencies)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { AppError } from "../app-error/index.js";
import { type ExtensionType } from "../extensions/index.js";
import type { ExtensionRef } from "../extensions/index.js";
import type { PackRef } from "./refs.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type * as Duration from "effect/Duration";
import { resolvePackDependencies } from "./dependency-resolution.js";

// -----------------------------------------------------------------------------
// expandPackInstallRefs
// -----------------------------------------------------------------------------

/**
 * Expand a pack ref into its cross-type dependency refs.
 *
 * Returns the pack ref first, followed by dependency refs in declaration
 * order. Only dependency types listed in `supportedDependencyTypes` are
 * included.
 *
 * Dependency refs use the pack's registry source and empty integrity
 * (integrity is resolved during materialization, not at expansion time).
 */
export const expandPackInstallRefs = (args: {
  readonly pack: PackRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly sources: SourceHostProvidersService;
  readonly minimumReleaseAge?: Option.Option<Duration.Duration>;
}): Effect.Effect<ReadonlyArray<ExtensionRef>, AppError> =>
  Effect.gen(function* () {
    const { pack, supportedDependencyTypes, sources, minimumReleaseAge } = args;
    const resolved = yield* resolvePackDependencies(pack, sources, minimumReleaseAge);

    const deps = resolved.dependencyRefs.filter((ref) =>
      supportedDependencyTypes.includes(ref.type),
    );

    const packRef: ExtensionRef = pack;
    return [packRef, ...deps];
  });
