/**
 * Effect-wrapped @clack/prompts service.
 *
 * Provides an injectable service for CLI prompts, logging, and spinners.
 * Makes handlers testable by allowing mock implementations.
 *
 * @example
 * ```typescript
 * import { Clack, ClackLive } from "./services/clack-effect/index.js";
 *
 * const program = Effect.gen(function* () {
 *   const clack = yield* Clack;
 *
 *   yield* clack.intro("My CLI Tool");
 *   const confirmed = yield* clack.confirm("Continue?");
 *   yield* clack.outro("Done!");
 * });
 *
 * // Run with live implementation
 * Effect.runPromise(program.pipe(Effect.provide(ClackLive)));
 * ```
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export { PromptCancelled, PromptError } from "./errors.js";
export { Clack, ClackLive, type ClackService } from "./service.js";
export {
  type ConfirmBehavior,
  type LogRecords,
  type MockClackConfig,
  type MockClackService,
  type MultiselectBehavior,
  makeClackTestLayer,
  makeMockClackService,
  type SelectBehavior,
} from "./test.js";
export type { MultiselectConfig, PromptOption, Spinner } from "./types.js";
