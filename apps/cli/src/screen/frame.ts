import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

import { unicodeGlyphs, type Glyphs } from "./glyphs.js";
import { liveColumns, liveRows, paintLivePart, type ScenePart } from "./scene.js";
import { OutputStreams } from "./streams.js";
import { CURSOR_SHOW } from "./terminal-style.js";

const ESC = "\u001b[";
const CURSOR_HIDE = `${ESC}?25l`;
const ERASE_BELOW = `${ESC}0J`;

/** Screen selects one foreground owner; Frame knows nothing about operations. */
export interface ActiveView {
  readonly owner: symbol;
  readonly kind: "activity" | "interaction";
  readonly part: ScenePart;
}

export class Frame extends ServiceMap.Service<
  Frame,
  {
    readonly stdout: (content: string) => Effect.Effect<void>;
    readonly stderr: (content: string) => Effect.Effect<void>;
    /** Append a milestone and replace the foreground under one write permit. */
    readonly updateActive: (
      active: ActiveView | undefined,
      content?: string,
      immediate?: boolean,
    ) => Effect.Effect<void>;
    /** A stale owner cannot finish or clear a newer interaction. */
    readonly finishActive: (
      owner: symbol,
      content: string,
      next?: ActiveView,
    ) => Effect.Effect<void>;
    readonly canInteract: Effect.Effect<boolean>;
    readonly settle: Effect.Effect<void>;
  }
>()("axm.sh/screen/Frame") {}

interface FrameState {
  readonly active: ActiveView | undefined;
  readonly painted: ReadonlyArray<string>;
  readonly columns: number | undefined;
  readonly rows: number | undefined;
  readonly cursorHidden: boolean;
  /** Raw text without a newline has not yielded a safe place to animate. */
  readonly freshLine: boolean;
}

const initialState: FrameState = {
  active: undefined,
  painted: [],
  columns: undefined,
  rows: undefined,
  cursorHidden: false,
  freshLine: true,
};

export interface FrameOptions {
  readonly animate: boolean;
  readonly quiet: boolean;
  readonly colors: boolean;
  readonly glyphs?: Glyphs;
}

/** Serializes writes and owns only the transient tail, never the transcript. */
export const FrameLive = (options: FrameOptions): Layer.Layer<Frame, never, OutputStreams> =>
  Layer.effect(
    Frame,
    Effect.gen(function* () {
      const streams = yield* OutputStreams;
      const state = yield* Ref.make(initialState);
      const permit = yield* Semaphore.make(1);

      const eraseLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        if (current.painted.length === 0) return;
        const facts = yield* streams.facts;
        // Terminals disagree about reflow and cursor placement after resize.
        // Abandon uncertain geometry instead of moving into committed history.
        const resized = current.columns !== facts.columns || current.rows !== facts.rows;
        const up = current.painted.length - 1;
        yield* streams.stderr(
          resized ? "\r\n" : `\r${up > 0 ? `${ESC}${String(up)}A` : ""}${ERASE_BELOW}`,
        );
        yield* Ref.update(state, (value) => ({ ...value, painted: [] }));
      });

      const repaintLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        const facts = yield* streams.facts;
        const active = current.active;
        const eligible =
          facts.stderrIsTTY &&
          facts.columns > 1 &&
          current.freshLine &&
          active !== undefined &&
          (active.kind === "interaction" || (options.animate && !options.quiet));
        const nowMs = yield* Clock.currentTimeMillis;
        const glyphs = options.glyphs ?? unicodeGlyphs;
        const spinner = glyphs.spinner[Math.floor(nowMs / 80) % glyphs.spinner.length] ?? "";
        const space = { columns: liveColumns(facts.columns), rows: liveRows(facts.rows) };
        const lines = eligible
          ? paintLivePart(active.part({ ...space, spinner, nowMs }), space, {
              colors: options.colors,
              glyphs,
              spinner,
            })
          : [];
        if (
          lines.join("\n") === current.painted.join("\n") &&
          current.columns === facts.columns &&
          current.rows === facts.rows &&
          current.cursorHidden === lines.length > 0
        )
          return;
        yield* eraseLocked;
        if (lines.length > 0) yield* streams.stderr(`${CURSOR_HIDE}${lines.join("\n")}`);
        else if (current.cursorHidden) yield* streams.stderr(CURSOR_SHOW);
        yield* Ref.update(state, (value) => ({
          ...value,
          painted: lines,
          columns: facts.columns,
          rows: facts.rows,
          cursorHidden: lines.length > 0,
        }));
      });

      const appendLocked = (channel: "stdout" | "stderr", content: string) =>
        Effect.gen(function* () {
          if (content.length === 0) return;
          yield* eraseLocked;
          const facts = yield* streams.facts;
          yield* streams[channel](content);
          // Redirected stdout cannot change the stderr terminal's cursor.
          // Two TTY streams may share it; never add bytes to exact raw output.
          if (channel === "stderr" || facts.stdoutIsTTY) {
            yield* Ref.update(state, (value) => ({
              ...value,
              freshLine: content.endsWith("\n"),
            }));
          }
        });

      const write = (channel: "stdout" | "stderr", content: string) =>
        permit.withPermit(appendLocked(channel, content).pipe(Effect.andThen(repaintLocked)));

      const updateActive = (active: ActiveView | undefined, content = "", immediate = true) =>
        permit.withPermit(
          Effect.gen(function* () {
            yield* appendLocked("stderr", content);
            yield* Ref.update(state, (value) => ({ ...value, active }));
            if (immediate || content.length > 0) yield* repaintLocked;
          }),
        );

      const finishActive = (owner: symbol, content: string, next?: ActiveView) =>
        permit.withPermit(
          Effect.gen(function* () {
            if ((yield* Ref.get(state)).active?.owner !== owner) return;
            yield* appendLocked("stderr", content);
            yield* Ref.update(state, (value) => ({ ...value, active: next }));
            yield* repaintLocked;
          }),
        );

      const settle = permit.withPermit(
        Effect.gen(function* () {
          yield* eraseLocked;
          const current = yield* Ref.get(state);
          if (current.cursorHidden) yield* streams.stderr(CURSOR_SHOW);
          yield* Ref.set(state, { ...initialState, freshLine: current.freshLine });
        }),
      );

      const repaint = permit.withPermit(repaintLocked);
      if (options.animate) {
        yield* Effect.repeat(repaint, Schedule.spaced("80 millis")).pipe(Effect.forkScoped);
      }
      // Questions resize even when progress animation is disabled.
      yield* streams.resize.pipe(
        Stream.runForEach(() => repaint),
        Effect.forkScoped,
      );
      yield* Effect.addFinalizer(() => settle);

      return {
        stdout: (content) => write("stdout", content),
        stderr: (content) => write("stderr", content),
        updateActive,
        finishActive,
        canInteract: Effect.map(
          streams.facts,
          (facts) => facts.stderrIsTTY && facts.columns >= 20 && facts.rows >= 4,
        ),
        settle,
      };
    }),
  );
