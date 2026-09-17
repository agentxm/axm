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
import { paintScene, type Scene, type ScenePart } from "./scene.js";
import { OutputStreams } from "./streams.js";
import { displayWidth, renderedRows } from "./width.js";

const ESC = "\u001b[";
const CURSOR_HIDE = `${ESC}?25l`;
const CURSOR_SHOW = `${ESC}?25h`;
/** Erase from the cursor to the end of the screen. */
const ERASE_BELOW = `${ESC}0J`;
const cursorUp = (rows: number): string => (rows <= 0 ? "" : `${ESC}${String(rows)}A`);
/**
 * The frames a running unit animates through. Both are Neutral in Unicode
 * East Asian Width, so the spinner occupies one cell in every terminal and its
 * width never changes between frames; ◐ and ◑ are Ambiguous and were dropped.
 */
export const spinnerFrames = ["◒", "◓"] as const;

/**
 * The single terminal owner's live region and transcript. Transcript writes
 * insert above the live region; the region shows one scene — the operation's
 * ledger with at most one interaction beneath it — and collapses into one
 * transcript line at settlement.
 */
export class Frame extends ServiceMap.Service<
  Frame,
  {
    readonly stdout: (content: string) => Effect.Effect<void>;
    readonly stderr: (content: string) => Effect.Effect<void>;
    /** Present the latest progress state; the frame diffs it against the previous one. */
    readonly present: (state: ProgressState) => Effect.Effect<void>;
    /** Replace the scene's ledger part; `undefined` clears it. */
    readonly showLedger: (part: ScenePart | undefined) => Effect.Effect<void>;
    /** Replace the interaction beneath the ledger — a prompt or a wait; `undefined` clears it. */
    readonly showInteraction: (part: ScenePart | undefined) => Effect.Effect<void>;
    readonly prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
    readonly settle: Effect.Effect<void>;
  }
>()("axm.sh/screen/Frame") {}

interface FrameState {
  /** The last unsettled progress state, which the next one's transition is diffed against. */
  readonly progress: ProgressState | undefined;
  readonly scene: Scene;
  /** Display widths of the lines standing in the live region, in paint order. */
  readonly painted: ReadonlyArray<number>;
  readonly spinner: number;
  readonly paused: boolean;
}

const initialState: FrameState = {
  progress: undefined,
  scene: {},
  painted: [],
  spinner: 0,
  paused: false,
};

/**
 * Erase the live region. A narrowed terminal has rewrapped what was painted,
 * so the rows to clear come from the remembered line widths at the current
 * width rather than from the number of lines painted; erasing from the first
 * of them to the end of the screen then leaves no ghost row behind.
 */
const eraseBytes = (painted: ReadonlyArray<number>, columns: number): string => {
  if (painted.length === 0) return "";
  const rows = painted.reduce((total, width) => total + renderedRows(width, columns), 0);
  return `\r${cursorUp(rows - 1)}${ERASE_BELOW}`;
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

      /**
       * The progress projection as the scene's ledger part. The phrase layer
       * has already laid its lines out to the width, so they cross as one raw
       * node; the live ledger replaces this projection, not the scene.
       */
      const progressLedger =
        (progress: ProgressState): ScenePart =>
        (facts) => {
          const lines = liveProgressLines(progress, {
            width: facts.columns,
            colors: options.colors,
            spinner: facts.spinner,
            nowMs: facts.nowMs,
            ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
          });
          return lines.length === 0 ? [] : [{ _tag: "raw", content: lines.join("\n") }];
        };

      const eraseLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        if (current.painted.length === 0) return;
        const facts = yield* streams.facts;
        yield* streams.stderr(eraseBytes(current.painted, facts.columns));
        yield* Ref.update(state, (value) => ({ ...value, painted: [] }));
      });

      const repaintLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        const facts = yield* streams.facts;
        const erase = eraseBytes(current.painted, facts.columns);
        const nowMs = yield* Clock.currentTimeMillis;
        const lines =
          current.paused || !options.animate || options.quiet
            ? []
            : paintScene(current.scene, facts, {
                colors: options.colors,
                spinner: spinnerFrames[current.spinner % spinnerFrames.length] ?? spinnerFrames[0],
                nowMs,
                ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
              });
        const paint = lines.length === 0 ? "" : `${CURSOR_HIDE}${lines.join("\n")}`;
        if (erase.length > 0 || paint.length > 0) yield* streams.stderr(`${erase}${paint}`);
        yield* Ref.set(state, {
          ...current,
          painted: lines.map(displayWidth),
          spinner: current.spinner + 1,
        });
      });

      const repaint = permit.withPermit(repaintLocked);

      const write = (channel: "stdout" | "stderr", content: string) =>
        permit.withPermit(
          Effect.gen(function* () {
            yield* eraseLocked;
            yield* streams[channel](content);
            yield* repaintLocked;
          }),
        );

      const settle = permit.withPermit(
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const facts = yield* streams.facts;
          const erase = eraseBytes(current.painted, facts.columns);
          if (erase.length > 0 || options.animate) yield* streams.stderr(`${erase}${CURSOR_SHOW}`);
          yield* Ref.set(state, { ...current, painted: [], progress: undefined, scene: {} });
        }),
      );

      const present = (next: ProgressState): Effect.Effect<void> =>
        permit.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            const transition = progressTransitionDoc(current.progress, next, {
              live: options.animate,
            });
            yield* eraseLocked;
            const unsettled = next.settled === undefined;
            yield* Ref.update(state, (value) => ({
              ...value,
              progress: unsettled ? next : undefined,
              scene: {
                ...value.scene,
                ledger: unsettled ? progressLedger(next) : undefined,
              },
            }));
            if (!options.quiet && transition.length > 0) {
              const facts = yield* streams.facts;
              yield* streams.stderr(ensureNewline(paintText(transition, style(facts)).join("\n")));
            }
            yield* repaintLocked;
          }),
        );

      const show = (scene: (current: Scene) => Scene): Effect.Effect<void> =>
        permit.withPermit(
          Effect.gen(function* () {
            yield* Ref.update(state, (value) => ({ ...value, scene: scene(value.scene) }));
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
        showLedger: (part: ScenePart | undefined) =>
          show((current) => ({ ...current, ledger: part })),
        showInteraction: (part: ScenePart | undefined) =>
          show((current) => ({ ...current, interaction: part })),
        prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          permit
            .withPermit(
              Effect.gen(function* () {
                yield* eraseLocked;
                yield* Ref.update(state, (value) => ({ ...value, paused: true }));
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
