import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { subscribeLossless, type OperationLifecycleService } from "@agentxm/workspace-operations";

import { makeJsonSuccessEnvelope } from "../cli-runtime/json-envelope.js";
import type { Doc, DocNode } from "./doc.js";
import { plain } from "./doc.js";
import { Frame } from "./frame.js";
import {
  encodeMachineEvent,
  instructionEvent,
  logEvent,
  progressEvent,
  suggestionEvent,
} from "./machine-events.js";
import { paintText, type Glyphs } from "./paint-text.js";
import { initialProgress, reduceProgress } from "./progress.js";
import { OutputStreams } from "./streams.js";

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
  /** Whether the primary result stream is styled. */
  readonly colors: boolean;
  readonly animate: boolean;
}

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

export interface ScreenLiveOptions {
  /** ANSI styling per stream: only a stream that is itself a terminal is styled. */
  readonly colors: { readonly stdout: boolean; readonly stderr: boolean };
  readonly animate: boolean;
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

      // A stream that is not a terminal is unbounded: nothing written to it is
      // wrapped, truncated, or padded to a terminal width, and it carries no
      // styling unless color was forced for that stream.
      const render = (doc: Doc, stream: "stdout" | "stderr") =>
        Effect.map(streams.facts, (facts) => {
          const isTTY = stream === "stdout" ? facts.stdoutIsTTY : facts.stderrIsTTY;
          return ensureNewline(
            paintText(doc, {
              width: isTTY ? facts.columns : "unbounded",
              colors: options.colors[stream],
              ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
            }).join("\n"),
          );
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
        note: (doc) => Effect.flatMap(render(doc, "stderr"), frame.stderr),
        document: () => Effect.succeed(false),
        // One projector folds the stream into progress state; the frame reads
        // the latest state and collapses it at settlement. The projector holds
        // the drain latch so the settled document prints after the collapse.
        observe: (lifecycle) =>
          Effect.gen(function* () {
            const state = yield* Ref.make(initialProgress);
            yield* subscribeLossless(lifecycle, (event) =>
              Effect.flatMap(
                Ref.updateAndGet(state, (current) => reduceProgress(current, event)),
                frame.present,
              ),
            );
          }),
        log: (record) =>
          Effect.flatMap(
            render([{ _tag: "paragraph", tone: "dim", text: record.message }], "stderr"),
            frame.stderr,
          ),
        prompt: frame.prompt,
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
        if (node._tag === "rows") {
          return Effect.forEach(node.rows, nodeEvents, { discard: true });
        }
        if (node._tag === "row") {
          const message = node.cells.map(plain).join("   ");
          const level = node.change === "failed" ? "error" : "warn";
          return node.change === "failed" || node.change === "blocked"
            ? emit(logEvent(level, message))
            : Effect.void;
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

      return {
        result: (doc) => {
          const literal = doc
            .filter((node) => node._tag === "raw" || node._tag === "markdown")
            .map((node) => node.content)
            .join("");
          return literal.length === 0 ? Effect.void : writeResult(literal);
        },
        note: (doc, noteOptions) => {
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
              )
            : Effect.forEach(doc, nodeEvents, { discard: true });
        },
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
