import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackLog, type ClackLogService } from "./service.js";

export interface ClackLogCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface MockClackLogService extends ClackLogService {
  readonly calls: ClackLogCall[];
}

export function makeClackLogTestLayer(): [Layer.Layer<ClackLog>, MockClackLogService] {
  const calls: ClackLogCall[] = [];

  const record =
    (method: string) =>
    (...args: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        calls.push({ method, args });
      });

  const mockService: MockClackLogService = {
    calls,
    message: (message) => record("message")(message),
    info: (message) => record("info")(message),
    success: (message) => record("success")(message),
    step: (message) => record("step")(message),
    warn: (message) => record("warn")(message),
    error: (message) => record("error")(message),
    intro: (title) => record("intro")(title),
    outro: (message) => record("outro")(message),
    cancel: (message) => record("cancel")(message),
    note: (message, title) => record("note")(message, title),
    box: (message, title, opts) => record("box")(message, title, opts),
  };

  const layer = Layer.succeed(ClackLog, mockService);
  return [layer, mockService];
}
