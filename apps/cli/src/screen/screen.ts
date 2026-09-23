import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import type * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";
import * as Terminal from "effect/Terminal";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  subscribeLossless,
  type OperationLifecycleService,
} from "@agentxm/workspace/transitions/planning";

import type { AppError } from "../app-error/index.js";
import { promptAvailability, Verbosity } from "../cli-flags/index.js";
import { makeJsonSuccessEnvelope } from "../cli-runtime/json-envelope.js";
import { promptRequired, type Ask, type InteractiveGuard } from "./ask/ask.js";
import type { QuestionCancelled } from "./ask/question-cancelled.js";
import { runAsk } from "./ask/run.js";
import { WaitAbandoned } from "./wait/wait-abandoned.js";
import { parkedOnWait, runStaticWait, runWait, type WaitSurface } from "./wait/run.js";
import type { WaitActions, WaitView } from "./wait/wait.js";
import type { Doc, DocNode } from "./doc.js";
import { plain } from "./doc.js";
import { Frame, type ActiveView } from "./frame.js";
import { progressActivity, progressTransitionDoc } from "./progress-view.js";
import type { InteractionSurface } from "./interaction.js";
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
import { CredentialDeliveryFailed, type OutputWriteFailed } from "./streams.js";
import type { ResultOptions } from "./output.js";
import { ensureNewline, streamPaintWidth } from "./presenter-helpers.js";

export type { ResultOptions } from "./output.js";

export interface ScreenLogRecord {
  readonly level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  readonly message: string;
}

