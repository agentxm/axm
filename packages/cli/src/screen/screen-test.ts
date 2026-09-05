import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";

import { subscribeLossless, type OperationEvent } from "@agentxm/workspace-operations";

import type { Doc } from "./doc.js";
import { paintText, type PaintStyle } from "./paint-text.js";
import { Screen, type ResultOptions, type ScreenLogRecord } from "./screen.js";

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
  /** Every lifecycle event observed, in order, across observed operations. */
  readonly events: Array<OperationEvent>;
  readonly logs: Array<ScreenLogRecord>;
}

const emptyState = (): TestScreenState => ({
  results: [],
  suggestions: [],
  docs: [],
  events: [],
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
    observe: (lifecycle) =>
      subscribeLossless(lifecycle, (event) => Effect.sync(() => void state.events.push(event))),
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

/** Labels of the units an observed operation started, in order. */
export const startedUnitLabels = (events: ReadonlyArray<OperationEvent>): ReadonlyArray<string> =>
  events.flatMap((event) => (event._tag === "UnitStarted" ? [event.label] : []));
