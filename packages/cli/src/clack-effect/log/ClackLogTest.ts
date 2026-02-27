import * as Context from "effect/Context";
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

export type MockClackLogService = Context.Tag.Service<typeof ClackLog> & {
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

export class ClackLogTest extends Context.Tag("@axm.sh/cli/test/ClackLogTest")<
  ClackLogTest,
  {
    readonly ref: Ref.Ref<ClackLogRecord>;
    readonly get: Effect.Effect<ClackLogRecord>;
  }
>() {}

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

  const layer: Layer.Layer<ClackLog | ClackLogTest> = Layer.effectContext(
    Effect.gen(function* () {
      const ref = yield* Ref.make(emptyRecord);

      const service: Context.Tag.Service<typeof ClackLog> = {
        message: (message) =>
          Effect.zipRight(mock.message(message), appendCall(ref, "message", [message], "message")),
        info: (message) =>
          Effect.zipRight(mock.info(message), appendCall(ref, "info", [message], "info")),
        success: (message) =>
          Effect.zipRight(mock.success(message), appendCall(ref, "success", [message], "success")),
        step: (message) => Effect.zipRight(mock.step(message), appendCall(ref, "step", [message])),
        warn: (message) =>
          Effect.zipRight(mock.warn(message), appendCall(ref, "warn", [message], "warn")),
        error: (message) =>
          Effect.zipRight(mock.error(message), appendCall(ref, "error", [message], "error")),
        intro: (title) => Effect.zipRight(mock.intro(title), appendCall(ref, "intro", [title])),
        outro: (message) =>
          Effect.zipRight(mock.outro(message), appendCall(ref, "outro", [message])),
        cancel: (message) =>
          Effect.zipRight(mock.cancel(message), appendCall(ref, "cancel", [message])),
        note: (message, title) =>
          Effect.zipRight(mock.note(message, title), appendCall(ref, "note", [message, title])),
        box: (message, title, opts) =>
          Effect.zipRight(
            mock.box(message, title, opts),
            appendCall(ref, "box", [message, title, opts]),
          ),
      };

      const test: Context.Tag.Service<typeof ClackLogTest> = {
        ref,
        get: Ref.get(ref),
      };

      return Context.empty().pipe(Context.add(ClackLog, service), Context.add(ClackLogTest, test));
    }),
  );

  return [layer, mock] as const;
};

export const [ClackLogTestLayer] = makeClackLogTestLayer();
