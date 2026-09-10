/**
 * Pack expansion helpers for cross-type dependency expansion.
 *
 * - expandPackInstallRefs: Expands a pack ref into install refs (pack + dependencies)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { SourceAuthorityBlocked, PackManagerError } from "@agentxm/extension-workspace";

/** Failures pack expansion can surface. */
type PackExpansionError = SourceResolutionFailure | PackManagerError | SourceAuthorityBlocked;
import { type ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type {
  SourceHostProvidersService,
  SourceResolutionFailure,
} from "@agentxm/extension-sources";
import type * as Duration from "effect/Duration";
import { resolvePackDependencies } from "./dependency-resolution.js";
import {
  resolvePackDependenciesWithReleaseAge,
  type PackDependencyRefResolver,
  type ReleaseAgeAwarePackDependencyResolution,
  type WorkspacePackDependencyResolver,
} from "./dependency-resolution.js";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";

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
export const expandPackInstallRefs = <E = never>(args: {
  readonly pack: PackRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly sources: SourceHostProvidersService;
  readonly minimumReleaseAge?: Option.Option<Duration.Duration>;
  readonly workspaceResolver?: WorkspacePackDependencyResolver<E>;
  readonly dependencyResolver?: PackDependencyRefResolver<E>;
}): Effect.Effect<ReadonlyArray<ExtensionRef>, PackExpansionError | E> =>
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

export const expandPackInstallRefsWithReleaseAge = <E = never>(args: {
  readonly pack: PackRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly sources: SourceHostProvidersService;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly workspaceResolver?: WorkspacePackDependencyResolver<E>;
  readonly dependencyResolver?: PackDependencyRefResolver<E>;
}): Effect.Effect<ReleaseAgeAwarePackExpansion, PackExpansionError | E> =>
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
