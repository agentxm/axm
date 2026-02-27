import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { ClackLog } from "./service.js";

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

export const ClackLogTestLayer: Layer.Layer<ClackLog | ClackLogTest> = Layer.effectContext(
  Effect.gen(function* () {
    const ref = yield* Ref.make(emptyRecord);

    const service: Context.Tag.Service<typeof ClackLog> = {
      message: (message) => appendCall(ref, "message", [message], "message"),
      info: (message) => appendCall(ref, "info", [message], "info"),
      success: (message) => appendCall(ref, "success", [message], "success"),
      step: (message) => appendCall(ref, "step", [message]),
      warn: (message) => appendCall(ref, "warn", [message], "warn"),
      error: (message) => appendCall(ref, "error", [message], "error"),
      intro: (title) => appendCall(ref, "intro", [title]),
      outro: (message) => appendCall(ref, "outro", [message]),
      cancel: (message) => appendCall(ref, "cancel", [message]),
      note: (message, title) => appendCall(ref, "note", [message, title]),
      box: (message, title, opts) => appendCall(ref, "box", [message, title, opts]),
    };

    const test: Context.Tag.Service<typeof ClackLogTest> = {
      ref,
      get: Ref.get(ref),
    };

    return Context.empty().pipe(Context.add(ClackLog, service), Context.add(ClackLogTest, test));
  }),
);
