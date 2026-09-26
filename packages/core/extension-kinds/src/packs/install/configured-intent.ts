/**
 * The Pack install intent a configured Pack entry settles to, before its graph
 * is selected. Install and sync recovery both take their Pack intent from
 * here, and every refusal it raises is the kernel's install refusal.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { parseRegistrySourceRef } from "@agentxm/extension-model/unstable/extensions";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import { acceptedResolutionRef } from "@agentxm/workspace-kernel/workspace-state";
import type {
  ReleaseAgeBypassRecord,
  ReleaseAgeHoldbackRecord,
} from "@agentxm/workspace-kernel/operations";
import {
  configuredEntryResolutionRefused,
  INSTALL_HELD_RELEASE_POLICY,
  type ConfiguredInstallFailure,
  type ResolveInstallRequirements,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  acceptedPackDependencyResolver,
  hydrateAcceptedPackRef,
  prepareConfiguredPack,
} from "@agentxm/workspace-kernel/resolution";
import type { PackInstallIntent } from "../lifecycle/install/plan.js";

interface ConfiguredPackIntentArgs {
  readonly name: string;
  readonly source: string;
  readonly releaseAgeEvaluation: ReleaseAgeEvaluation;
  readonly nonInteractive: boolean;
  readonly forceCanonical?: boolean;
  readonly deferProjections?: boolean;
}

/**
 * The intent one configured Pack settles to: an accepted Pack is restored
 * from its accepted archive and replays its accepted members, and any other
 * configured Pack resolves through its configured source. The intent
 * carries the install's declared held-release policy, so a held-back release
 * preserves a complete usable graph or blocks. Install and sync recovery both
 * take their Pack intent from here.
 */
export const prepareConfiguredPackIntent: (args: ConfiguredPackIntentArgs) => Effect.Effect<
  Effect.Effect<
    {
      readonly intent: PackInstallIntent;
      readonly releaseAge:
        | {
            readonly holdbacks: ReadonlyArray<ReleaseAgeHoldbackRecord>;
            readonly bypasses: ReadonlyArray<ReleaseAgeBypassRecord>;
          }
        | undefined;
    },
    ConfiguredInstallFailure,
    ResolveInstallRequirements
  >,
  ConfiguredInstallFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.prepareConfiguredPackIntent")(function* (
  args: ConfiguredPackIntentArgs,
) {
  const accepted = yield* acceptedResolutionRef({
    type: "pack",
    name: args.name,
  }).pipe(Effect.mapError(configuredEntryResolutionRefused(args.name)));

  const shared = {
    nonInteractive: args.nonInteractive,
    releaseAgeEvaluation: args.releaseAgeEvaluation,
    heldRelease: INSTALL_HELD_RELEASE_POLICY,
    ...(args.forceCanonical === true ? { forceCanonical: true } : {}),
    ...(args.deferProjections === true ? { deferProjections: true } : {}),
  };

  if (Option.isSome(accepted) && accepted.value.type === "pack") {
    return hydrateAcceptedPackRef(args.name, accepted.value).pipe(
      Effect.map((packToInstall) => ({
        intent: {
          packToInstall,
          versionRange: Option.fromUndefinedOr(parseRegistrySourceRef(args.source)?.versionRange),
          dependencyResolver: acceptedPackDependencyResolver(),
          ...shared,
        } satisfies PackInstallIntent,
        releaseAge: undefined,
      })),
    );
  }

  const resolve = yield* prepareConfiguredPack(
    args.name,
    args.source,
    args.releaseAgeEvaluation,
  ).pipe(Effect.mapError(configuredEntryResolutionRefused(args.name)));
  return resolve.pipe(
    Effect.mapError(configuredEntryResolutionRefused(args.name)),
    Effect.map((resolved) => ({
      intent: {
        packToInstall: resolved.ref,
        versionRange: resolved.versionRange,
        ...shared,
      } satisfies PackInstallIntent,
      releaseAge: "releaseAge" in resolved ? resolved.releaseAge : undefined,
    })),
  );
});
