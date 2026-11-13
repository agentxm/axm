import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  RegistryClientFactory,
  RegistryRequestFailed,
  type AccessibleContent,
  type ValidateExtensionAccessArgs,
} from "@agentxm/registry-client";
import * as Exit from "effect/Exit";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { sourceRefContentKey } from "../../acquisition/index.js";
import { StepFailure } from "../../operations/index.js";
import {
  RegistryContentAccess,
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../../sources/index.js";
import { resolutionFailureToStepFailure } from "../resolution-step-failure.js";

/** The external-content capabilities needed by plan admission and acquisition. */
export interface PlanSourcesService {
  readonly acquire: SourceHostProvidersService["acquireForTransition"];
  readonly withAccess: <A, E, R>(
    refs: ReadonlyArray<Extract<ExtensionRef, { readonly refType: "registry" }>>,
    use: (failures: ReadonlyMap<string, StepFailure>) => Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
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
  const withAccess: PlanSourcesService["withAccess"] = (refs, use) =>
    Effect.gen(function* () {
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
      const batches = [...groups.values()];
      const run = <A, E, R>(
        index: number,
        readers: ReadonlyMap<string, AccessibleContent["read"]>,
        callback: (failures: ReadonlyMap<string, StepFailure>) => Effect.Effect<A, E, R>,
      ): Effect.Effect<A, E, R> =>
        Effect.gen(function* () {
          const group = batches[index];
          const first = group?.[0];
          if (group === undefined || first === undefined)
            return yield* callback(failures).pipe(
              Effect.provideService(RegistryContentAccess, {
                read: (ref, args) => {
                  const reader = readers.get(sourceRefContentKey(ref));
                  return reader === undefined
                    ? Effect.fail(
                        new RegistryRequestFailed({
                          category: "conflict",
                          detail: "Registry content is outside this acquisition stage.",
                        }),
                      )
                    : reader(args);
                },
              }),
            );
          const client = yield* Effect.result(clients.forEndpoint(first.ref.source.location));
          if (Result.isFailure(client)) {
            for (const { ref } of group)
              failures.set(
                sourceRefContentKey(ref),
                new StepFailure({
                  category: "internal",
                  detail: "Registry access configuration is unavailable.",
                  cause: client.failure,
                }),
              );
            return yield* run(index + 1, readers, callback);
          }
          const admitted = yield* Effect.result(
            client.success.withAccessibleContent(
              group.map((entry) => entry.args),
              (content) =>
                Effect.gen(function* () {
                  const nextReaders = new Map(readers);
                  for (const [itemIndex, { ref }] of group.entries()) {
                    const key = sourceRefContentKey(ref);
                    const result = content.results[itemIndex];
                    if (result === undefined || content.results.length !== group.length)
                      failures.set(
                        key,
                        new StepFailure({
                          category: "internal",
                          detail: "Registry admission results do not match the submitted batch.",
                        }),
                      );
                    else if (Result.isFailure(result))
                      failures.set(key, resolutionFailureToStepFailure(result.failure));
                    else nextReaders.set(key, content.read);
                  }
                  // Keep callback failures distinct from admission failures; each Registry scope closes on exit.
                  return yield* Effect.exit(run(index + 1, nextReaders, callback));
                }),
            ),
          );
          if (Result.isFailure(admitted)) {
            for (const { ref } of group)
              failures.set(
                sourceRefContentKey(ref),
                resolutionFailureToStepFailure(admitted.failure),
              );
            return yield* run(index + 1, readers, callback);
          }
          return yield* Exit.isFailure(admitted.success)
            ? Effect.failCause(admitted.success.cause)
            : Effect.succeed(admitted.success.value);
        });
      return yield* run(0, new Map(), use);
    });
  return { acquire: sources.acquireForTransition, withAccess } satisfies PlanSourcesService;
});
