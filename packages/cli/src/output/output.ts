import type * as Effect from "effect/Effect";
import type * as Schema from "effect/Schema";
import * as ServiceMap from "effect/ServiceMap";
import type * as Stream from "effect/Stream";
import type { AppError } from "../app-error/index.js";

export type StreamLevel = "message" | "info" | "success" | "step" | "warn" | "error";

export interface BoxOptions {
  readonly contentAlign?: "left" | "center" | "right";
  readonly titleAlign?: "left" | "center" | "right";
  readonly width?: number | "auto";
  readonly titlePadding?: number;
  readonly contentPadding?: number;
  readonly rounded?: boolean;
}

export class Output extends ServiceMap.Service<
  Output,
  {
    readonly message: (message: string) => Effect.Effect<void>;
    readonly info: (message: string) => Effect.Effect<void>;
    readonly success: (message: string) => Effect.Effect<void>;
    readonly step: (message: string) => Effect.Effect<void>;
    readonly warn: (message: string) => Effect.Effect<void>;
    readonly error: (message: string) => Effect.Effect<void>;
    readonly intro: (title?: string) => Effect.Effect<void>;
    readonly outro: (message?: string) => Effect.Effect<void>;
    readonly cancel: (message?: string) => Effect.Effect<void>;
    readonly note: (message: string, title?: string) => Effect.Effect<void>;
    readonly box: (message: string, title?: string, opts?: BoxOptions) => Effect.Effect<void>;
    readonly stream: <E, R>(
      level: StreamLevel,
      stream: Stream.Stream<string, E, R>,
    ) => Effect.Effect<void, AppError | E, R>;
    readonly result: <A, I>(
      schema: Schema.Codec<A, I>,
      data: A,
      textRenderer: (data: A) => string,
    ) => Effect.Effect<void>;
  }
>()("@axm.sh/cli/Output") {}
