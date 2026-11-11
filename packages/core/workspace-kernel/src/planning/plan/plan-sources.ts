import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { RegistryClientFactory } from "@agentxm/registry-client";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { StepFailure } from "../../operations/index.js";
import { SourceHostProviders, type SourceHostProvidersService } from "../../sources/index.js";
import { resolutionFailureToStepFailure } from "../resolution-step-failure.js";

/** The external-content capabilities needed by plan admission and acquisition. */
export interface PlanSourcesService {
  readonly acquire: SourceHostProvidersService["acquireForTransition"];
  readonly validateExposure: (
    ref: Extract<ExtensionRef, { readonly refType: "registry" }>,
  ) => Effect.Effect<void, StepFailure>;
}

/** Required even for local plans, whose implementation can refuse external access. */
export class PlanSources extends Context.Service<PlanSources, PlanSourcesService>()(
  "@agentxm/workspace-kernel/planning/plan/PlanSources",
) {}

/** Bind external adapters once at the command's composition boundary. */
export const makePlanSources: Effect.Effect<
  PlanSourcesService,
  never,
  SourceHostProviders | RegistryClientFactory
> = Effect.gen(function* () {
  const sources = yield* SourceHostProviders;
  const clients = yield* RegistryClientFactory;
  return {
    acquire: sources.acquireForTransition,
    validateExposure: Effect.fn("PlanSources.validateExposure")(function* (ref) {
      if (Option.isNone(ref.integrity))
        return yield* new StepFailure({
          category: "conflict",
          detail: "Registry exposure requires an exact accepted archive integrity.",
        });
      const client = yield* clients.forEndpoint(ref.source.location).pipe(
        Effect.mapError(
          (cause) =>
            new StepFailure({
              category: "internal",
              detail: "Registry access configuration is unavailable.",
              cause,
            }),
        ),
      );
      yield* client
        .validateExtensionAccess({
          owner: ref.owner,
          type: ref.type,
          name: ref.name,
          exact: {
            version: ref.version,
            integrity: ref.integrity.value,
            publisherBindingId: ref.publisherBindingId,
          },
        })
        .pipe(Effect.mapError(resolutionFailureToStepFailure));
    }),
  } satisfies PlanSourcesService;
});
