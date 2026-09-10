/**
 * Pack expansion helpers for cross-type dependency expansion.
 *
 * - expandPackInstallRefs: Expands a pack ref into install refs (pack + dependencies)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Duration from "effect/Duration";
import type * as Option from "effect/Option";
import { type ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type {
  SourceHostProvidersService,
  SourceResolutionFailure,
} from "@agentxm/extension-sources";
import {
  resolvePackDependencies,
  resolvePackDependenciesWithReleaseAge,
  type PackDependencyRefResolver,
  type PackDependencyResolutionFailure,
  type ReleaseAgeAwarePackDependencyResolution,
  type SourceAuthorityBlocked,
  type WorkspacePackDependencyResolver,
} from "@agentxm/extension-resolution";

/** Failures pack expansion can surface. */
type PackExpansionError =
  SourceResolutionFailure | PackDependencyResolutionFailure | SourceAuthorityBlocked;

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
export const expandPackInstallRefs = <E = never, R = never>(args: {
  readonly pack: PackRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly sources: SourceHostProvidersService;
  readonly minimumReleaseAge?: Option.Option<Duration.Duration>;
  readonly workspaceResolver?: WorkspacePackDependencyResolver<E, R>;
  readonly dependencyResolver?: PackDependencyRefResolver<E, R>;
}): Effect.Effect<ReadonlyArray<ExtensionRef>, PackExpansionError | E, R> =>
  Effect.gen(function* () {
    const {
      pack,
      supportedDependencyTypes,
      sources,
      minimumReleaseAge,
      workspaceResolver,
      dependencyResolver,
    } = args;
    const resolved = yield* resolvePackDependencies(
      pack,
      sources,
      minimumReleaseAge,
      undefined,
      workspaceResolver,
      dependencyResolver,
    );

    const deps = resolved.dependencyRefs.filter((ref) =>
      supportedDependencyTypes.includes(ref.type),
    );

    const packRef: ExtensionRef = pack;
    return [packRef, ...deps];
  });

export type ReleaseAgeAwarePackExpansion =
  | {
      readonly kind: "selected";
      readonly refs: ReadonlyArray<ExtensionRef>;
      readonly holdbacks: Extract<
        ReleaseAgeAwarePackDependencyResolution,
        { kind: "selected" }
      >["holdbacks"];
      readonly bypasses: Extract<
        ReleaseAgeAwarePackDependencyResolution,
        { kind: "selected" }
      >["bypasses"];
    }
  | Extract<ReleaseAgeAwarePackDependencyResolution, { kind: "policy_held" }>;

export const expandPackInstallRefsWithReleaseAge = <E = never, R = never>(args: {
  readonly pack: PackRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly sources: SourceHostProvidersService;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly workspaceResolver?: WorkspacePackDependencyResolver<E, R>;
  readonly dependencyResolver?: PackDependencyRefResolver<E, R>;
}): Effect.Effect<ReleaseAgeAwarePackExpansion, PackExpansionError | E, R> =>
  Effect.gen(function* () {
    const resolved = yield* resolvePackDependenciesWithReleaseAge(
      args.pack,
      args.sources,
      args.releaseAgeEvaluation,
      undefined,
      args.workspaceResolver,
      args.dependencyResolver,
    );
    if (resolved.kind === "policy_held") return resolved;
    const dependencies = resolved.dependencies.dependencyRefs.filter((ref) =>
      args.supportedDependencyTypes.includes(ref.type),
    );
    return {
      kind: "selected",
      refs: [args.pack, ...dependencies],
      holdbacks: resolved.holdbacks,
      bypasses: resolved.bypasses,
    };
  });
