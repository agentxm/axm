import * as p from "@clack/prompts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface ClackBoxOptions {
  readonly contentAlign?: "left" | "center" | "right";
  readonly titleAlign?: "left" | "center" | "right";
  readonly width?: number | "auto";
  readonly titlePadding?: number;
  readonly contentPadding?: number;
  readonly rounded?: boolean;
}

export class ClackLog extends Context.Tag("@axm.sh/cli/clack-effect/ClackLog")<
  ClackLog,
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
    readonly box: (message: string, title?: string, opts?: ClackBoxOptions) => Effect.Effect<void>;
  }
>() {}

const makeLiveClackLogService = (): Context.Tag.Service<typeof ClackLog> => ({
  message: (message) => Effect.sync(() => p.log.message(message)),
  info: (message) => Effect.sync(() => p.log.info(message)),
  success: (message) => Effect.sync(() => p.log.success(message)),
  step: (message) => Effect.sync(() => p.log.step(message)),
  warn: (message) => Effect.sync(() => p.log.warn(message)),
  error: (message) => Effect.sync(() => p.log.error(message)),
  intro: (title) => Effect.sync(() => p.intro(title)),
  outro: (message) => Effect.sync(() => p.outro(message)),
  cancel: (message) => Effect.sync(() => p.cancel(message)),
  note: (message, title) => Effect.sync(() => p.note(message, title)),
  box: (message, title, opts) => Effect.sync(() => p.box(message, title, opts)),
});

export const ClackLogLive: Layer.Layer<ClackLog> = Layer.succeed(
  ClackLog,
  makeLiveClackLogService(),
);
