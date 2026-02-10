import type * as Effect from "effect/Effect";

export interface SpinnerHandle {
  readonly stop: (message: string) => Effect.Effect<void>;
}
