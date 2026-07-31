import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  CliRenderer,
  type SuggestionOptions,
  type DetailOptions,
  type ListPayload,
  type LogLevel,
  type ProgressConfig,
  type ProgressHandle,
  type SpinnerHandle,
  type SpinnerOptions,
  type SuccessOptions,
  type ResultOptions,
  type TableView,
  type TreePayload,
  type TaskLogConfig,
  type TaskLogGroupHandle,
  type TaskLogHandle,
} from "./cli-renderer.js";
import type { SuggestedAction } from "../cli-runtime/suggested-action.js";
import { makeJsonSuccessEnvelope } from "../cli-runtime/json-envelope.js";
import { redactSensitiveValue } from "../app-error/secret-redaction.js";
import {
  normalizeSuggestions,
  taskCompletionMessage,
  writeStdout,
  writeStdoutLine,
} from "./renderer-helpers.js";

// ---------------------------------------------------------------------------
// Helpers — NDJSON event emission to stderr
// ---------------------------------------------------------------------------

const emitStderrEvent = (event: Record<string, unknown>) =>
  Effect.sync(() => {
    process.stderr.write(JSON.stringify(redactSensitiveValue(event)) + "\n");
  });

const emitLogEvent = (level: "info" | "warn" | "error", message: string) =>
  emitStderrEvent({ type: "log", level, message });

const levelToLogLevel = (level: LogLevel): "info" | "warn" | "error" => {
  if (level === "warn") return "warn";
  if (level === "error") return "error";
  return "info";
};

const emitSuggestions = (
  suggestions: ReadonlyArray<SuggestedAction> | undefined,
  options?: SuggestionOptions,
) =>
  Effect.forEach(
    normalizeSuggestions(suggestions, options),
    (suggestion) =>
      emitStderrEvent({
        type: "suggestion",
        description: suggestion.description,
        ...(suggestion.cmd !== undefined ? { cmd: suggestion.cmd } : {}),
        ...(suggestion.url !== undefined ? { url: suggestion.url } : {}),
      }),
    { concurrency: 1 },
  ).pipe(Effect.asVoid);

const makeResultEnvelope = (data: unknown, options: ResultOptions | undefined) => {
  const summary = options?.summary;
  return makeJsonSuccessEnvelope({
    payload: data,
    ...(options?.ok === undefined ? {} : { ok: options.ok }),
    ...(summary !== undefined ? { summary } : {}),
    suggestions: normalizeSuggestions(options?.suggestions, options),
  });
};

const makeSuccessEnvelope = (data: unknown, options: SuccessOptions | undefined) =>
  makeResultEnvelope(data, options);

// ---------------------------------------------------------------------------
// Noop handles for machine mode
// ---------------------------------------------------------------------------

const noopSpinnerHandle: SpinnerHandle = {
  stop: () => Effect.void,
  update: () => Effect.void,
  cancel: () => Effect.void,
  error: () => Effect.void,
  clear: () => Effect.void,
};

const noopProgressHandle: ProgressHandle = {
  ...noopSpinnerHandle,
  advance: () => Effect.void,
};

const quietTaskLogGroupHandle: TaskLogGroupHandle = {
  message: () => Effect.void,
  error: () => Effect.void,
  success: () => Effect.void,
};

const quietTaskLogHandle: TaskLogHandle = {
  message: () => Effect.void,
  group: () => Effect.succeed(quietTaskLogGroupHandle),
  error: () => Effect.void,
  success: () => Effect.void,
};

// ---------------------------------------------------------------------------
// NDJSON-emitting handles for machine mode
// ---------------------------------------------------------------------------

const makeStreamSpinnerHandle = (phase: string): SpinnerHandle => ({
  stop: (message) =>
    message ? emitStderrEvent({ type: "progress", phase, percent: 100, message }) : Effect.void,
  update: (message) =>
    message ? emitStderrEvent({ type: "progress", phase, percent: -1, message }) : Effect.void,
  cancel: (message) =>
    emitStderrEvent({
      type: "progress",
      phase,
      percent: -1,
      message: message ?? "Cancelled",
    }),
  error: (message) => emitLogEvent("error", message ?? "Error"),
  clear: () => Effect.void,
});

const makeStreamProgressHandle = (
  phase: string,
  rawMax: number,
  initialMessage?: string,
): ProgressHandle => {
  const max = Math.max(rawMax, 1);
  let current = 0;
  let currentMessage = initialMessage ?? "";
  return {
    stop: (message) => {
      currentMessage = message ?? currentMessage;
      return currentMessage
        ? emitStderrEvent({ type: "progress", phase, percent: 100, message: currentMessage })
        : Effect.void;
    },
    update: (message) => (
      (currentMessage = message ?? currentMessage),
      currentMessage
        ? emitStderrEvent({
            type: "progress",
            phase,
            percent: Math.round((current / max) * 100),
            message: currentMessage,
          })
        : Effect.void
    ),
    cancel: (message) =>
      emitStderrEvent({
        type: "progress",
        phase,
        percent: -1,
        message: message ?? "Cancelled",
      }),
    error: (message) => emitLogEvent("error", message ?? "Error"),
    clear: () => Effect.void,
    advance: (step, message) => {
      current = Math.min(current + (step ?? 1), max);
      currentMessage = message ?? currentMessage;
      const percent = Math.round((current / max) * 100);
      return currentMessage
        ? emitStderrEvent({ type: "progress", phase, percent, message: currentMessage })
        : Effect.void;
    },
  };
};

