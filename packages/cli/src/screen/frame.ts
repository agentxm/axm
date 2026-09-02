import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";

import { OutputStreams } from "./streams.js";

const ESC = "\u001b[";
const CURSOR_HIDE = `${ESC}?25l`;
const CURSOR_SHOW = `${ESC}?25h`;
const ERASE_LINE = `\r${ESC}2K`;
const CURSOR_UP = `${ESC}1A`;
const SPINNERS = ["◒", "◐", "◓", "◑"] as const;

export type FrameTaskEnd = "success" | "failed" | "cancelled" | "cleared";

export interface FrameTaskHandle {
  readonly update: (label: string) => Effect.Effect<void>;
  readonly progress: (done: number, total: number) => Effect.Effect<void>;
  readonly child: (label: string) => Effect.Effect<FrameTaskHandle>;
  readonly end: (end: FrameTaskEnd, label?: string) => Effect.Effect<void>;
}

export class Frame extends ServiceMap.Service<
  Frame,
  {
    readonly stdout: (content: string) => Effect.Effect<void>;
    readonly stderr: (content: string) => Effect.Effect<void>;
    readonly task: (label: string) => Effect.Effect<FrameTaskHandle>;
    readonly prompt: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
    readonly settle: Effect.Effect<void>;
  }
>()("axm.sh/screen/Frame") {}

interface ActiveTask {
  readonly id: number;
  readonly parentId?: number;
  readonly label: string;
  readonly done?: number;
  readonly total?: number;
}

interface FrameState {
  readonly tasks: ReadonlyArray<ActiveTask>;
  readonly paintedLines: number;
  readonly spinner: number;
  readonly nextId: number;
  readonly paused: boolean;
}

const initialState: FrameState = {
  tasks: [],
  paintedLines: 0,
  spinner: 0,
  nextId: 1,
  paused: false,
};

const eraseBytes = (lines: number): string => {
  if (lines <= 0) return "";
  return `${ERASE_LINE}${Array.from({ length: lines - 1 }, () => `${CURSOR_UP}${ERASE_LINE}`).join("")}`;
};

const taskLine = (task: ActiveTask, spinner: number, tasks: ReadonlyArray<ActiveTask>): string => {
  const child =
    task.parentId !== undefined && tasks.some((candidate) => candidate.id === task.parentId);
  const prefix = child ? "  " : "";
  const progress =
    task.done === undefined || task.total === undefined ? "" : ` (${task.done}/${task.total})`;
  return `${prefix}${SPINNERS[spinner % SPINNERS.length] ?? SPINNERS[0]} ${task.label}${progress}`;
};

const settledSymbol = (end: FrameTaskEnd): string => {
  if (end === "success") return "✔";
  if (end === "failed") return "✖";
  if (end === "cancelled") return "■";
  return "";
};

export const FrameLive = (options: {
  readonly animate: boolean;
  readonly quiet: boolean;
}): Layer.Layer<Frame, never, OutputStreams> =>
  Layer.effect(
    Frame,
    Effect.gen(function* () {
      const streams = yield* OutputStreams;
      const state = yield* Ref.make(initialState);
      const permit = yield* Semaphore.make(1);

      const repaintLocked = Effect.gen(function* () {
        const current = yield* Ref.get(state);
        const erase = eraseBytes(current.paintedLines);
        const lines =
          current.paused || !options.animate || options.quiet
            ? []
            : current.tasks.map((task) => taskLine(task, current.spinner, current.tasks));
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
          yield* Ref.set(state, { ...current, paintedLines: 0, tasks: [] });
        }),
      );

      const endTask = (id: number, end: FrameTaskEnd, label?: string) =>
        permit.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            const task = current.tasks.find((candidate) => candidate.id === id);
            if (task === undefined) return;
            if (current.paintedLines > 0) yield* streams.stderr(eraseBytes(current.paintedLines));
            const remaining = current.tasks.filter(
              (candidate) => candidate.id !== id && candidate.parentId !== id,
            );
            const symbol = settledSymbol(end);
            if (!options.quiet && end !== "cleared") {
              yield* streams.stderr(`${symbol} ${label ?? task.label}\n`);
            }
            yield* Ref.set(state, { ...current, tasks: remaining, paintedLines: 0 });
            yield* repaintLocked;
          }),
        );

      const addTask = (label: string, parentId?: number): Effect.Effect<FrameTaskHandle> =>
        permit.withPermit(
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            const task: ActiveTask = {
              id: current.nextId,
              label,
              ...(parentId === undefined ? {} : { parentId }),
            };
            yield* Ref.set(state, {
              ...current,
              tasks: [...current.tasks, task],
              nextId: current.nextId + 1,
            });
            if (!options.animate && !options.quiet) {
              yield* streams.stderr(`${parentId === undefined ? "" : "  "}◆ ${label}\n`);
            }
            yield* repaintLocked;

            const updateTask = (update: (task: ActiveTask) => ActiveTask): Effect.Effect<void> =>
              permit.withPermit(
                Effect.gen(function* () {
                  yield* Ref.update(state, (value) => ({
                    ...value,
                    tasks: value.tasks.map((candidate) =>
                      candidate.id === task.id ? update(candidate) : candidate,
                    ),
                  }));
                  yield* repaintLocked;
                }),
              );

            return {
              update: (nextLabel) =>
                updateTask((candidate) => ({ ...candidate, label: nextLabel })),
              progress: (done, total) =>
                updateTask((candidate) => ({
                  ...candidate,
                  done: Math.max(0, done),
                  total: Math.max(0, total),
                })),
              child: (childLabel) => addTask(childLabel, task.id),
              end: (end, nextLabel) => endTask(task.id, end, nextLabel),
            };
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
        task: addTask,
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

export const taskEndForCause = (cause: Cause.Cause<unknown>): FrameTaskEnd =>
  Cause.hasInterruptsOnly(cause) ? "cancelled" : "failed";
