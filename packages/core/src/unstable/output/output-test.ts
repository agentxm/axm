import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Schema from "effect/Schema";
import type * as ServiceMap from "effect/ServiceMap";
import * as Stream from "effect/Stream";
import { Output, type BoxOptions, type StreamLevel } from "./output.js";

export interface OutputCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export type MockOutputService = ServiceMap.Service.Shape<typeof Output> & {
  calls: Array<OutputCall>;
  logs: {
    info: Array<string>;
    warn: Array<string>;
    error: Array<string>;
    success: Array<string>;
    message: Array<string>;
  };
};

export const makeOutputTestLayer = (): readonly [Layer.Layer<Output>, MockOutputService] => {
  const mock: MockOutputService = {
    calls: [],
    logs: { info: [], warn: [], error: [], success: [], message: [] },
    message: (message) =>
      Effect.sync(() => {
        mock.calls.push({ method: "message", args: [message] });
        mock.logs.message.push(message);
      }),
    info: (message) =>
      Effect.sync(() => {
        mock.calls.push({ method: "info", args: [message] });
        mock.logs.info.push(message);
      }),
    success: (message) =>
      Effect.sync(() => {
        mock.calls.push({ method: "success", args: [message] });
        mock.logs.success.push(message);
      }),
    step: (message) =>
      Effect.sync(() => {
        mock.calls.push({ method: "step", args: [message] });
      }),
    warn: (message) =>
      Effect.sync(() => {
        mock.calls.push({ method: "warn", args: [message] });
        mock.logs.warn.push(message);
      }),
    error: (message) =>
      Effect.sync(() => {
        mock.calls.push({ method: "error", args: [message] });
        mock.logs.error.push(message);
      }),
    intro: (title) =>
      Effect.sync(() => {
        mock.calls.push({ method: "intro", args: [title] });
      }),
    outro: (message) =>
      Effect.sync(() => {
        mock.calls.push({ method: "outro", args: [message] });
      }),
    cancel: (message) =>
      Effect.sync(() => {
        mock.calls.push({ method: "cancel", args: [message] });
      }),
    note: (message, title) =>
      Effect.sync(() => {
        mock.calls.push({ method: "note", args: [message, title] });
      }),
    box: (message, title?: string, opts?: BoxOptions) =>
      Effect.sync(() => {
        mock.calls.push({ method: "box", args: [message, title, opts] });
      }),
    stream: <E, R>(level: StreamLevel, stream: Stream.Stream<string, E, R>) =>
      Stream.runCollect(stream).pipe(
        Effect.tap((chunks) =>
          Effect.sync(() => {
            const text = Array.from(chunks).join("");
            mock.calls.push({ method: "stream", args: [level, text] });
          }),
        ),
        Effect.asVoid,
      ),
    result: <A, I>(schema: Schema.Codec<A, I>, data: A, textRenderer: (data: A) => string) =>
      Effect.sync(() => {
        mock.calls.push({ method: "result", args: [schema, data, textRenderer] });
      }),
  };

  const layer = Layer.succeed(Output, mock);
  return [layer, mock] as const;
};
