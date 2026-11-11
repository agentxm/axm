/** Candidate resolution keeps its content-access requirement until composition. */
import type { RegistryClientFactory } from "@agentxm/registry-client";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { SourceHostProviders } from "../../sources/index.js";
import { PlanSourcesTest } from "../testing.js";
import { PlanSources, makePlanSources } from "./plan-sources.js";
import { resolveExecutionCandidate } from "./resolve-plan.js";

type ResolutionRequirements = Effect.Services<
  ReturnType<typeof resolveExecutionCandidate<never, never>>
>;
const _resolutionRequiresSources =
  true as const satisfies PlanSources extends ResolutionRequirements ? true : false;
const _adapterRequirements = true as const satisfies Effect.Services<
  typeof makePlanSources
> extends SourceHostProviders | RegistryClientFactory
  ? SourceHostProviders | RegistryClientFactory extends Effect.Services<typeof makePlanSources>
    ? true
    : false
  : false;

// A local-only source capability is closed without constructing HTTP or source adapters.
const _localSources = Effect.gen(function* () {
  return yield* PlanSources;
}).pipe(Effect.provide(PlanSourcesTest()));
const _localRequirements = true as const satisfies [Effect.Services<typeof _localSources>] extends [
  never,
]
  ? true
  : false;

const _liveSources = Layer.effect(PlanSources, makePlanSources);
const _liveRequirements = true as const satisfies Layer.Services<typeof _liveSources> extends
  SourceHostProviders | RegistryClientFactory
  ? SourceHostProviders | RegistryClientFactory extends Layer.Services<typeof _liveSources>
    ? true
    : false
  : false;

export type PlanSourceRequirements = [
  typeof _resolutionRequiresSources,
  typeof _adapterRequirements,
  typeof _localRequirements,
  typeof _liveRequirements,
];
