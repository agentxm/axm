import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  CliRenderer,
  type BreadcrumbOptions,
  type DetailOptions,
  type ListPayload,
  type LogLevel,
  type ProgressConfig,
  type ProgressHandle,
  type SpinnerHandle,
  type SpinnerOptions,
  type SuccessOptions,
  type TableView,
  type TreePayload,
  type TaskLogConfig,
  type TaskLogGroupHandle,
  type TaskLogHandle,
} from "./cli-renderer.js";
import type { Breadcrumb } from "../cli-runtime/breadcrumb.js";
import { makeJsonSuccessEnvelope } from "../cli-runtime/json-envelope.js";

// ---------------------------------------------------------------------------
// Helpers — NDJSON event emission to stderr
// ---------------------------------------------------------------------------

const emitStderrEvent = (event: Record<string, unknown>) =>
  Effect.sync(() => {
    process.stderr.write(JSON.stringify(event) + "\n");
  });

const emitLogEvent = (level: "info" | "warn" | "error", message: string) =>
  emitStderrEvent({ type: "log", level, message });

const levelToLogLevel = (level: LogLevel): "info" | "warn" | "error" => {
  if (level === "warn") return "warn";
  if (level === "error") return "error";
  return "info";
};

const normalizeBreadcrumbs = (
  crumbs: ReadonlyArray<Breadcrumb> | undefined,
  options?: BreadcrumbOptions,
): ReadonlyArray<Breadcrumb> =>
  options?.withoutBreadcrumbs === true || crumbs === undefined || crumbs.length === 0 ? [] : crumbs;

const emitBreadcrumbs = (
  crumbs: ReadonlyArray<Breadcrumb> | undefined,
  options?: BreadcrumbOptions,
) =>
  Effect.forEach(
    normalizeBreadcrumbs(crumbs, options),
    (crumb) =>
      emitStderrEvent({
        type: "breadcrumb",
        description: crumb.description,
        ...(crumb.cmd !== undefined ? { cmd: crumb.cmd } : {}),
        ...(crumb.url !== undefined ? { url: crumb.url } : {}),
      }),
    { concurrency: 1 },
  ).pipe(Effect.asVoid);

const makeSuccessEnvelope = (data: unknown, options: SuccessOptions | undefined) => {
  const summary = options?.summary;
  return makeJsonSuccessEnvelope({
    payload: data,
    ...(summary !== undefined ? { summary } : {}),
    breadcrumbs: normalizeBreadcrumbs(options?.breadcrumbs, options),
  });
};

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

const taskCompletionMessage = (title: string, result: string | void): string => {
  if (result === undefined || result.length === 0 || result === title) {
    return title;
  }
  if (result.startsWith(`${title}:`) || result.startsWith(`${title} `)) {
    return result;
  }
  return `${title}: ${result}`;
};

// ---------------------------------------------------------------------------
// Stdout helpers
// ---------------------------------------------------------------------------

const writeStdout = (content: string) =>
  Effect.sync(() => {
    process.stdout.write(content);
  });

const writeStdoutLine = (content: string) =>
  Effect.sync(() => {
    process.stdout.write(content + "\n");
  });

const encodeJson = <S extends Schema.Top>(data: Schema.Schema.Type<S>, schema: S) =>
  Schema.encodeEffect(schema)(data).pipe(Effect.orDie);

// ---------------------------------------------------------------------------
// MachineRenderer — NDJSON chrome on stderr, JSON data on stdout
// ---------------------------------------------------------------------------

export const MachineRenderer = (): Layer.Layer<CliRenderer> => {
  const machineWithSpinner = <A, E, R>(
    message: string,
    f: (handle: SpinnerHandle) => Effect.Effect<A, E, R>,
    options?: SpinnerOptions<A>,
  ): Effect.Effect<A, E, R> => {
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
    info: () => Effect.void,
    success: (_message, options?: SuccessOptions) => emitBreadcrumbs(options?.breadcrumbs, options),
    step: () => Effect.void,
    warn: (message) => emitLogEvent("warn", message),
    error: (message, options?: BreadcrumbOptions) =>
      emitLogEvent("error", message).pipe(
        Effect.andThen(emitBreadcrumbs(options?.breadcrumbs, options)),
      ),
    breadcrumbs: emitBreadcrumbs,
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
      emitStderrEvent({
        type: "progress",
        phase: "start",
        percent: 0,
        message: message ?? "",
      }).pipe(Effect.as(makeStreamSpinnerHandle("start"))),
    withSpinner: machineWithSpinner,
    progress: (config, message) => {
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
      } satisfies TaskLogHandle),
    withTaskLog: <A, E, R>(
      config: TaskLogConfig,
      f: (handle: TaskLogHandle) => Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E, R> => {
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
        Effect.tap(() => emitBreadcrumbs(payload.breadcrumbs, payload)),
        Effect.map(
          ({
            withoutBreadcrumbs: _withoutBreadcrumbs,
            breadcrumbs: _breadcrumbs,
            summary: _summary,
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
          Effect.tap(() => emitBreadcrumbs(options?.breadcrumbs, options)),
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
          Effect.tap(() => emitBreadcrumbs(payload.breadcrumbs, payload)),
          Effect.map(
            ({
              withoutBreadcrumbs: _withoutBreadcrumbs,
              breadcrumbs: _breadcrumbs,
              summary: _summary,
              ...data
            }) => makeSuccessEnvelope(data, payload),
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
      options?: SuccessOptions,
    ) =>
      encodeJson(data, schema).pipe(
        Effect.tap(() => emitBreadcrumbs(options?.breadcrumbs, options)),
        Effect.map((encoded) => makeSuccessEnvelope(encoded, options)),
        Effect.flatMap((encoded) => writeStdoutLine(JSON.stringify(encoded, null, 2))),
        Effect.as(true),
      ),
    resultStream: <S extends Schema.Top>(stream: Stream.Stream<Schema.Schema.Type<S>>, schema: S) =>
      stream.pipe(
        Stream.mapEffect((item) =>
          encodeJson(item, schema).pipe(
            Effect.flatMap((encoded) => writeStdoutLine(JSON.stringify(encoded))),
          ),
        ),
        Stream.runDrain,
        Effect.as(true),
      ),

    // Both modes (stdout)
    json: (data) => writeStdoutLine(JSON.stringify(data, null, 2)),
    raw: (content) => writeStdout(content),
  });
};
