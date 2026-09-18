import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";
import * as Terminal from "effect/Terminal";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  subscribeLossless,
  type OperationLifecycleService,
} from "@agentxm/workspace/transitions/planning";

import type { AppError } from "../app-error/index.js";
import { promptAvailability } from "../cli-flags/index.js";
import { makeJsonSuccessEnvelope } from "../cli-runtime/json-envelope.js";
import { promptRequired, type Ask, type InteractiveGuard } from "./ask/ask.js";
import type { QuestionCancelled } from "./ask/question-cancelled.js";
import { runAsk } from "./ask/run.js";
import { WaitAbandoned } from "./wait/wait-abandoned.js";
import { parkedOnWait, runStaticWait, runWait, type WaitSurface } from "./wait/run.js";
import type { WaitActions, WaitView } from "./wait/wait.js";
import type { Doc, DocNode } from "./doc.js";
import { plain } from "./doc.js";
import { Frame } from "./frame.js";
import type { LivePlan } from "./live-ledger.js";
import {
  encodeMachineEvent,
  instructionEvent,
  logEvent,
  progressEvent,
  suggestionEvent,
} from "./machine-events.js";
import { paintText } from "./paint-text.js";
import type { Glyphs } from "./glyphs.js";
import { initialProgress, reduceProgress } from "./progress.js";
import { OutputStreams } from "./streams.js";
import type { ResultOptions } from "./output.js";
import { ensureNewline, streamPaintWidth } from "./presenter-helpers.js";

export type { ResultOptions } from "./output.js";

export interface ScreenLogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  readonly message: string;
}

export interface ScreenFacts {
  readonly columns: number;
  /** Whether the primary result stream is styled. */
  readonly colors: boolean;
  readonly animate: boolean;
}

/** Operation whose plan the current feature invocation is presenting. */
export const CurrentScreenOperationId = ServiceMap.Reference<string | undefined>(
  "axm.sh/screen/CurrentScreenOperationId",
  { defaultValue: () => undefined },
);

/**
 * The application-owned terminal. Settled output crosses as a typed `Doc`;
 * live output reaches it only through `observe`, which subscribes the
 * mode's observer (live frame or machine writer) to an operation's
 * lifecycle broadcast within the caller's scope.
 */
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
    readonly observe: (
      lifecycle: OperationLifecycleService,
    ) => Effect.Effect<void, never, Scope.Scope>;
    /**
     * Give the live ledger the plan whose rows it paints while the operation
     * runs. Returns whether the plan is visible in the live frame, so a caller
     * can print a static fallback when it is not.
     */
    readonly showPlan: (plan: LivePlan) => Effect.Effect<boolean>;
    readonly log: (record: ScreenLogRecord) => Effect.Effect<void>;
    /**
     * Put a question to the person and answer with what they chose. The guard
     * decides whether a question may open at all: where it may not, and in
     * machine mode always, this fails with the usage error and its recovery
     * instead, so no prompt can reach a terminal that must not see one.
     */
    readonly ask: <A>(
      ask: Ask<A>,
      guard?: InteractiveGuard,
    ) => Effect.Effect<A, QuestionCancelled | AppError>;
    /**
     * Park the terminal while a person acts somewhere else, and answer with
     * what the awaited effect settled on. The wait's brief prints once, its
     * countdown is the only live line, and stopping it fails with
     * `WaitAbandoned` so the caller can end with its own pending outcome. A
     * screen that cannot animate — or is quiet — prints the brief and simply
     * waits.
     */
    readonly wait: <A, E, R>(
      view: WaitView,
      awaited: Effect.Effect<A, E, R>,
      actions?: WaitActions,
    ) => Effect.Effect<A, E | WaitAbandoned, R>;
    readonly facts: Effect.Effect<ScreenFacts>;
    readonly settle: Effect.Effect<void>;
  }
>()("axm.sh/screen/Screen") {}

const visibleSuggestions = (options: ResultOptions | undefined): ReadonlyArray<SuggestedAction> =>
  options?.withoutSuggestions === true ? [] : (options?.suggestions ?? []);

const encodeJson = <S extends Schema.Top>(data: Schema.Schema.Type<S>, schema: S) =>
  // Screen documents are constructed from the schema's Type. Failure proves a
  // violated application invariant rather than a recoverable user error.
  // eslint-disable-next-line no-restricted-syntax -- schema/type mismatch is a defect.
  Schema.encodeEffect(schema)(data).pipe(Effect.orDie);

