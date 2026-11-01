import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

export interface ReleaseFileSnapshot {
  readonly path: string;
  readonly original: string;
}

/** Restore the authored files after packaging, including failed or interrupted builds. */
export const withReleaseFileSnapshots = <A, E, R>(
  paths: readonly string[],
  use: (snapshots: readonly ReleaseFileSnapshot[]) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.acquireUseRelease(
      Effect.forEach(paths, (path) =>
        fs.readFileString(path).pipe(Effect.map((original) => ({ path, original }))),
      ),
      use,
      // Attempt every restore and retain all typed write failures.
      (snapshots) =>
        Effect.validate(snapshots, ({ path, original }) => fs.writeFileString(path, original), {
          discard: true,
        }),
    );
  });
