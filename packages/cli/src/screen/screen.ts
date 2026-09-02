import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { makeJsonSuccessEnvelope } from "../cli-runtime/json-envelope.js";
import type { Doc } from "./doc.js";
import { plain } from "./doc.js";
import { Frame, taskEndForCause, type FrameTaskHandle } from "./frame.js";
import {
  encodeMachineEvent,
  instructionEvent,
  logEvent,
  progressEvent,
  suggestionEvent,
} from "./machine-events.js";
import { paintText } from "./paint-text.js";
import { OutputStreams } from "./streams.js";

export interface TaskDetail {
  readonly unit?: string;
  readonly state?: string;
  readonly reason?: string;
  readonly atMs?: number;
}

export interface TaskHandle {
  readonly update: (label: string, detail?: TaskDetail) => Effect.Effect<void>;
  readonly progress: (done: number, total: number) => Effect.Effect<void>;
  readonly child: (label: string) => Effect.Effect<TaskHandle>;
}

export interface TaskOptions<A> {
  readonly phase?: string;
  readonly successMessage?: string | ((value: A) => string);
  readonly failureMessage?: string;
}

export interface ResultOptions {
  readonly ok?: boolean;
  readonly summary?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  readonly withoutSuggestions?: boolean;
}

export interface ScreenLogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  readonly message: string;
}

export interface ScreenFacts {
  readonly columns: number;
  readonly colors: boolean;
  readonly animate: boolean;
}

export class Screen extends ServiceMap.Service<
  Screen,
  {
    readonly result: (doc: Doc) => Effect.Effect<void>;
    readonly note: (doc: Doc, options?: { readonly persistent?: boolean }) => Effect.Effect<void>;
    readonly document: <S extends Schema.Top>(
      data: Schema.Schema.Type<S>,
      schema: S,
      options?: ResultOptions,
    ) => Effect.Effect<boolean, never, S["EncodingServices"]>;
    readonly task: <A, E, R>(
      label: string,
      body: (handle: TaskHandle) => Effect.Effect<A, E, R>,
      options?: TaskOptions<A>,
    ) => Effect.Effect<A, E, R>;
    readonly log: (record: ScreenLogRecord) => Effect.Effect<void>;
    readonly prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
    readonly facts: Effect.Effect<ScreenFacts>;
    readonly settle: Effect.Effect<void>;
  }
>()("axm.sh/screen/Screen") {}

const ensureNewline = (content: string): string =>
  content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;

const visibleSuggestions = (options: ResultOptions | undefined): ReadonlyArray<SuggestedAction> =>
  options?.withoutSuggestions === true ? [] : (options?.suggestions ?? []);

const encodeJson = <S extends Schema.Top>(data: Schema.Schema.Type<S>, schema: S) =>
  // Screen documents are constructed from the schema's Type. Failure proves a
  // violated application invariant rather than a recoverable user error.
  // eslint-disable-next-line no-restricted-syntax -- schema/type mismatch is a defect.
  Schema.encodeEffect(schema)(data).pipe(Effect.orDie);

const successMessage = <A>(label: string, value: A, options?: TaskOptions<A>): string => {
  if (typeof options?.successMessage === "function") return options.successMessage(value);
  return options?.successMessage ?? label;
};

export const ScreenLive = (options: {
  readonly colors: boolean;
  readonly animate: boolean;
}): Layer.Layer<Screen, never, Frame | OutputStreams> =>
  Layer.effect(
    Screen,
    Effect.gen(function* () {
      const frame = yield* Frame;
      const streams = yield* OutputStreams;

      const render = (doc: Doc) =>
        Effect.flatMap(streams.facts, (facts) =>
          Effect.succeed(
            ensureNewline(
              paintText(doc, {
                width: facts.columns,
                colors: options.colors,
              }).join("\n"),
            ),
          ),
        );

      const makeTaskHandle = (task: FrameTaskHandle): TaskHandle => ({
        update: (label) => task.update(label),
        progress: task.progress,
        child: (label) => Effect.map(task.child(label), makeTaskHandle),
      });

      return {
        result: (doc) => Effect.flatMap(render(doc), frame.stdout),
        note: (doc) => Effect.flatMap(render(doc), frame.stderr),
        document: () => Effect.succeed(false),
        task: <A, E, R>(
          label: string,
          body: (handle: TaskHandle) => Effect.Effect<A, E, R>,
          taskOptions?: TaskOptions<A>,
        ) =>
          frame.task(label).pipe(
            Effect.flatMap((task) =>
              Effect.interruptible(body(makeTaskHandle(task))).pipe(
                Effect.matchCauseEffect({
                  onFailure: (cause) =>
                    task
                      .end(taskEndForCause(cause), taskOptions?.failureMessage ?? label)
                      .pipe(Effect.andThen(Effect.failCause(cause))),
                  onSuccess: (value) =>
                    task
                      .end("success", successMessage(label, value, taskOptions))
                      .pipe(Effect.as(value)),
                }),
                Effect.uninterruptible,
              ),
            ),
          ),
        log: (record) =>
          Effect.flatMap(
            render([{ _tag: "paragraph", tone: "dim", text: record.message }]),
            frame.stderr,
          ),
        prompt: frame.prompt,
        facts: Effect.map(streams.facts, (facts) => ({
          columns: facts.columns,
          colors: options.colors,
          animate: options.animate,
        })),
        settle: frame.settle,
      };
    }),
  );

