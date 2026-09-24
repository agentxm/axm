/**
 * Pack expansion: a Pack ref and every member it resolves to under one
 * release-age evaluation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { type ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { PackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type {
  SourceHostProvidersService,
  SourceResolutionFailure,
} from "../../resolution/sources/index.js";
import {
  resolvePackDependenciesWithReleaseAge,
  type AcceptedPackMemberIncompatible,
  type PackDependencyRefResolver,
  type PackDependencyResolutionFailure,
  type PackMemberRangeResolver,
  type ReleaseAgeAwarePackDependencyResolution,
  type SourceAuthorityBlocked,
  type WorkspacePackDependencyResolver,
} from "../../resolution/index.js";

/** Failures pack expansion can surface. */
type PackExpansionError =
  | SourceResolutionFailure
  | PackDependencyResolutionFailure
  | SourceAuthorityBlocked
  | AcceptedPackMemberIncompatible;

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

/**
 * Expand a Pack ref into its cross-type member refs: the Pack first, then
 * the members of every type listed in `supportedDependencyTypes`.
 */
export const expandPackInstallRefsWithReleaseAge = <E = never, R = never>(args: {
  readonly pack: PackRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly sources: SourceHostProvidersService;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly workspaceResolver?: WorkspacePackDependencyResolver<E, R>;
  readonly dependencyResolver?: PackDependencyRefResolver<E, R>;
  readonly memberRange?: PackMemberRangeResolver;
}): Effect.Effect<ReleaseAgeAwarePackExpansion, PackExpansionError | E, R> =>
  Effect.gen(function* () {
    const resolved = yield* resolvePackDependenciesWithReleaseAge(
      args.pack,
      args.sources,
      args.releaseAgeEvaluation,
      undefined,
      args.workspaceResolver,
      args.dependencyResolver,
      args.memberRange,
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