export interface ScreenFacts {
  readonly columns: number;
  readonly stdoutIsTTY: boolean;
  /** Whether the primary result stream is styled. */
  readonly colors: boolean;
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
    readonly result: (doc: Doc) => Effect.Effect<void, OutputWriteFailed>;
    /** Deliver one credential to stdout and succeed only after the stream acknowledges it. */
    readonly credential: (content: string) => Effect.Effect<void, CredentialDeliveryFailed>;
    readonly note: (doc: Doc) => Effect.Effect<void, OutputWriteFailed>;
    /** Required handoff guidance, also emitted as a machine instruction. */
    readonly instruction: (doc: Doc) => Effect.Effect<void, OutputWriteFailed>;
    readonly document: <S extends Schema.Top>(
      data: Schema.Schema.Type<S>,
      schema: S,
      options?: ResultOptions,
    ) => Effect.Effect<boolean, OutputWriteFailed, S["EncodingServices"]>;
    readonly observe: (
      lifecycle: OperationLifecycleService,
    ) => Effect.Effect<void, OutputWriteFailed, Scope.Scope>;
    readonly log: (record: ScreenLogRecord) => Effect.Effect<void, OutputWriteFailed>;
    /**
     * Put a question to the person and answer with what they chose. The guard
     * decides whether a question may open at all: where it may not, and in
     * machine mode always, this fails with the usage error and its recovery
     * instead, so no prompt can reach a terminal that must not see one.
     */
    readonly ask: <A>(
      ask: Ask<A>,
      guard?: InteractiveGuard,
    ) => Effect.Effect<A, QuestionCancelled | AppError | OutputWriteFailed | Config.ConfigError>;
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
    ) => Effect.Effect<A, E | WaitAbandoned | OutputWriteFailed | Config.ConfigError, R>;
    readonly facts: Effect.Effect<ScreenFacts>;
    readonly settle: Effect.Effect<void, OutputWriteFailed>;
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
              width: streamPaintWidth(
                isTTY,
                stream === "stdout" ? facts.stdoutColumns : facts.columns,
              ),
              colors: options.colors[stream],
              ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
            }).join("\n"),
          );
        });

      const note = (doc: Doc) => Effect.flatMap(render(doc, "stderr"), frame.stderr);

      // Screen owns foreground selection and scoped operation/input lifetimes;
      // Frame sees only one selected view and serialized transcript bytes.
      const operations = yield* Ref.make<ReadonlyMap<string, ActiveView>>(new Map());
      const interaction = yield* Ref.make<ActiveView | undefined>(undefined);
      const presentationPermit = yield* Semaphore.make(1);
      const inputPermit = yield* Semaphore.make(1);
      const foreground = Effect.gen(function* () {
        const open = yield* Ref.get(interaction);
        if (open !== undefined) return open;
        return [...(yield* Ref.get(operations)).values()].at(-1);
      });
      const interactionSurface = Effect.gen(function* () {
        const owner = Symbol("interaction");
        const showInteraction: InteractionSurface["showInteraction"] = (part) =>
          presentationPermit.withPermit(
            Effect.gen(function* () {
              const current = yield* Ref.get(interaction);
              if (part === undefined && current?.owner !== owner) return;
              yield* Ref.set(
                interaction,
                part === undefined
                  ? undefined
                  : ({ owner, kind: "interaction", part } satisfies ActiveView),
              );
              yield* frame.updateActive(yield* foreground);
            }),
          );
        yield* Effect.addFinalizer(() => showInteraction(undefined).pipe(Effect.ignore));
        const finish = (doc: Doc) =>
          presentationPermit.withPermit(
            Effect.gen(function* () {
              const current = yield* Ref.get(interaction);
              const content = doc.length === 0 ? "" : yield* render(doc, "stderr");
              if (current?.owner === owner) {
                yield* Ref.set(interaction, undefined);
                yield* frame.finishActive(owner, content, yield* foreground);
              } else if (current === undefined) {
                // Static waits have no active controls, but still leave an outcome.
                yield* frame.updateActive(yield* foreground, content);
              }
            }),
          );
        return { showInteraction, transcript: note, finish } satisfies InteractionSurface;
      });

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
        credential: (content) =>
          frame.settle.pipe(
            Effect.mapError((cause) => new CredentialDeliveryFailed({ cause })),
            Effect.andThen(streams.credential(content)),
          ),
        note,
        instruction: note,
        document: () => Effect.succeed(false),
        observe: (lifecycle) =>
          Effect.gen(function* () {
            const state = yield* Ref.make(initialProgress);
            const owner = Symbol(lifecycle.operationId);
            const verbosity = yield* Effect.serviceOption(Verbosity);
            const detailed =
              Option.isSome(verbosity) &&
              (verbosity.value.level === "verbose" || verbosity.value.level === "debug");
            yield* Effect.addFinalizer(() =>
              presentationPermit.withPermit(
                Effect.gen(function* () {
                  yield* Ref.update(operations, (current) => {
                    const next = new Map(current);
                    if (next.get(lifecycle.operationId)?.owner === owner)
                      next.delete(lifecycle.operationId);
                    return next;
                  });
                  yield* frame.updateActive(yield* foreground).pipe(Effect.ignore);
                }),
              ),
            );
            yield* subscribeLossless(lifecycle, (event) =>
              presentationPermit.withPermit(
                Effect.gen(function* () {
                  const previous = yield* Ref.get(state);
                  const next = reduceProgress(previous, event);
                  yield* Ref.set(state, next);
                  const doc = progressTransitionDoc(previous, next, {
                    detailed,
                    quiet: options.quiet === true,
                    static: !options.animate,
                    attributeOperation: (yield* Ref.get(operations)).size > 1,
                  });
                  yield* Ref.update(operations, (current) => {
                    const updated = new Map(current);
                    if (next.settled !== undefined) updated.delete(lifecycle.operationId);
                    else
                      updated.set(lifecycle.operationId, {
                        owner,
                        kind: "activity",
                        part: progressActivity(next),
                      });
                    return updated;
                  });
                  yield* frame
                    .updateActive(
                      yield* foreground,
                      doc.length === 0 ? "" : yield* render(doc, "stderr"),
                      event._tag !== "UnitProgress",
                    )
                    .pipe(Effect.ignore);
                }),
              ),
            );
          }),
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
                inputPermit.withPermit(
                  Effect.scoped(
                    Effect.gen(function* () {
                      // A queued question may acquire input after a resize.
                      if (!(yield* frame.canInteract))
                        return yield* promptRequired(plain(ask.question), guard);
                      const surface = yield* interactionSurface;
                      const unusable = streams.resize.pipe(
                        Stream.runForEach(() =>
                          Effect.flatMap(frame.canInteract, (available) =>
                            available
                              ? Effect.void
                              : Effect.fail(promptRequired(plain(ask.question), guard)),
                          ),
                        ),
                        Effect.andThen(Effect.never),
                      );
                      return yield* Effect.raceFirst(runAsk(ask, service, surface), unusable);
                    }),
                  ),
                ),
            });
          }),
        wait: <A, E, R>(view: WaitView, awaited: Effect.Effect<A, E, R>, actions?: WaitActions) => {
          return inputPermit.withPermit(
            Effect.gen(function* () {
              const surface: WaitSurface = yield* interactionSurface;
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
            }).pipe(Effect.scoped),
          );
        },
        facts: Effect.map(streams.facts, (facts) => ({
          columns: facts.stdoutColumns,
          stdoutIsTTY: facts.stdoutIsTTY,
          colors: options.colors.stdout,
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

      const nodeEvents = (node: DocNode): Effect.Effect<void, OutputWriteFailed> => {
        if (node._tag === "next") {
          return Effect.forEach(node.actions, (action) => emit(suggestionEvent(action)), {
            discard: true,
          });
        }
        if (node._tag === "section") {
          return Effect.forEach(node.children, nodeEvents, { discard: true });
        }
        if (node._tag === "ledger") {
          // A unit that failed or is blocked logs at its own level.
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

      const note = (doc: Doc): Effect.Effect<void, OutputWriteFailed> => {
        const literal = doc
          .filter((node) => node._tag === "raw" || node._tag === "markdown")
          .map((node) => node.content)
          .join("");
        return literal.length > 0
          ? streams.stderr(literal)
          : Effect.forEach(doc, nodeEvents, { discard: true });
      };
      const instruction = (doc: Doc) =>
        emit(
          instructionEvent(doc.map((node) => ("text" in node ? plain(node.text) : "")).join("\n")),
        ).pipe(Effect.andThen(note(doc)));

      return {
        result: (doc) => {
          const literal = doc
            .filter((node) => node._tag === "raw" || node._tag === "markdown")
            .map((node) => node.content)
            .join("");
          return literal.length === 0 ? Effect.void : writeResult(literal);
        },
        credential: streams.credential,
        note,
        instruction,
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
        // stderr, in order, before the result document. A failed channel is
        // retained by OutputStreams and fails settle; observation keeps draining. Quiet suppresses only
        // progress; the subscription still drains so ordering holds.
        observe: (lifecycle) =>
          subscribeLossless(lifecycle, (event) =>
            quiet ? Effect.void : emit(progressEvent(event)).pipe(Effect.ignore),
          ),
        log: (record) => emit(logEvent(logLevel(record.level), record.message)),
        // Machine output never prompts: asking is the usage error by
        // construction, whatever the terminal on the other end can do.
        ask: (ask, guard) => Effect.fail(promptRequired(plain(ask.question), guard)),
        // Machine output has no terminal to park and no keys to offer, but the
        // brief is what a person or an agent needs to finish elsewhere, so it
        // crosses as instructions and suggestions exactly as it always has.
        wait: (view, awaited) =>
          parkedOnWait(view, instruction(view.brief).pipe(Effect.andThen(awaited))),
        facts: Effect.succeed({
          columns: 80,
          stdoutIsTTY: false,
          colors: false,
        }),
        settle: streams.check,
      };
    }),
  );

export const emitSuggestionEvents = (
  screen: typeof OutputStreams.Service,
  suggestions: ReadonlyArray<SuggestedAction>,
): Effect.Effect<void, OutputWriteFailed> =>
  Effect.forEach(
    suggestions,
    (suggestion) => screen.stderr(encodeMachineEvent(suggestionEvent(suggestion))),
    { concurrency: 1 },
  ).pipe(Effect.asVoid);

/** Select the output projection once; machine mode never evaluates a human view. */
export const emitResult = <S extends Schema.Top>(
  data: Schema.Schema.Type<S>,
  schema: S,
  human: () => Doc,
  options?: ResultOptions,
): Effect.Effect<void, OutputWriteFailed, Screen | S["EncodingServices"]> =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    if (!(yield* screen.document(data, schema, options))) yield* screen.result(human());
  });
