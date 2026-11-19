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
import { OutputStreams, type OutputWriteFailed } from "./streams.js";
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
    readonly stdout: (content: string) => Effect.Effect<void, OutputWriteFailed>;
    readonly stderr: (content: string) => Effect.Effect<void, OutputWriteFailed>;
    /** Append a milestone and replace the foreground under one write permit. */
    readonly updateActive: (
      active: ActiveView | undefined,
      content?: string,
      immediate?: boolean,
    ) => Effect.Effect<void, OutputWriteFailed>;
    /** A stale owner cannot finish or clear a newer interaction. */
    readonly finishActive: (
      owner: symbol,
      content: string,
      next?: ActiveView,
    ) => Effect.Effect<void, OutputWriteFailed>;
    readonly canInteract: Effect.Effect<boolean>;
    readonly settle: Effect.Effect<void, OutputWriteFailed>;
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
  /** Whether the terminal's taskbar is showing progress this frame started. */
  readonly progressShown: boolean;
}

const initialState: FrameState = {
  active: undefined,
  painted: [],
  columns: undefined,
  rows: undefined,
  cursorHidden: false,
  freshLine: true,
  progressShown: false,
};

interface FrameOptions {
  readonly animate: boolean;
  readonly quiet: boolean;
  readonly colors: boolean;
  readonly glyphs?: Glyphs;
  /** Whether the terminal draws OSC 9;4 progress in its tab or taskbar. */
  readonly taskbarProgress?: boolean;
}

/**
 * DEC private mode 2026: a terminal that supports it holds a frame until the
 * end marker and draws it whole, so an erase and its repaint never flicker; a
 * terminal that does not ignores both markers.
 */
const SYNC_BEGIN = `${ESC}?2026h`;
const SYNC_END = `${ESC}?2026l`;

/** OSC 9;4 taskbar progress: indeterminate while work runs, cleared when it stops. */
const TASKBAR_BUSY = "\u001b]9;4;3;0\u0007";
const TASKBAR_CLEAR = "\u001b]9;4;0;0\u0007";

/** One piece of an update, for the stream it belongs to. */
interface Segment {
  readonly channel: "stdout" | "stderr";
  readonly text: string;
}

/** Adjacent pieces for one stream travel as one write. */
const coalesce = (segments: ReadonlyArray<Segment>): ReadonlyArray<Segment> =>
  segments
    .filter((segment) => segment.text.length > 0)
    .reduce<Array<Segment>>((merged, segment) => {
      const last = merged.at(-1);
      if (last?.channel === segment.channel) {
        merged[merged.length - 1] = { channel: segment.channel, text: last.text + segment.text };
      } else {
        merged.push(segment);
      }
      return merged;
    }, []);

