/**
 * Interaction context service for CLI commands.
 *
 * Provides access to interactive CLI capabilities (prompts, spinners, logging)
 * through a unified service interface.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Clack } from "../clack-effect/service.js";
import type { InteractionContextService } from "./types.js";

/**
 * Effect service tag for interaction context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class InteractionContext extends Context.Tag("@agentxm/cli/InteractionContext")<
  InteractionContext,
  InteractionContextService
>() {
  /**
   * Create a layer from a custom service implementation.
   */
  static readonly layer = (service: InteractionContextService): Layer.Layer<InteractionContext> =>
    Layer.succeed(InteractionContext, service);
}

/**
 * Live layer for InteractionContext using real Clack prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const InteractionContextLive: Layer.Layer<InteractionContext, never, Clack> = Layer.effect(
  InteractionContext,
  Effect.gen(function* () {
    const clack = yield* Clack;
    return { p: clack };
  }),
);
