/**
 * Operation context service for CLI commands.
 *
 * Provides shared context (working directory, flags, etc.) across command execution.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { Context, Layer } from "effect";

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
   * Create a layer with default configuration.
   */
  static readonly defaultLayer: Layer.Layer<OperationContext> = Layer.sync(
    OperationContext,
    () => ({
      cwd: process.cwd(),
      dryRun: false,
    }),
  );
}