const encodeJson = <S extends Schema.Top>(data: Schema.Schema.Type<S>, schema: S) =>
  Schema.encodeEffect(schema)(data).pipe(Effect.orDie);

// ---------------------------------------------------------------------------
// MachineRenderer — NDJSON chrome on stderr, JSON data on stdout
// ---------------------------------------------------------------------------

export const MachineRenderer = (options?: {
  readonly quiet?: boolean;
}): Layer.Layer<CliRenderer> => {
  const quiet = options?.quiet === true;
  const machineWithSpinner = <A, E, R>(
    message: string,
    f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
    options?: SpinnerOptions<A>,
  ): Effect.Effect<A, E, R> => {
    if (quiet) return f(noopSpinnerHandle);
    const handle = makeStreamSpinnerHandle("work");
    const failureMessage = options?.failureMessage;
    return emitStderrEvent({
      type: "progress",
      phase: "work",
      percent: 0,
      message,
    }).pipe(
      Effect.andThen(f(handle)),
      Effect.matchCauseEffect({
        onFailure: (cause) => {
          const failEvent = Cause.hasInterruptsOnly(cause)
            ? emitStderrEvent({
                type: "progress",
                phase: "work",
                percent: -1,
                message: "Cancelled",
              })
            : emitStderrEvent({
                type: "progress",
                phase: "work",
                percent: -1,
                message: failureMessage ?? message,
              });
          return failEvent.pipe(Effect.andThen(Effect.failCause(cause)));
        },
        onSuccess: (a) => {
          const successMessage =
            typeof options?.successMessage === "function"
              ? options.successMessage(a)
              : typeof options?.successMessage === "string"
                ? options.successMessage
                : message;
          return emitStderrEvent({
            type: "progress",
            phase: "work",
            percent: 100,
            message: successMessage,
          }).pipe(Effect.as(a));
        },
      }),
    );
  };

  return Layer.succeed(CliRenderer, {
    // Chrome (stderr) — signal-only NDJSON events
    intro: () => Effect.void,
    outro: () => Effect.void,
    message: () => Effect.void,
    instruction: (message) => emitStderrEvent({ type: "instruction", message }),
    diagnostic: () => Effect.void,
    diagnosticTable: <T extends object>(
      _items: ReadonlyArray<T>,
      _view: TableView<T>,
      _caption?: string,
    ) => Effect.void,
    info: () => Effect.void,
    success: () => Effect.void,
    step: () => Effect.void,
    warn: (message) => emitLogEvent("warn", message),
    error: (message, options?: SuggestionOptions) =>
      emitLogEvent("error", message).pipe(
        Effect.andThen(emitSuggestions(options?.suggestions, options)),
      ),
    suggestions: emitSuggestions,
    cancel: (message) => (message ? emitLogEvent("info", message) : Effect.void),
    note: () => Effect.void,
    box: () => Effect.void,
    streamLog: <E, R>(level: LogLevel, stream: Stream.Stream<string, E, R>) =>
      Stream.runCollect(stream).pipe(
        Effect.flatMap((chunks) => {
          const message = Array.from(chunks).join("");
          return emitLogEvent(levelToLogLevel(level), message);
        }),
      ),

    // Activity — emit NDJSON progress events to stderr
    spinner: (message) =>
      quiet
        ? Effect.succeed(noopSpinnerHandle)
        : emitStderrEvent({
            type: "progress",
            phase: "start",
            percent: 0,
            message: message ?? "",
          }).pipe(Effect.as(makeStreamSpinnerHandle("start"))),
    withSpinner: machineWithSpinner,
    progress: (config, message) => {
      if (quiet) return Effect.succeed(noopProgressHandle);
      const max = config.max ?? 100;
      if (message) {
        return emitStderrEvent({
          type: "progress",
          phase: "progress",
          percent: 0,
          message,
        }).pipe(Effect.as(makeStreamProgressHandle("progress", max, message)));
      }
      return Effect.succeed(noopProgressHandle);
    },
    withProgress: <A, E, R>(
      config: ProgressConfig,
      message: string,
      f: (handle: ProgressHandle) => Effect.Effect<A, E, R>,
      stopMessage?: string,
    ): Effect.Effect<A, E, R> => {
      if (quiet) return f(noopProgressHandle);
      const max = config.max ?? 100;
      const handle = makeStreamProgressHandle("progress", max, message);
      return emitStderrEvent({
        type: "progress",
        phase: "progress",
        percent: 0,
        message,
      }).pipe(
        Effect.andThen(f(handle)),
        Effect.tap(() => handle.stop(stopMessage)),
      );
    },
    taskLog: (config: TaskLogConfig) =>
      Effect.succeed({
        message: (msg: string) => emitLogEvent("info", `[${config.title}] ${msg}`),
        group: (name: string) =>
          Effect.succeed({
            message: (msg: string) => emitLogEvent("info", `[${name}] ${msg}`),
            error: (msg: string) => emitLogEvent("error", `[${name}] ${msg}`),
            success: (msg: string) => emitLogEvent("info", `[${name}] ${msg}`),
          } satisfies TaskLogGroupHandle),
        error: (msg: string) => emitLogEvent("error", `[${config.title}] ${msg}`),
        success: (msg: string) => emitLogEvent("info", `[${config.title}] ${msg}`),
      } satisfies TaskLogHandle).pipe(
        Effect.map((handle) => (quiet ? quietTaskLogHandle : handle)),
      ),
    withTaskLog: <A, E, R>(
      config: TaskLogConfig,
      f: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E, R> => {
      if (quiet) return f(quietTaskLogHandle);
      const handle: TaskLogHandle = {
        message: (msg: string) => emitLogEvent("info", `[${config.title}] ${msg}`),
        group: (name: string) =>
          Effect.succeed({
            message: (msg: string) => emitLogEvent("info", `[${name}] ${msg}`),
            error: (msg: string) => emitLogEvent("error", `[${name}] ${msg}`),
            success: (msg: string) => emitLogEvent("info", `[${name}] ${msg}`),
          } satisfies TaskLogGroupHandle),
        error: (msg: string) => emitLogEvent("error", `[${config.title}] ${msg}`),
        success: (msg: string) => emitLogEvent("info", `[${config.title}] ${msg}`),
      };
      return f(handle);
    },
    runTasks: <E, R>(
      tasks: ReadonlyArray<{
        readonly title: string;
        readonly task: (
          message: (msg: string) => Effect.Effect<void>,
        ) => Effect.Effect<string | void, E, R>;
        readonly enabled?: boolean;
      }>,
    ) =>
      Effect.forEach(
        tasks.filter((t) => t.enabled !== false),
        (task) =>
          machineWithSpinner(task.title, (handle) => task.task((msg) => handle.update(msg)), {
            successMessage: (result) => taskCompletionMessage(task.title, result),
          }),
        { concurrency: 1 },
      ).pipe(Effect.asVoid),

    // Data display — no-ops in machine mode
    table: <T extends object>(_items: ReadonlyArray<T>, _view: TableView<T>, _caption?: string) =>
      Effect.void,
    list: <T extends object>(_entity: string, payload: ListPayload<T>) =>
      Effect.succeed(payload).pipe(
        Effect.map(
          ({
            withoutSuggestions: _withoutSuggestions,
            suggestions: _suggestions,
            summary: _summary,
            emptyMessage: _emptyMessage,
            ...data
          }) => makeSuccessEnvelope(data, payload),
        ),
        Effect.flatMap((encoded) => writeStdoutLine(JSON.stringify(encoded, null, 2))),
        Effect.as(true),
      ),
    // Assertion needed: function implements the service's overloaded detail signature.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    detail: ((first: unknown, second: unknown, third?: unknown) => {
      if (typeof first === "string") {
        // Assertion needed: overloaded renderer call carries options in the third argument.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const options = third as DetailOptions | undefined;
        return Effect.succeed(second).pipe(
          Effect.map((encoded) => makeSuccessEnvelope(encoded, options)),
          Effect.flatMap((encoded) => writeStdoutLine(JSON.stringify(encoded, null, 2))),
          Effect.as(true),
        );
      }
      return Effect.void;
    }) as typeof CliRenderer.Service.detail,
    // Assertion needed: function implements the service's overloaded tree signature.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    tree: ((first: unknown, second: unknown) => {
      if (typeof first === "string") {
        // Assertion needed: overloaded renderer call carries tree payload in the second argument.
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const payload = second as TreePayload<object>;
        return Effect.succeed(payload).pipe(
          Effect.map(
            ({
              withoutSuggestions: _withoutSuggestions,
              suggestions: _suggestions,
              summary: _summary,
              ...data
            }) => makeResultEnvelope(data, payload),
          ),
          Effect.flatMap((encoded) => writeStdoutLine(JSON.stringify(encoded, null, 2))),
          Effect.as(true),
        );
      }
      return Effect.void;
    }) as typeof CliRenderer.Service.tree,

    // Machine data output (stdout)
    result: <S extends Schema.Top>(
      data: Schema.Schema.Type<S>,
      schema: S,
      options?: ResultOptions,
    ) =>
      encodeJson(data, schema).pipe(
        Effect.map((encoded) => makeResultEnvelope(encoded, options)),
        Effect.flatMap((encoded) => writeStdoutLine(JSON.stringify(encoded, null, 2))),
        Effect.as(true),
      ),

    // Both modes (stdout)
    json: (data) => writeStdoutLine(JSON.stringify(data, null, 2)),
    raw: (content) => writeStdout(content),
    markdown: (content) => writeStdout(content),
  });
};
