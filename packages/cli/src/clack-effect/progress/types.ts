import type * as Effect from "effect/Effect";
import type { ClackSpinnerHandle } from "../spinner/types.js";

export interface ClackProgressConfig {
  readonly style?: "light" | "heavy" | "block";
  readonly max?: number;
  readonly size?: number;
}

export interface ClackProgressHandle extends ClackSpinnerHandle {
  readonly advance: (step?: number, message?: string) => Effect.Effect<void>;
}
