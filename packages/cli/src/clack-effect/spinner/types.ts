import type * as Effect from "effect/Effect";

export interface ClackSpinnerHandle {
  readonly stop: (message?: string) => Effect.Effect<void>;
  readonly message: (message?: string) => Effect.Effect<void>;
  readonly cancel: (message?: string) => Effect.Effect<void>;
  readonly error: (message?: string) => Effect.Effect<void>;
  readonly clear: () => Effect.Effect<void>;
}
