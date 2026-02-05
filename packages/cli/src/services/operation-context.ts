/**
 * Operation context service for CLI commands.
 *
 * Provides shared context (working directory, flags, etc.) across command execution.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { isInteractive } from "../utils/tty.js";
import { InteractionContext } from "./interaction-context/service.js";
import type { InteractionContextService } from "./interaction-context/types.js";

/**
 * Operation context configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface OperationContextConfig {
  /** Working directory for the operation */
  readonly cwd: string;
  /** Whether to run in dry-run mode (no side effects) */
  readonly dryRun: boolean;
  /** Optional interaction context for prompts and UI */
  readonly interactive: Option.Option<InteractionContextService>;
}

/**
 * Service providing operation context for CLI commands.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class OperationContext extends Context.Tag("@agentxm/cli/OperationContext")<
  OperationContext,
  OperationContextConfig
>() {
  /**
   * Create a layer with the given configuration.
   */
  static readonly layer = (config: OperationContextConfig): Layer.Layer<OperationContext> =>
    Layer.succeed(OperationContext, config);

  /**
   * Create a layer with default configuration (non-interactive).
   */
  static readonly defaultLayer: Layer.Layer<OperationContext> = Layer.sync(
    OperationContext,
    () => ({
      cwd: process.cwd(),
      dryRun: false,
      interactive: Option.none(),
    }),
  );

  /**
   * Create a live layer that detects interactivity from TTY.
   * Provides InteractionContext when TTY is available and nonInteractive is false.
   */
  static readonly liveLayer = (config?: {
    cwd?: string;
    dryRun?: boolean;
    nonInteractive?: boolean;
  }) => {
    const shouldBeInteractive = isInteractive() && !(config?.nonInteractive ?? false);

    if (shouldBeInteractive) {
      return Layer.effect(
        OperationContext,
        Effect.gen(function* () {
          const interactionCtx = yield* InteractionContext;
          return {
            cwd: config?.cwd ?? process.cwd(),
            dryRun: config?.dryRun ?? false,
            interactive: Option.some(interactionCtx),
          };
        }),
      );
    }

    return Layer.sync(OperationContext, () => ({
      cwd: config?.cwd ?? process.cwd(),
      dryRun: config?.dryRun ?? false,
      interactive: Option.none(),
    }));
  };
}
