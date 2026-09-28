import { randomUUID } from "node:crypto";
import { resolveUserAxmHome } from "@agentxm/workspace-kernel/workspace-state";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

const INSTALLATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const readInstallationId = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.readFileString(filePath).pipe(
    Effect.map((value) => value.trim()),
    Effect.filterOrFail((value) => INSTALLATION_ID_PATTERN.test(value)),
  );

/**
 * Load the persisted random installation identity, creating it on first use.
 * It fails when identity storage is unavailable or holds something other than
 * an identity; the caller then reports without one and never repairs the file.
 */
export const loadOrCreateInstallationId = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const axmHome = yield* resolveUserAxmHome();
  const directory = path.join(axmHome, "telemetry");
  const filePath = path.join(directory, "installation-id");
  const existing = yield* readInstallationId(fs, filePath).pipe(Effect.option);
  if (Option.isSome(existing)) return existing.value;

  yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
  const candidate = randomUUID();
  // The identity appears under its name only once complete: it is written in
  // full under a name of its own, then linked into place, which fails when an
  // identity already exists. An interrupted creation leaves no identity
  // behind, never an empty file every later invocation would read as corrupt.
  const staged = path.join(directory, `installation-id.${candidate}.tmp`);
  const created = yield* fs
    .writeFileString(staged, `${candidate}\n`, { flag: "wx", mode: 0o600 })
    .pipe(
      Effect.andThen(fs.link(staged, filePath)),
      Effect.ensuring(fs.remove(staged).pipe(Effect.ignore)),
      Effect.result,
    );
  if (created._tag === "Success") return candidate;
  if (created.failure.reason._tag === "AlreadyExists") {
    return yield* readInstallationId(fs, filePath);
  }
  return yield* created.failure;
});