export interface ScreenLiveOptions {
  /** ANSI styling per stream: only a stream that is itself a terminal is styled. */
  readonly colors: { readonly stdout: boolean; readonly stderr: boolean };
  readonly animate: boolean;
  /** Quiet keeps a wait static: its brief prints once and nothing counts down. */
  readonly quiet?: boolean;
  /** Symbol set for every painted document; defaults to the Unicode glyphs. */
  readonly glyphs?: Glyphs;
}

export const ScreenLive = (
  options: ScreenLiveOptions,
): Layer.Layer<Screen, never, Frame | OutputStreams> =>
  Layer.effect(
    Screen,
    Effect.gen(function* () {
      const frame = yield* Frame;
      const streams = yield* OutputStreams;
      // A composition without a terminal cannot ask, and says so through the
      // same guard that closes a prompt for every other reason.
      const terminal = yield* Effect.serviceOption(Terminal.Terminal);

      // A stream that is not a terminal is unbounded: nothing written to it is
      // wrapped, truncated, or padded to a terminal width. The output policy
      // separately limits styling to capable terminal streams.
      const render = (doc: Doc, stream: "stdout" | "stderr") =>
        Effect.map(streams.facts, (facts) => {
          const isTTY = stream === "stdout" ? facts.stdoutIsTTY : facts.stderrIsTTY;
          return ensureNewline(
            paintText(doc, {
              width: streamPaintWidth(isTTY, facts.columns),
              colors: options.colors[stream],
              ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
            }).join("\n"),
          );
        });

      const note = (doc: Doc) => Effect.flatMap(render(doc, "stderr"), frame.stderr);

      return {
        result: (doc) => {
          const literal =
            doc.length === 1 && (doc[0]?._tag === "raw" || doc[0]?._tag === "markdown")
              ? doc[0].content
              : undefined;
          return literal === undefined
            ? Effect.flatMap(render(doc, "stdout"), frame.stdout)
            : frame.stdout(literal);
        },
        note,
        document: () => Effect.succeed(false),
        // One projector folds the stream into progress state; the frame reads
        // the latest state and clears it at settlement. The projector holds
        // the drain latch so the settled document prints after that clear.
        observe: (lifecycle) =>
          Effect.gen(function* () {
            const state = yield* Ref.make(initialProgress);
            yield* subscribeLossless(lifecycle, (event) =>
              Effect.flatMap(
                Ref.updateAndGet(state, (current) => reduceProgress(current, event)),
                (next) => frame.present(lifecycle.operationId, next),
              ),
            );
          }),
        showPlan: (plan) =>
          Effect.flatMap(CurrentScreenOperationId, (operationId) =>
            operationId === undefined ? Effect.succeed(false) : frame.showPlan(operationId, plan),
          ),
        log: (record) =>
          Effect.flatMap(
            render([{ _tag: "paragraph", tone: "dim", text: record.message }], "stderr"),
            frame.stderr,
          ),
        ask: <A>(ask: Ask<A>, guard?: InteractiveGuard) =>
          Effect.gen(function* () {
            if (!(yield* promptAvailability) || !(yield* frame.canInteract)) {
              return yield* promptRequired(plain(ask.question), guard);
            }
            return yield* Option.match(terminal, {
              onNone: () => Effect.fail(promptRequired(plain(ask.question), guard)),
              onSome: (service) =>
                runAsk(ask, service, {
                  showInteraction: frame.showInteraction,
                  transcript: note,
                }),
            });
          }),
        wait: <A, E, R>(view: WaitView, awaited: Effect.Effect<A, E, R>, actions?: WaitActions) => {
          const surface: WaitSurface = {
            showInteraction: frame.showInteraction,
            transcript: note,
          };
          return Effect.gen(function* () {
            const interactive = (yield* promptAvailability) && (yield* frame.canInteract);
            // A terminal that cannot animate, a non-interactive invocation,
            // and a quiet invocation get the static block: the same brief, no
            // countdown, and no keys to press.
            const service =
              interactive && Option.isSome(terminal) && options.animate && options.quiet !== true
                ? terminal.value
                : undefined;
            return yield* parkedOnWait(
              view,
              service === undefined
                ? runStaticWait(view, awaited, surface)
                : runWait(view, awaited, actions ?? {}, service, surface),
            );
          });
        },
        facts: Effect.map(streams.facts, (facts) => ({
          columns: facts.columns,
          colors: options.colors.stdout,
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
      const resultWritten = yield* Ref.make(false);
      const emit = (event: Parameters<typeof encodeMachineEvent>[0]) =>
        streams.stderr(encodeMachineEvent(event));

      const writeResult = (content: string) =>
        Ref.getAndSet(resultWritten, true).pipe(
          Effect.flatMap((alreadyWritten) =>
            alreadyWritten
              ? Effect.die(
                  new Error(
                    "Machine-output contract violation: stdout must contain at most one complete JSON document.",
                  ),
                )
              : streams.stdout(content),
          ),
        );

      const nodeEvents = (node: DocNode): Effect.Effect<void> => {
        if (node._tag === "next") {
          return Effect.forEach(node.actions, (action) => emit(suggestionEvent(action)), {
            discard: true,
          });
        }
        if (node._tag === "section") {
          return Effect.forEach(node.children, nodeEvents, { discard: true });
        }
        if (node._tag === "ledger") {
          // A ledger row that failed or is blocked logs at its own level.
          return Effect.forEach(
            node.rows,
            (row) => {
              const message = row.cells.map(plain).join("   ");
              if (row.mark === "failed" || row.mark === "error") {
                return emit(logEvent("error", message));
              }
              return row.mark === "blocked" || row.mark === "warn"
                ? emit(logEvent("warn", message))
                : Effect.void;
            },
            { discard: true },
          );
        }
        if (node._tag === "headline") {
          return node.tone === "error" || node.tone === "warn"
            ? emit(logEvent(node.tone, plain(node.text)))
            : Effect.void;
        }
        if (node._tag === "callout") {
          const own =
            node.tone === "error" || node.tone === "warn"
              ? emit(logEvent(node.tone, plain(node.title)))
              : Effect.void;
          return node.children === undefined
            ? own
            : own.pipe(
                Effect.andThen(Effect.forEach(node.children, nodeEvents, { discard: true })),
              );
        }
        return Effect.void;
      };

      const note = (
        doc: Doc,
        noteOptions?: { readonly persistent?: boolean },
      ): Effect.Effect<void> => {
        const literal = doc
          .filter((node) => node._tag === "raw" || node._tag === "markdown")
          .map((node) => node.content)
          .join("");
        if (literal.length > 0) return streams.stderr(literal);
        return noteOptions?.persistent === true
          ? emit(
              instructionEvent(
                doc.map((node) => ("text" in node ? plain(node.text) : "")).join("\n"),
              ),
            ).pipe(Effect.andThen(Effect.forEach(doc, nodeEvents, { discard: true })))
          : Effect.forEach(doc, nodeEvents, { discard: true });
      };

      return {
        result: (doc) => {
          const literal = doc
            .filter((node) => node._tag === "raw" || node._tag === "markdown")
            .map((node) => node.content)
            .join("");
          return literal.length === 0 ? Effect.void : writeResult(literal);
        },
        note,
        document: <S extends Schema.Top>(
          data: Schema.Schema.Type<S>,
          schema: S,
          resultOptions?: ResultOptions,
        ) =>
          encodeJson(data, schema).pipe(
            Effect.flatMap((encoded) =>
              writeResult(
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
        // The machine writer is lossless: every lifecycle event lands on
        // stderr, in order, before the result document. Quiet suppresses only
        // progress; the subscription still drains so ordering holds.
        observe: (lifecycle) =>
          subscribeLossless(lifecycle, (event) =>
            quiet ? Effect.void : emit(progressEvent(event)),
          ),
        // Machine output carries the lifecycle events themselves, so there is
        // no live ledger for a plan to paint into.
        showPlan: () => Effect.succeed(false),
        log: (record) => emit(logEvent(logLevel(record.level), record.message)),
        // Machine output never prompts: asking is the usage error by
        // construction, whatever the terminal on the other end can do.
        ask: (ask, guard) => Effect.fail(promptRequired(plain(ask.question), guard)),
        // Machine output has no terminal to park and no keys to offer, but the
        // brief is what a person or an agent needs to finish elsewhere, so it
        // crosses as instructions and suggestions exactly as it always has.
        wait: (view, awaited) =>
          parkedOnWait(view, note(view.brief, { persistent: true }).pipe(Effect.andThen(awaited))),
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