const logLevel = (level: ScreenLogRecord["level"]): "info" | "warn" | "error" => {
  if (level === "warn") return "warn";
  if (level === "error" || level === "fatal") return "error";
  return "info";
};

export const ScreenMachine = (options?: {
  readonly quiet?: boolean;
}): Layer.Layer<Screen, never, OutputStreams> =>
  Layer.effect(
    Screen,
    Effect.gen(function* () {
      const streams = yield* OutputStreams;
      const quiet = options?.quiet === true;
      const emit = (event: Parameters<typeof encodeMachineEvent>[0]) =>
        streams.stderr(encodeMachineEvent(event));

      const machineHandle = (phase: string, labelRef: { value: string }): TaskHandle => ({
        update: (label, detail) => {
          labelRef.value = label;
          return quiet ? Effect.void : emit(progressEvent(phase, -1, label, detail));
        },
        progress: (done, total) =>
          quiet
            ? Effect.void
            : emit(
                progressEvent(
                  phase,
                  total <= 0 ? 0 : Math.round((Math.max(0, done) / total) * 100),
                  labelRef.value,
                ),
              ),
        child: (label) => Effect.succeed(machineHandle(phase, { value: label })),
      });

      return {
        result: () => Effect.void,
        note: (doc, noteOptions) =>
          noteOptions?.persistent === true
            ? emit(
                instructionEvent(
                  doc.map((node) => ("text" in node ? plain(node.text) : "")).join("\n"),
                ),
              )
            : Effect.void,
        document: <S extends Schema.Top>(
          data: Schema.Schema.Type<S>,
          schema: S,
          resultOptions?: ResultOptions,
        ) =>
          encodeJson(data, schema).pipe(
            Effect.flatMap((encoded) =>
              streams.stdout(
                `${JSON.stringify(
                  makeJsonSuccessEnvelope({
                    payload: encoded,
                    ...(resultOptions?.ok === undefined ? {} : { ok: resultOptions.ok }),
                    ...(resultOptions?.summary === undefined
                      ? {}
                      : { summary: resultOptions.summary }),
                    suggestions: visibleSuggestions(resultOptions),
                  }),
                  null,
                  2,
                )}\n`,
              ),
            ),
            Effect.as(true),
          ),
        task: <A, E, R>(
          label: string,
          body: (handle: TaskHandle) => Effect.Effect<A, E, R>,
          taskOptions?: TaskOptions<A>,
        ) => {
          const phase = taskOptions?.phase ?? "work";
          const labelRef = { value: label };
          const start = quiet ? Effect.void : emit(progressEvent(phase, 0, label));
          return start.pipe(
            Effect.andThen(body(machineHandle(phase, labelRef))),
            Effect.matchCauseEffect({
              onFailure: (cause) =>
                (quiet
                  ? Effect.void
                  : emit(
                      progressEvent(
                        phase,
                        -1,
                        Cause.hasInterruptsOnly(cause)
                          ? "Cancelled"
                          : (taskOptions?.failureMessage ?? labelRef.value),
                      ),
                    )
                ).pipe(Effect.andThen(Effect.failCause(cause))),
              onSuccess: (value) =>
                (quiet
                  ? Effect.void
                  : emit(
                      progressEvent(phase, 100, successMessage(labelRef.value, value, taskOptions)),
                    )
                ).pipe(Effect.as(value)),
            }),
          );
        },
        log: (record) => emit(logEvent(logLevel(record.level), record.message)),
        prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
        facts: Effect.succeed({ columns: 80, colors: false, animate: false }),
        settle: Effect.void,
      };
    }),
  );

export const emitSuggestionEvents = (
  screen: typeof OutputStreams.Service,
  suggestions: ReadonlyArray<SuggestedAction>,
): Effect.Effect<void> =>
  Effect.forEach(
    suggestions,
    (suggestion) => screen.stderr(encodeMachineEvent(suggestionEvent(suggestion))),
    { concurrency: 1 },
  ).pipe(Effect.asVoid);
