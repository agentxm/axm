import * as Clock from "effect/Clock";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

/** Observe the existing exit notification; never poll or consume child output. */
export const observedProcessSpawner = (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
) =>
  ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      const span = yield* Effect.makeSpanScoped("axm.process.run", {
        // A failed/interrupted spawn may not establish whether native work began.
        // Only a delivered child handle establishes an executed lifetime.
        attributes: { "axm.work.requested": 1 },
      });
      const handle = yield* spawner.spawn(command).pipe(
        Effect.withSpan("axm.process.spawn", { attributes: { "axm.work.executed": 1 } }),
        Effect.withParentSpan(span),
        Effect.onExit((exit) =>
          Exit.isFailure(exit)
            ? Effect.gen(function* () {
                span.end(yield* Clock.currentTimeNanos, exit);
              })
            : Effect.void,
        ),
      );
      span.attribute("axm.work.executed", 1);
      yield* handle.exitCode.pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            // Scope closes the monitor before the owned process release. Keep the
            // lifetime open until that release finishes; interrupting an observer
            // does not mean the child has exited.
            if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) return;
            if (Exit.isSuccess(exit)) {
              span.attribute("axm.exit.code", exit.value);
              span.attribute("axm.outcome", exit.value === 0 ? "success" : "failure");
              if (exit.value !== 0) span.attribute("axm.failure.kind", "failure");
            }
            span.end(yield* Clock.currentTimeNanos, exit);
          }),
        ),
        Effect.ignoreCause,
        Effect.forkScoped,
      );
      return handle;
    }),
  );
