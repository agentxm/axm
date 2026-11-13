import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { RegistryClientFactory, type ValidateExtensionAccessArgs } from "@agentxm/registry-client";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { sourceRefContentKey } from "../../acquisition/index.js";
import { StepFailure } from "../../operations/index.js";
import { SourceHostProviders, type SourceHostProvidersService } from "../../sources/index.js";
import { resolutionFailureToStepFailure } from "../resolution-step-failure.js";

/** The external-content capabilities needed by plan admission and acquisition. */
export interface PlanSourcesService {
  readonly acquire: SourceHostProvidersService["acquireForTransition"];
  readonly validateExposure: (
    refs: ReadonlyArray<Extract<ExtensionRef, { readonly refType: "registry" }>>,
  ) => Effect.Effect<ReadonlyMap<string, StepFailure>>;
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
    validateExposure: Effect.fn("PlanSources.validateExposure")(function* (refs) {
      const failures = new Map<string, StepFailure>();
      const groups = new Map<
        string,
        { readonly ref: (typeof refs)[number]; readonly args: ValidateExtensionAccessArgs }[]
      >();
      for (const ref of refs) {
        if (Option.isNone(ref.integrity)) {
          failures.set(
            sourceRefContentKey(ref),
            new StepFailure({
              category: "conflict",
              detail: "Registry exposure requires an exact accepted archive integrity.",
            }),
          );
          continue;
        }
        const key = JSON.stringify([ref.source.location.href, ref.source.name]);
        const group = groups.get(key) ?? [];
        group.push({
          ref,
          args: {
            owner: ref.owner,
            type: ref.type,
            name: ref.name,
            exact: {
              version: ref.version,
              integrity: ref.integrity.value,
              publisherBindingId: ref.publisherBindingId,
            },
          },
        });
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        const first = group[0];
        if (first === undefined) continue;
        const checked = yield* Effect.result(
          Effect.gen(function* () {
            const client = yield* clients.forEndpoint(first.ref.source.location).pipe(
              Effect.mapError(
                (cause) =>
                  new StepFailure({
                    category: "internal",
                    detail: "Registry access configuration is unavailable.",
                    cause,
                  }),
              ),
            );
            return yield* client
              .validateExtensionAccessBatch(group.map((entry) => entry.args))
              .pipe(Effect.mapError(resolutionFailureToStepFailure));
          }),
        );
        for (const [index, { ref }] of group.entries()) {
          const key = sourceRefContentKey(ref);
          if (Result.isFailure(checked)) {
            failures.set(key, checked.failure);
            continue;
          }
          const result = checked.success[index];
          if (result === undefined || checked.success.length !== group.length)
            failures.set(
              key,
              new StepFailure({
                category: "internal",
                detail: "Registry admission results do not match the submitted batch.",
              }),
            );
          else if (Result.isFailure(result))
            failures.set(key, resolutionFailureToStepFailure(result.failure));
        }
      }
      return failures;
    }),
  } satisfies PlanSourcesService;
});