/** Serializes writes and owns only the transient tail, never the transcript. */
export const FrameLive = (options: FrameOptions): Layer.Layer<Frame, never, OutputStreams> =>
  Layer.effect(
    Frame,
    Effect.gen(function* () {
      const streams = yield* OutputStreams;
      const state = yield* Ref.make(initialState);
      const permit = yield* Semaphore.make(1);

      /**
       * Write one update. Where it moves the cursor, its stderr pieces open
       * and close one synchronized frame, so the terminal draws the erase, any
       * transcript text, and the repaint as one picture.
       */
      const emit = (segments: ReadonlyArray<Segment>, framed: boolean) =>
        Effect.gen(function* () {
          const merged = coalesce(segments);
          const stderrAt = merged.flatMap((segment, index) =>
            segment.channel === "stderr" ? [index] : [],
          );
          const first = stderrAt[0];
          const last = stderrAt.at(-1);
          const sync = framed && first !== undefined && last !== undefined;
          for (const [index, segment] of merged.entries()) {
            const text = `${sync && index === first ? SYNC_BEGIN : ""}${segment.text}${sync && index === last ? SYNC_END : ""}`;
            yield* streams[segment.channel](text);
          }
        });

      /** The bytes that take the painted tail away, and the state without it. */
      const eraseLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        if (current.painted.length === 0) return "";
        const facts = yield* streams.facts;
        // Terminals disagree about reflow and cursor placement after resize.
        // Abandon uncertain geometry instead of moving into committed history.
        const resized = current.columns !== facts.columns || current.rows !== facts.rows;
        const up = current.painted.length - 1;
        yield* Ref.update(state, (value) => ({ ...value, painted: [] }));
        return resized ? "\r\n" : `\r${up > 0 ? `${ESC}${String(up)}A` : ""}${ERASE_BELOW}`;
      });

      /** Taskbar progress follows whether anything is in the foreground. */
      const taskbar = (busy: boolean, shown: boolean): string =>
        options.taskbarProgress !== true || busy === shown
          ? ""
          : busy
            ? TASKBAR_BUSY
            : TASKBAR_CLEAR;

      /** The bytes that repaint the foreground, or nothing where it has not changed. */
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
        const progress = taskbar(active !== undefined && facts.stderrIsTTY, current.progressShown);
        if (
          lines.join("\n") === current.painted.join("\n") &&
          current.columns === facts.columns &&
          current.rows === facts.rows &&
          current.cursorHidden === lines.length > 0 &&
          progress.length === 0
        )
          return "";
        const erase = yield* eraseLocked;
        const paint =
          lines.length > 0
            ? `${CURSOR_HIDE}${lines.join("\n")}`
            : current.cursorHidden
              ? CURSOR_SHOW
              : "";
        yield* Ref.update(state, (value) => ({
          ...value,
          painted: lines,
          columns: facts.columns,
          rows: facts.rows,
          cursorHidden: lines.length > 0,
          progressShown: progress.length === 0 ? value.progressShown : progress === TASKBAR_BUSY,
        }));
        return `${erase}${progress}${paint}`;
      });

      /** The pieces that put durable content above the foreground; the first is the erase. */
      const noSegments: ReadonlyArray<Segment> = [];
      const appendLocked = (channel: "stdout" | "stderr", content: string) =>
        Effect.gen(function* () {
          if (content.length === 0) return noSegments;
          const erase = yield* eraseLocked;
          const facts = yield* streams.facts;
          // Redirected stdout cannot change the stderr terminal's cursor.
          // Two TTY streams may share it; never add bytes to exact raw output.
          if (channel === "stderr" || facts.stdoutIsTTY) {
            yield* Ref.update(state, (value) => ({
              ...value,
              freshLine: content.endsWith("\n"),
            }));
          }
          return [
            { channel: "stderr", text: erase },
            { channel, text: content },
          ] satisfies ReadonlyArray<Segment>;
        });

      /** Append, change the foreground, and repaint, as one framed write. */
      const update = (args: {
        readonly channel: "stdout" | "stderr";
        readonly content: string;
        readonly change?: (current: FrameState) => FrameState;
        readonly repaint: boolean;
      }) =>
        Effect.gen(function* () {
          const appended = yield* appendLocked(args.channel, args.content);
          if (args.change !== undefined) yield* Ref.update(state, args.change);
          const repainted = args.repaint ? yield* repaintLocked : "";
          const erased = appended[0]?.text ?? "";
          // Only cursor work opens a synchronized frame; plain transcript text
          // on a pipe or an idle terminal stays exactly as written.
          yield* emit(
            [...appended, { channel: "stderr", text: repainted }],
            erased.length > 0 || repainted.length > 0,
          );
        });

      const write = (channel: "stdout" | "stderr", content: string) =>
        permit.withPermit(update({ channel, content, repaint: true }));

      const updateActive = (active: ActiveView | undefined, content = "", immediate = true) =>
        permit.withPermit(
          update({
            channel: "stderr",
            content,
            change: (value) => ({ ...value, active }),
            repaint: immediate || content.length > 0,
          }),
        );

      const finishActive = (owner: symbol, content: string, next?: ActiveView) =>
        permit.withPermit(
          Effect.gen(function* () {
            if ((yield* Ref.get(state)).active?.owner !== owner) return;
            yield* update({
              channel: "stderr",
              content,
              change: (value) => ({ ...value, active: next }),
              repaint: true,
            });
          }),
        );

      const settle = permit.withPermit(
        Effect.gen(function* () {
          const erase = yield* eraseLocked;
          const current = yield* Ref.get(state);
          const tail = `${erase}${taskbar(false, current.progressShown)}${current.cursorHidden ? CURSOR_SHOW : ""}`;
          yield* emit([{ channel: "stderr", text: tail }], tail.length > 0);
          yield* Ref.set(state, { ...initialState, freshLine: current.freshLine });
          yield* streams.check;
        }),
      );

      const repaintNow = Effect.gen(function* () {
        const repainted = yield* repaintLocked;
        yield* emit([{ channel: "stderr", text: repainted }], repainted.length > 0);
      });

      const repaint = permit.withPermit(repaintNow);
      if (options.animate) {
        yield* Effect.repeat(repaint, Schedule.spaced("80 millis")).pipe(
          Effect.ignore,
          Effect.forkScoped,
        );
      }
      // Questions resize even when progress animation is disabled.
      yield* streams.resize.pipe(
        Stream.runForEach(() => repaint),
        Effect.ignore,
        Effect.forkScoped,
      );
      yield* Effect.addFinalizer(() => settle.pipe(Effect.ignore));

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
