/**
 * The Pack install intent a configured Pack entry settles to, before its graph
 * is selected. Install and sync recovery both take their Pack intent from
 * here, and every refusal it raises is the kernel's install refusal.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { ConfigError } from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { parseRegistrySourceRef } from "@agentxm/extension-model/unstable/extensions";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import { acceptedResolutionRef } from "../../desired-state/index.js";
import {
  installRefused,
  type ExtensionLifecycleFailed,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeHoldbackRecord,
} from "../../operations/index.js";
import {
  INSTALL_HELD_RELEASE_POLICY,
  type ResolveInstallRequirements,
} from "../../reconciliation/index.js";
import {
  acceptedPackDependencyResolver,
  ExtensionResolutionFailed,
  hydrateAcceptedPackRef,
  prepareConfiguredPack,
} from "../../resolution/index.js";
import type { PackInstallIntent } from "../lifecycle/install/plan.js";

/**
 * Everything settling one configured Pack's intent can fail with: the install
 * refusal, plus the resolution refusal a configured source carries through
 * with its own category and sentence.
 */
export type ConfiguredPackIntentFailure =
  ExtensionLifecycleFailed | ExtensionResolutionFailed | ConfigError;

/**
 * A resolution refusal already carries its own category and fact sentence, so
 * it travels unchanged; anything else becomes the install refusal naming the
 * configured entry that could not be resolved.
 */
const resolutionFailed =
  (name: string) =>
  (cause: unknown): ConfiguredPackIntentFailure =>
    cause instanceof ExtensionResolutionFailed || cause instanceof ConfigError
      ? cause
      : installRefused({
          category: "conflict",
          detail: `Configured extension "${name}" could not be resolved`,
          cause,
        });

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
    ConfiguredPackIntentFailure,
    ResolveInstallRequirements
  >,
  ConfiguredPackIntentFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.prepareConfiguredPackIntent")(function* (
  args: ConfiguredPackIntentArgs,
) {
  const accepted = yield* acceptedResolutionRef({
    type: "pack",
    name: args.name,
  }).pipe(Effect.mapError(resolutionFailed(args.name)));

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
  ).pipe(Effect.mapError(resolutionFailed(args.name)));
  return resolve.pipe(
    Effect.mapError(resolutionFailed(args.name)),
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
