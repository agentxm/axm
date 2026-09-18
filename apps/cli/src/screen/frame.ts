import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

import { liveLedgerDoc, type LivePlan } from "./live-ledger.js";
import { paintText, unicodeGlyphs, type Glyphs } from "./paint-text.js";
import { initialProgress, type ProgressState } from "./progress.js";
import { progressTransitionDoc } from "./progress-view.js";
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
 * The single terminal owner's live region and transcript. Transcript writes
 * insert above the live region; the region shows one scene — the operation's
 * ledger with at most one interaction beneath it — and clears at settlement,
 * where the result ledger takes over.
 */
export class Frame extends ServiceMap.Service<
  Frame,
  {
    readonly stdout: (content: string) => Effect.Effect<void>;
    readonly stderr: (content: string) => Effect.Effect<void>;
    /** Present the latest progress state; the frame diffs it against the previous one. */
    readonly present: (state: ProgressState) => Effect.Effect<void>;
    /** Whether an interaction can paint on the terminal-owned stream. */
    readonly canInteract: Effect.Effect<boolean>;
    /**
     * Give the live ledger the plan its rows come from; `undefined` leaves it
     * to synthesize rows from the units the operation reports.
     */
    readonly showPlan: (plan: LivePlan | undefined) => Effect.Effect<boolean>;
    /** Replace the interaction beneath the ledger — a prompt or a wait; `undefined` clears it. */
    readonly showInteraction: (part: ScenePart | undefined) => Effect.Effect<void>;
    readonly settle: Effect.Effect<void>;
  }
>()("axm.sh/screen/Frame") {}

interface FrameState {
  /** The last unsettled progress state, which the next one's transition is diffed against. */
  readonly progress: ProgressState | undefined;
  /** The plan the live ledger joins progress to, once a view has presented one. */
  readonly plan: LivePlan | undefined;
  readonly scene: Scene;
  /** Display widths of the lines standing in the live region, in paint order. */
  readonly painted: ReadonlyArray<number>;
  /** Exact unstyled scene bytes, used to avoid repainting an unchanged frame. */
  readonly paintedContent: string;
  readonly paintedColumns: number | undefined;
  /** Whether the region hid the cursor and still owes the terminal a show. */
  readonly cursorHidden: boolean;
}

