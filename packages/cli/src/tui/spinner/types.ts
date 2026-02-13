import type * as Effect from "effect/Effect";

export interface SpinnerHandle {
  readonly stop: (message: string) => Effect.Effect<void>;
}

export interface SpinnerService {
  readonly start: (message: string) => Effect.Effect<SpinnerHandle>;
  /** Stop all active spinners (e.g., on unhandled error before exit). */
  readonly stopAll: Effect.Effect<void>;
}
