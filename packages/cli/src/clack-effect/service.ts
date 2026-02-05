/**
 * Effect service wrapper for @clack/prompts.
 *
 * Provides an injectable service for CLI prompts, logging, and spinners.
 * Makes handlers testable by allowing mock implementations.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as p from "@clack/prompts";
import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { PromptCancelled, PromptError } from "./errors.js";
import type { MultiselectConfig, PromptOption, Spinner } from "./types.js";

// -----------------------------------------------------------------------------
// Service Interface
// -----------------------------------------------------------------------------

/**
 * Service interface for clack prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ClackService {
  // Lifecycle
  readonly intro: (title: string) => Effect.Effect<void>;
  readonly outro: (message: string) => Effect.Effect<void>;

  // Logging
  readonly log: {
    readonly info: (message: string) => Effect.Effect<void>;
    readonly warn: (message: string) => Effect.Effect<void>;
    readonly error: (message: string) => Effect.Effect<void>;
    readonly success: (message: string) => Effect.Effect<void>;
    readonly message: (message: string) => Effect.Effect<void>;
  };

  // Prompts
  readonly confirm: (
    message: string,
    initialValue?: boolean,
  ) => Effect.Effect<boolean, PromptError | PromptCancelled>;

  readonly select: <T>(
    message: string,
    items: readonly T[],
    toOption: (item: T) => PromptOption,
  ) => Effect.Effect<T, PromptError | PromptCancelled>;

  readonly multiselect: <T>(
    message: string,
    items: readonly T[],
    config: MultiselectConfig<T>,
  ) => Effect.Effect<readonly T[], PromptError | PromptCancelled>;

  // Spinner
  readonly spinner: () => Effect.Effect<Spinner>;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

/**
 * Effect service tag for clack prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class Clack extends Context.Tag("@agentxm/cli/Clack")<Clack, ClackService>() {}

// -----------------------------------------------------------------------------
// Live Implementation
// -----------------------------------------------------------------------------

const makeLiveClackService = (): ClackService => ({
  intro: (title) => Effect.sync(() => p.intro(title)),

  outro: (message) => Effect.sync(() => p.outro(message)),

  log: {
    info: (message) => Effect.sync(() => p.log.info(message)),
    warn: (message) => Effect.sync(() => p.log.warn(message)),
    error: (message) => Effect.sync(() => p.log.error(message)),
    success: (message) => Effect.sync(() => p.log.success(message)),
    message: (message) => Effect.sync(() => p.log.message(message)),
  },

  confirm: (message, initialValue = true) =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: () => p.confirm({ message, initialValue }),
        catch: (error) =>
          new PromptError({
            message: "Failed to prompt for confirmation",
            cause: Option.some(error),
          }),
      });

      if (p.isCancel(result)) {
        return yield* Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
      }

      return result;
    }),

  select: <T>(message: string, items: readonly T[], toOption: (item: T) => PromptOption) =>
    Effect.gen(function* () {
      const options = items.map((item, index) => {
        const opt = toOption(item);
        return {
          value: index,
          label: opt.label,
          ...(Option.isSome(opt.hint) && { hint: opt.hint.value }),
        };
      });

      const result = yield* Effect.tryPromise({
        try: () => p.select({ message, options }),
        catch: (error) =>
          new PromptError({ message: "Failed to prompt for selection", cause: Option.some(error) }),
      });

      if (p.isCancel(result)) {
        return yield* Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
      }

      return yield* Array.get(items, result).pipe(
        Effect.mapError(
          () => new PromptError({ message: "Invalid selection index", cause: Option.none() }),
        ),
      );
    }),

  multiselect: <T>(message: string, items: readonly T[], config: MultiselectConfig<T>) =>
    Effect.gen(function* () {
      const promptOptions = items.map((item, index) => {
        const opt = config.toOption(item);
        return {
          value: index,
          label: opt.label,
          ...(Option.isSome(opt.hint) && { hint: opt.hint.value }),
        };
      });

      // Map initialValues (string values) to indices
      const initialIndices = Option.match(config.initialValues, {
        onNone: () => undefined,
        onSome: (initVals) =>
          Array.filterMap(items, (item, index) =>
            initVals.includes(config.toOption(item).value) ? Option.some(index) : Option.none(),
          ),
      });

      // Build multiselect config
      const multiselectConfig: Parameters<typeof p.multiselect>[0] = {
        message,
        options: promptOptions,
      };
      if (initialIndices !== undefined) {
        multiselectConfig.initialValues = initialIndices;
      }
      if (Option.isSome(config.required)) {
        multiselectConfig.required = config.required.value;
      }

      const result = yield* Effect.tryPromise({
        try: () => p.multiselect(multiselectConfig),
        catch: (error) =>
          new PromptError({
            message: "Failed to prompt for multiselect",
            cause: Option.some(error),
          }),
      });

      if (p.isCancel(result)) {
        return yield* Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
      }

      // Cast needed: multiselect config loses generic type info due to dynamic construction
      const indices = result as number[];
      return Array.filterMap(indices, (index) => Array.get(items, index));
    }),

  spinner: () =>
    Effect.sync(() => {
      const s = p.spinner();
      return {
        start: (message: string) => s.start(message),
        stop: (message: string) => s.stop(message),
      };
    }),
});

/**
 * Live layer for clack service using @clack/prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const ClackLive: Layer.Layer<Clack> = Layer.succeed(Clack, makeLiveClackService());
