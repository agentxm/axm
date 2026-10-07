import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { RegistryClientFailure } from "./errors.js";

/** A process-owned local diagnostic sink; request policy never exports raw causes. */
export class RegistryFailureObservation extends Context.Service<
  RegistryFailureObservation,
  { readonly failed: (failure: RegistryClientFailure) => Effect.Effect<void> }
>()("@agentxm/registry-client/RegistryFailureObservation") {}
