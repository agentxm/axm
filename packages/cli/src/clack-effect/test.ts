/**
 * Test utilities for clack-effect service.
 *
 * Provides mock implementations for testing handlers without real prompts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled, PromptError } from "./errors.js";
import { Clack, type ClackService } from "./service.js";
import type { Spinner } from "./types.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Recorded log calls for assertions.
 */
export interface LogRecords {
  readonly intro: string[];
  readonly outro: string[];
  readonly info: string[];
  readonly warn: string[];
  readonly error: string[];
  readonly success: string[];
  readonly message: string[];
}

/**
 * Configuration for mock confirm behavior.
 */
export type ConfirmBehavior =
  | { readonly type: "return"; readonly value: boolean }
  | { readonly type: "cancel" };

/**
 * Configuration for mock select behavior.
 */
export type SelectBehavior<T> =
  | { readonly type: "return"; readonly index: number }
  | { readonly type: "returnValue"; readonly value: T }
  | { readonly type: "cancel" };

/**
 * Configuration for mock multiselect behavior.
 */
export type MultiselectBehavior<T> =
  | { readonly type: "return"; readonly indices: readonly number[] }
  | { readonly type: "returnValues"; readonly values: readonly T[] }
  | { readonly type: "cancel" };

/**
 * Mock clack service configuration.
 */
export interface MockClackConfig {
  readonly confirmBehavior?: ConfirmBehavior;
  readonly selectBehavior?: SelectBehavior<unknown>;
  readonly multiselectBehavior?: MultiselectBehavior<unknown>;
}

/**
 * Mock clack service with inspection capabilities.
 */
export interface MockClackService extends ClackService {
  readonly logs: LogRecords;
  readonly spinnerStarts: string[];
  readonly spinnerStops: string[];
}

// -----------------------------------------------------------------------------
// Mock Implementation
// -----------------------------------------------------------------------------

/**
 * Creates a mock clack service for testing.
 *
 * @param config - Configuration for mock behavior
 * @returns Mock service with inspection capabilities
 *
 * @experimental This API is unstable and may change without notice.
 */
export function makeMockClackService(config: MockClackConfig = {}): MockClackService {
  const logs: LogRecords = {
    intro: [],
    outro: [],
    info: [],
    warn: [],
    error: [],
    success: [],
    message: [],
  };

  const spinnerStarts: string[] = [];
  const spinnerStops: string[] = [];

  return {
    logs,
    spinnerStarts,
    spinnerStops,

    intro: (title) =>
      Effect.sync(() => {
        logs.intro.push(title);
      }),

    outro: (message) =>
      Effect.sync(() => {
        logs.outro.push(message);
      }),

    log: {
      info: (message) =>
        Effect.sync(() => {
          logs.info.push(message);
        }),
      warn: (message) =>
        Effect.sync(() => {
          logs.warn.push(message);
        }),
      error: (message) =>
        Effect.sync(() => {
          logs.error.push(message);
        }),
      success: (message) =>
        Effect.sync(() => {
          logs.success.push(message);
        }),
      message: (message) =>
        Effect.sync(() => {
          logs.message.push(message);
        }),
    },

    confirm: () => {
      const behavior = config.confirmBehavior ?? { type: "return", value: true };
      if (behavior.type === "cancel") {
        return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
      }
      return Effect.succeed(behavior.value);
    },

    select: <T>(_message: string, items: readonly T[]) => {
      const behavior = config.selectBehavior ?? { type: "return", index: 0 };
      if (behavior.type === "cancel") {
        return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
      }
      if (behavior.type === "returnValue") {
        return Effect.succeed(behavior.value as T);
      }
      const selected = items[behavior.index];
      if (selected === undefined) {
        return Effect.fail(new PromptError({ message: "Invalid selection index in mock" }));
      }
      return Effect.succeed(selected);
    },

    multiselect: <T>(_message: string, items: readonly T[]) => {
      const behavior = config.multiselectBehavior ?? { type: "return", indices: [0] };
      if (behavior.type === "cancel") {
        return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
      }
      if (behavior.type === "returnValues") {
        return Effect.succeed(behavior.values as readonly T[]);
      }
      const selected = behavior.indices
        .map((i) => items[i])
        .filter((item): item is T => item !== undefined);
      return Effect.succeed(selected);
    },

    spinner: () =>
      Effect.succeed({
        start: (message: string) => {
          spinnerStarts.push(message);
        },
        stop: (message: string) => {
          spinnerStops.push(message);
        },
      } satisfies Spinner),
  };
}

/**
 * Creates a test layer with mock clack service.
 *
 * @param config - Configuration for mock behavior
 * @returns Tuple of [layer, mockService] for assertions
 *
 * @experimental This API is unstable and may change without notice.
 */
export function makeClackTestLayer(
  config: MockClackConfig = {},
): [Layer.Layer<Clack>, MockClackService] {
  const mockService = makeMockClackService(config);
  const layer = Layer.succeed(Clack, mockService);
  return [layer, mockService];
}
