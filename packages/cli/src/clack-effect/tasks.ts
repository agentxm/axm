import * as Effect from "effect/Effect";
import { ClackSpinner } from "./spinner/index.js";

export interface ClackTask<E, R> {
  readonly title: string;
  readonly task: (
    message: (msg: string) => Effect.Effect<void>,
  ) => Effect.Effect<string | void, E, R>;
  readonly enabled?: boolean;
}

export const runTasks = <E, R>(
  tasks: ReadonlyArray<ClackTask<E, R>>,
): Effect.Effect<void, E, ClackSpinner | R> =>
  Effect.gen(function* () {
    const s = yield* ClackSpinner;
    yield* Effect.forEach(
      tasks.filter((t) => t.enabled !== false),
      (task) =>
        s.withSpinner(task.title, (handle) =>
          Effect.map(
            task.task((msg) => handle.message(msg)),
            (result) => result ?? task.title,
          ),
        ),
      { concurrency: 1 },
    );
  });
