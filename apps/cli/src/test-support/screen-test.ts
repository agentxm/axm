import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Schema from "effect/Schema";

import { subscribeLossless, type OperationEvent } from "@agentxm/workspace/transitions/planning";

import type { Doc } from "../screen/doc.js";
import { paintText, type PaintStyle } from "../screen/paint-text.js";
import { Screen, type ResultOptions, type ScreenLogRecord } from "../screen/screen.js";
import { emptyAskScript, scriptedAsk, type AskScript } from "./scripted-ask.js";
import { emptyWaitScript, scriptedWait, type WaitScript } from "./scripted-wait.js";

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
  /** Every raw credential delivered to stdout, in order. */
  readonly credentials: Array<string>;
  /** Questions this screen was given, and the keys it answers the next ones with. */
  readonly script: AskScript;
  readonly waitScript: WaitScript;
}

const emptyState = (): TestScreenState => ({
  results: [],
  suggestions: [],
  docs: [],
  events: [],
  logs: [],
  credentials: [],
  script: emptyAskScript(),
  waitScript: emptyWaitScript(),
});

export const makeTestScreen = (options?: {
  readonly documentResult?: boolean;
  readonly interactive?: boolean;
  readonly stdoutIsTTY?: boolean;
}): {
  readonly layer: Layer.Layer<Screen>;
  readonly state: TestScreenState;
} => {
  const state = emptyState();
  const layer = Layer.succeed(Screen, {
    result: (doc) =>
      Effect.sync(() => void state.docs.push({ channel: "stdout", doc, persistent: false })),
    credential: (content) => Effect.sync(() => void state.credentials.push(content)),
    note: (doc) =>
      Effect.sync(
        () =>
          void state.docs.push({
            channel: "stderr",
            doc,
            persistent: false,
          }),
      ),
    instruction: (doc) =>
      Effect.sync(() => void state.docs.push({ channel: "stderr", doc, persistent: true })),
    document: <S extends Schema.Top>(
      data: Schema.Schema.Type<S>,
      schema: S,
      resultOptions?: ResultOptions,
    ) =>
      Effect.sync(() => {
        state.results.push({
          data,
          schema: Option.some(schema),
          ...(resultOptions?.ok === undefined ? {} : { ok: resultOptions.ok }),
        });
        state.suggestions.push(...(resultOptions?.suggestions ?? []));
        return options?.documentResult === true;
      }),
    observe: (lifecycle) =>
      subscribeLossless(lifecycle, (event) => Effect.sync(() => void state.events.push(event))),
    log: (record) => Effect.sync(() => void state.logs.push(record)),
    canAsk: Effect.succeed(options?.interactive !== false),
    ask: scriptedAsk(
      state.script,
      (doc) => state.docs.push({ channel: "stderr", doc, persistent: false }),
      options?.interactive !== false,
    ),
    wait: scriptedWait(state.waitScript, (doc, persistent) =>
      state.docs.push({ channel: "stderr", doc, persistent }),
    ),
    facts: Effect.succeed({
      columns: 80,
      stdoutIsTTY: options?.stdoutIsTTY ?? false,
      colors: false,
      animate: false,
    }),
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
