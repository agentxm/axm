import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

/** Request-policy-owned evidence for one HTTP attempt, including malformed responses. */
export class RegistryRequestAttempt extends Context.Service<
  RegistryRequestAttempt,
  {
    readonly n: number;
    readonly of: number;
    readonly requestId: string;
    readonly observeResponse: (response: {
      readonly status: number;
      readonly requestId?: string;
    }) => Effect.Effect<void>;
  }
>()("@agentxm/registry-client/request-policy/RegistryRequestAttempt") {}
