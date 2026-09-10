import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

import { paintText, type Glyphs } from "./paint-text.js";
import type { ProgressState } from "./progress.js";
import { liveProgressLines, progressTransitionDoc } from "./progress-view.js";
import { OutputStreams } from "./streams.js";

const ESC = "\u001b[";
const CURSOR_HIDE = `${ESC}?25l`;
const CURSOR_SHOW = `${ESC}?25h`;
const ERASE_LINE = `\r${ESC}2K`;
const CURSOR_UP = `${ESC}1A`;
const SPINNERS = ["◒", "◐", "◓", "◑"] as const;

/**
 * The single terminal owner's live region and transcript. Transcript writes
 * insert above the live region; the region repaints from the latest
 * progress state and collapses into one transcript line at settlement.
 */
export class Frame extends ServiceMap.Service<
  Frame,
  {
    readonly stdout: (content: string) => Effect.Effect<void>;
    readonly stderr: (content: string) => Effect.Effect<void>;
    /** Present the latest progress state; the frame diffs it against the previous one. */
    readonly present: (state: ProgressState) => Effect.Effect<void>;
    readonly prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
    readonly settle: Effect.Effect<void>;
  }
>()("axm.sh/screen/Frame") {}

interface FrameState {
  readonly progress: ProgressState | undefined;
  readonly paintedLines: number;
  readonly spinner: number;
  readonly paused: boolean;
}

const initialState: FrameState = {
  progress: undefined,
  paintedLines: 0,
  spinner: 0,
  paused: false,
};

const eraseBytes = (lines: number): string => {
  if (lines <= 0) return "";
  return `${ERASE_LINE}${Array.from({ length: lines - 1 }, () => `${CURSOR_UP}${ERASE_LINE}`).join("")}`;
};

const ensureNewline = (content: string): string =>
  content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;

export interface FrameOptions {
  readonly animate: boolean;
  readonly quiet: boolean;
  /** ANSI styling for the stderr live region and transcript transitions. */
  readonly colors: boolean;
  readonly glyphs?: Glyphs;
}

export const FrameLive = (options: FrameOptions): Layer.Layer<Frame, never, OutputStreams> =>
  Layer.effect(
    Frame,
    Effect.gen(function* () {
      const streams = yield* OutputStreams;
      const state = yield* Ref.make(initialState);
      const permit = yield* Semaphore.make(1);
      // Transcript transitions land on stderr: bounded by the terminal width
      // when stderr is a terminal, unbounded (never wrapped or padded) otherwise.
      const style = (facts: { readonly stderrIsTTY: boolean; readonly columns: number }) => ({
        width: facts.stderrIsTTY ? facts.columns : ("unbounded" as const),
        colors: options.colors,
        ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
      });

      const repaintLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        const erase = eraseBytes(current.paintedLines);
        const facts = yield* streams.facts;
        const nowMs = yield* Clock.currentTimeMillis;
        const lines =
          current.paused || !options.animate || options.quiet || current.progress === undefined
            ? []
            : liveProgressLines(current.progress, {
                width: facts.columns,
                colors: options.colors,
                spinner: SPINNERS[current.spinner % SPINNERS.length] ?? SPINNERS[0],
                nowMs,
                ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
              });
        const paint = lines.length === 0 ? "" : `${CURSOR_HIDE}${lines.join("\n")}`;
        if (erase.length > 0 || paint.length > 0) yield* streams.stderr(`${erase}${paint}`);
        yield* Ref.set(state, {
          ...current,
          paintedLines: lines.length,
          spinner: current.spinner + 1,
        });
      });

      const repaint = permit.withPermit(repaintLocked);

      const write = (channel: "stdout" | "stderr", content: string) =>
        permit.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            if (current.paintedLines > 0) yield* streams.stderr(eraseBytes(current.paintedLines));
            yield* Ref.update(state, (value) => ({ ...value, paintedLines: 0 }));
            yield* streams[channel](content);
            yield* repaintLocked;
          }),
        );

      const settle = permit.withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const erase = eraseBytes(current.paintedLines);
          if (erase.length > 0 || options.animate) yield* streams.stderr(`${erase}${CURSOR_SHOW}`);
          yield* Ref.set(state, { ...current, paintedLines: 0, progress: undefined });
        }),
      );

      const present = (next: ProgressState): Effect.Effect<void> =>
        permit.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            const transition = progressTransitionDoc(current.progress, next, {
              live: options.animate,
            });
            if (current.paintedLines > 0) yield* streams.stderr(eraseBytes(current.paintedLines));
            yield* Ref.update(state, (value) => ({
              ...value,
              paintedLines: 0,
              progress: next.settled === undefined ? next : undefined,
            }));
            if (!options.quiet && transition.length > 0) {
              const facts = yield* streams.facts;
              yield* streams.stderr(ensureNewline(paintText(transition, style(facts)).join("\n")));
            }
            yield* repaintLocked;
          }),
        );

      if (options.animate) {
        yield* Effect.repeat(repaint, Schedule.spaced("80 millis")).pipe(Effect.forkScoped);
        yield* streams.resize.pipe(
          Stream.runForEach(() => repaint),
          Effect.forkScoped,
        );
      }

      yield* Effect.addFinalizer(() => settle);

      return {
        stdout: (content: string) => write("stdout", content),
        stderr: (content: string) => write("stderr", content),
        present,
        prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          permit
            .withPermit(
              Effect.gen(function* () {
                const current = yield* Ref.get(state);
                if (current.paintedLines > 0)
                  yield* streams.stderr(eraseBytes(current.paintedLines));
                yield* Ref.set(state, { ...current, paintedLines: 0, paused: true });
              }),
            )
            .pipe(
              Effect.andThen(effect),
              Effect.ensuring(
                permit.withPermit(
                  Effect.gen(function* () {
                    yield* Ref.update(state, (current) => ({ ...current, paused: false }));
                    yield* repaintLocked;
                  }),
                ),
              ),
            ),
        settle,
      };
    }),
  );
