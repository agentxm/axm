import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";

import type { Doc } from "./doc.js";
import { paintText, type PaintStyle } from "./paint-text.js";
import {
  Screen,
  type ResultOptions,
  type ScreenLogRecord,
  type TaskDetail,
  type TaskHandle,
  type TaskOptions,
} from "./screen.js";

export interface TestScreenState {
  readonly results: Array<{
    readonly data: unknown;
    readonly schema: Option.Option<Schema.Top>;
    readonly ok?: boolean;
  }>;
  readonly suggestions: Array<unknown>;
  readonly docs: Array<{
    readonly channel: "stdout" | "stderr";
    readonly doc: Doc;
    readonly persistent: boolean;
  }>;
  readonly tasks: Array<{
    readonly label: string;
    readonly updates: Array<{ readonly label: string; readonly detail?: TaskDetail }>;
    readonly end: Array<"success" | "failed" | "cancelled">;
  }>;
  readonly logs: Array<ScreenLogRecord>;
}

const emptyState = (): TestScreenState => ({
  results: [],
  suggestions: [],
  docs: [],
  tasks: [],
  logs: [],
});

export const makeTestScreen = (
  documentResult = false,
): {
  readonly layer: Layer.Layer<Screen>;
  readonly state: TestScreenState;
} => {
  const state = emptyState();
  const layer = Layer.succeed(Screen, {
    result: (doc) =>
      Effect.sync(() => void state.docs.push({ channel: "stdout", doc, persistent: false })),
    note: (doc, options) =>
      Effect.sync(
        () =>
          void state.docs.push({
            channel: "stderr",
            doc,
            persistent: options?.persistent === true,
          }),
      ),
    document: <S extends Schema.Top>(
      data: Schema.Schema.Type<S>,
      schema: S,
      options?: ResultOptions,
    ) =>
      Effect.sync(() => {
        state.results.push({
          data,
          schema: Option.some(schema),
          ...(options?.ok === undefined ? {} : { ok: options.ok }),
        });
        state.suggestions.push(...(options?.suggestions ?? []));
        return documentResult;
      }),
    task: <A, E, R>(
      label: string,
      body: (handle: TaskHandle) => Effect.Effect<A, E, R>,
      _options?: TaskOptions<A>,
    ) => {
      const record: TestScreenState["tasks"][number] = { label, updates: [], end: [] };
      state.tasks.push(record);
      const handle: TaskHandle = {
        update: (nextLabel, detail) =>
          Effect.sync(
            () =>
              void record.updates.push({
                label: nextLabel,
                ...(detail === undefined ? {} : { detail }),
              }),
          ),
        progress: (done, total) =>
          Effect.sync(
            () => void record.updates.push({ label, detail: { state: `${done}/${total}` } }),
          ),
        child: (childLabel) =>
          Effect.succeed({
            ...handle,
            update: (nextLabel) => handle.update(`${childLabel}: ${nextLabel}`),
          }),
      };
      return body(handle).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) =>
            Effect.sync(
              () => void record.end.push(Cause.hasInterruptsOnly(cause) ? "cancelled" : "failed"),
            ).pipe(Effect.andThen(Effect.failCause(cause))),
          onSuccess: (value) =>
            Effect.sync(() => void record.end.push("success")).pipe(Effect.as(value)),
        }),
      );
    },
    log: (record) => Effect.sync(() => void state.logs.push(record)),
    prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    facts: Effect.succeed({ columns: 80, colors: false, animate: false }),
    settle: Effect.void,
  });
  return { layer, state };
};

export const rendered = (
  state: TestScreenState,
  style: PaintStyle = { width: 80, colors: false },
): string => state.docs.flatMap((entry) => paintText(entry.doc, style)).join("\n");