const initialState: FrameState = {
  progress: undefined,
  plan: undefined,
  scene: {},
  painted: [],
  paintedContent: "",
  paintedColumns: undefined,
  cursorHidden: false,
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
      const canInteract = Effect.map(streams.facts, (facts) => facts.stderrIsTTY);
      // Transcript transitions land on stderr: bounded by the terminal width
      // when stderr is a terminal, unbounded (never wrapped or padded) otherwise.
      const style = (facts: { readonly stderrIsTTY: boolean; readonly columns: number }) => ({
        width: facts.stderrIsTTY ? facts.columns : ("unbounded" as const),
        colors: options.colors,
        ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
      });

      /**
       * The operation's live ledger as the scene's ledger part: the plan's
       * rows joined to the latest progress, laid out in the height the scene
       * gives it. The part is rebuilt whenever either side changes, so the
       * scene never holds a stale join.
       */
      const ledgerPart = (
        progress: ProgressState | undefined,
        plan: LivePlan | undefined,
      ): ScenePart | undefined =>
        progress === undefined && plan === undefined
          ? undefined
          : (facts) =>
              liveLedgerDoc(progress ?? initialProgress, {
                ...(plan === undefined ? {} : { plan }),
                rows: facts.rows,
                nowMs: facts.nowMs,
              });

      const eraseLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        if (current.painted.length === 0) return;
        const facts = yield* streams.facts;
        yield* streams.stderr(eraseBytes(current.painted, facts.columns));
        yield* Ref.update(state, (value) => ({
          ...value,
          painted: [],
          paintedContent: "",
          paintedColumns: undefined,
        }));
      });

      /**
       * What the region may show. Progress animates only where the terminal
       * can animate and quiet has not silenced it, but an open question is not
       * progress: it is the thing the person has to answer, so it paints
       * wherever the region can be erased and repainted at all.
       */
      const visibleScene = (
        current: FrameState,
        facts: { readonly stderrIsTTY: boolean },
      ): Scene => {
        if (options.animate && !options.quiet) return current.scene;
        return facts.stderrIsTTY ? { interaction: current.scene.interaction } : {};
      };

      const repaintLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        const facts = yield* streams.facts;
        const erase = eraseBytes(current.painted, facts.columns);
        const nowMs = yield* Clock.currentTimeMillis;
        const frames = (options.glyphs ?? unicodeGlyphs).spinner;
        const spinner = frames[Math.floor(nowMs / 80) % frames.length] ?? "";
        const lines = paintScene(visibleScene(current, facts), facts, {
          colors: options.colors,
          spinner,
          nowMs,
          ...(options.glyphs === undefined ? {} : { glyphs: options.glyphs }),
        });
        const paintedContent = lines.join("\n");
        if (paintedContent === current.paintedContent && current.paintedColumns === facts.columns)
          return;
        // A painted region hides the cursor; an empty one hands it back, but
        // only where it was the region that hid it.
        const handback = current.cursorHidden ? CURSOR_SHOW : "";
        const paint = lines.length === 0 ? handback : `${CURSOR_HIDE}${lines.join("\n")}`;
        if (erase.length > 0 || paint.length > 0) yield* streams.stderr(`${erase}${paint}`);
        yield* Ref.set(state, {
          ...current,
          painted: lines.map(displayWidth),
          paintedContent,
          paintedColumns: facts.columns,
          cursorHidden: lines.length > 0,
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
          // The region hands the cursor back the moment it empties, so
          // settlement owes one only where something was still standing.
          if (erase.length > 0 || current.cursorHidden) {
            yield* streams.stderr(`${erase}${CURSOR_SHOW}`);
          }
          yield* Ref.set(state, {
            ...current,
            painted: [],
            paintedContent: "",
            paintedColumns: undefined,
            cursorHidden: false,
            progress: undefined,
            plan: undefined,
            scene: {},
          });
        }),
      );

      const present = (next: ProgressState): Effect.Effect<void> =>
        permit.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            // An animated terminal shows every transition in the live ledger
            // already, and its settlement is the result ledger the command
            // prints, so nothing about progress reaches the transcript.
            const transition = options.animate ? [] : progressTransitionDoc(current.progress, next);
            yield* eraseLocked;
            const unsettled = next.settled === undefined;
            yield* Ref.update(state, (value) => {
              const progress = unsettled ? next : undefined;
              const plan = unsettled ? value.plan : undefined;
              return {
                ...value,
                progress,
                plan,
                scene: { ...value.scene, ledger: ledgerPart(progress, plan) },
              };
            });
            if (!options.quiet && transition.length > 0) {
              const facts = yield* streams.facts;
              yield* streams.stderr(ensureNewline(paintText(transition, style(facts)).join("\n")));
            }
            yield* repaintLocked;
          }),
        );

      /** Change what the region stands on, then repaint it under one permit. */
      const show = (update: (value: FrameState) => FrameState): Effect.Effect<void> =>
        permit.withPermit(
          Effect.gen(function* () {
            yield* Ref.update(state, update);
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
        canInteract,
        showPlan: (plan: LivePlan | undefined) =>
          show((value) => ({
            ...value,
            plan,
            scene: { ...value.scene, ledger: ledgerPart(value.progress, plan) },
          })).pipe(
            Effect.andThen(
              Effect.map(
                streams.facts,
                (facts) => options.animate && !options.quiet && facts.stderrIsTTY,
              ),
            ),
          ),
        showInteraction: (part: ScenePart | undefined) =>
          show((value) => ({ ...value, scene: { ...value.scene, interaction: part } })),
        settle,
      };
    }),
  );
