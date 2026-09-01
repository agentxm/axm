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
import { type ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "../extensions/index.js";
import type { PackRef } from "./refs.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import type * as Duration from "effect/Duration";
import { resolvePackDependencies } from "./dependency-resolution.js";
import {
  resolvePackDependenciesWithReleaseAge,
  type PackDependencyRefResolver,
  type ReleaseAgeAwarePackDependencyResolution,
  type WorkspacePackDependencyResolver,
} from "./dependency-resolution.js";
import type { ReleaseAgeEvaluation } from "@agentxm/registry-protocol/unstable/registry/release-age-policy";

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
  readonly workspaceResolver?: WorkspacePackDependencyResolver;
  readonly dependencyResolver?: PackDependencyRefResolver;
}): Effect.Effect<ReadonlyArray<ExtensionRef>, AppError> =>
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

export const expandPackInstallRefsWithReleaseAge = (args: {
  readonly pack: PackRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly sources: SourceHostProvidersService;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly workspaceResolver?: WorkspacePackDependencyResolver;
  readonly dependencyResolver?: PackDependencyRefResolver;
}): Effect.Effect<ReleaseAgeAwarePackExpansion, AppError> =>
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
