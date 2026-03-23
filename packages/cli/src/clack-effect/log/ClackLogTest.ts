import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { ClackLog, type ClackBoxOptions } from "./service.js";

export interface ClackLogCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface ClackLogRecord {
  readonly calls: ReadonlyArray<ClackLogCall>;
  readonly logs: {
    readonly info: ReadonlyArray<string>;
    readonly warn: ReadonlyArray<string>;
    readonly error: ReadonlyArray<string>;
    readonly success: ReadonlyArray<string>;
    readonly message: ReadonlyArray<string>;
  };
}

export type MockClackLogService = ServiceMap.Service.Shape<typeof ClackLog> & {
  calls: Array<ClackLogCall>;
  logs: {
    info: Array<string>;
    warn: Array<string>;
    error: Array<string>;
    success: Array<string>;
    message: Array<string>;
  };
};

const emptyRecord: ClackLogRecord = {
  calls: [],
  logs: { info: [], warn: [], error: [], success: [], message: [] },
};

export class ClackLogTest extends ServiceMap.Service<
  ClackLogTest,
  {
    readonly ref: Ref.Ref<ClackLogRecord>;
    readonly get: Effect.Effect<ClackLogRecord>;
  }
>()("@axm.sh/cli/test/ClackLogTest") {}

const appendCall = (
  ref: Ref.Ref<ClackLogRecord>,
  method: string,
  args: ReadonlyArray<unknown>,
  logKey?: "info" | "warn" | "error" | "success" | "message",
) =>
  Ref.update(ref, (r) => ({
    calls: [...r.calls, { method, args }],
    logs: logKey ? { ...r.logs, [logKey]: [...r.logs[logKey], args[0] as string] } : r.logs,
  }));

export const makeClackLogTestLayer = (): readonly [
  Layer.Layer<ClackLog | ClackLogTest>,
  MockClackLogService,
] => {
  const mock: MockClackLogService = {
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
    box: (message, title?: string, opts?: ClackBoxOptions) =>
      Effect.sync(() => {
        mock.calls.push({ method: "box", args: [message, title, opts] });
      }),
  };

  const layer: Layer.Layer<ClackLog | ClackLogTest> = Layer.effectServices(
    Effect.gen(function* () {
      const ref = yield* Ref.make(emptyRecord);

      const service: ServiceMap.Service.Shape<typeof ClackLog> = {
        message: (message) =>
          Effect.andThen(mock.message(message), appendCall(ref, "message", [message], "message")),
        info: (message) =>
          Effect.andThen(mock.info(message), appendCall(ref, "info", [message], "info")),
        success: (message) =>
          Effect.andThen(mock.success(message), appendCall(ref, "success", [message], "success")),
        step: (message) => Effect.andThen(mock.step(message), appendCall(ref, "step", [message])),
        warn: (message) =>
          Effect.andThen(mock.warn(message), appendCall(ref, "warn", [message], "warn")),
        error: (message) =>
          Effect.andThen(mock.error(message), appendCall(ref, "error", [message], "error")),
        intro: (title) => Effect.andThen(mock.intro(title), appendCall(ref, "intro", [title])),
        outro: (message) =>
          Effect.andThen(mock.outro(message), appendCall(ref, "outro", [message])),
        cancel: (message) =>
          Effect.andThen(mock.cancel(message), appendCall(ref, "cancel", [message])),
        note: (message, title) =>
          Effect.andThen(mock.note(message, title), appendCall(ref, "note", [message, title])),
        box: (message, title, opts) =>
          Effect.andThen(
            mock.box(message, title, opts),
            appendCall(ref, "box", [message, title, opts]),
          ),
      };

      const test: ServiceMap.Service.Shape<typeof ClackLogTest> = {
        ref,
        get: Ref.get(ref),
      };

      return ServiceMap.empty().pipe(
        ServiceMap.add(ClackLog, service),
        ServiceMap.add(ClackLogTest, test),
      );
    }),
  );

  return [layer, mock] as const;
};

export const [ClackLogTestLayer] = makeClackLogTestLayer();
