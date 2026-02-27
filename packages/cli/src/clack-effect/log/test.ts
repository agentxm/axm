import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackLog, type ClackLogService } from "./service.js";

export interface ClackLogCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface MockClackLogService extends ClackLogService {
  readonly calls: ClackLogCall[];
  readonly logs: {
    readonly info: string[];
    readonly warn: string[];
    readonly error: string[];
    readonly success: string[];
    readonly message: string[];
  };
}

export function makeClackLogTestLayer(): [Layer.Layer<ClackLog>, MockClackLogService] {
  const calls: ClackLogCall[] = [];
  const logs = {
    info: [] as string[],
    warn: [] as string[],
    error: [] as string[],
    success: [] as string[],
    message: [] as string[],
  };

  const record =
    (method: string) =>
    (...args: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        calls.push({ method, args });
      });

  const mockService: MockClackLogService = {
    calls,
    logs,
    message: (message) =>
      Effect.zipRight(
        Effect.sync(() => {
          logs.message.push(message);
        }),
        record("message")(message),
      ),
    info: (message) =>
      Effect.zipRight(
        Effect.sync(() => {
          logs.info.push(message);
        }),
        record("info")(message),
      ),
    success: (message) =>
      Effect.zipRight(
        Effect.sync(() => {
          logs.success.push(message);
        }),
        record("success")(message),
      ),
    step: (message) => record("step")(message),
    warn: (message) =>
      Effect.zipRight(
        Effect.sync(() => {
          logs.warn.push(message);
        }),
        record("warn")(message),
      ),
    error: (message) =>
      Effect.zipRight(
        Effect.sync(() => {
          logs.error.push(message);
        }),
        record("error")(message),
      ),
    intro: (title) => record("intro")(title),
    outro: (message) => record("outro")(message),
    cancel: (message) => record("cancel")(message),
    note: (message, title) => record("note")(message, title),
    box: (message, title, opts) => record("box")(message, title, opts),
  };

  const layer = Layer.succeed(ClackLog, mockService);
  return [layer, mockService];
}
