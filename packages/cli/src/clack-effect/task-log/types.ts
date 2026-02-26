import type * as Effect from "effect/Effect";

export interface ClackTaskLogConfig {
  readonly title: string;
  readonly limit?: number;
  readonly retainLog?: boolean;
}

export interface ClackTaskLogGroupHandle {
  readonly message: (msg: string) => Effect.Effect<void>;
  readonly error: (message: string) => Effect.Effect<void>;
  readonly success: (message: string) => Effect.Effect<void>;
}

export interface ClackTaskLogHandle {
  readonly message: (msg: string) => Effect.Effect<void>;
  readonly group: (name: string) => Effect.Effect<ClackTaskLogGroupHandle>;
  readonly error: (message: string) => Effect.Effect<void>;
  readonly success: (message: string) => Effect.Effect<void>;
}
