/**
 * Tool-owned operation records.
 *
 * One declared location — `.axm/operations/` — holds append-only recovery
 * records: durable, machine-readable statements that an operation retained
 * work or failed to restore, written when it happens and detectable by every
 * later plan-family invocation until resolved. Resolution appends a marker
 * file beside the record; records are never rewritten.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export const OPERATION_RECORDS_DIRNAME = "operations";

export const RecoveryRecordSchema = Schema.Struct({
  recordVersion: Schema.Literal(1),
  kind: Schema.Literals(["interruption", "restoration-failure"] as const),
  command: Schema.String,
  occurredAt: Schema.String,
  signal: Schema.optional(Schema.Literals(["SIGINT", "SIGTERM"] as const)),
  retained: Schema.Array(Schema.String),
  resolveBy: Schema.String,
  candidateId: Schema.optional(Schema.String),
}).annotate({
  identifier: "RecoveryRecord",
  title: "Recovery Record",
  description: "Durable statement that an operation retained work needing recovery.",
});
export type RecoveryRecord = typeof RecoveryRecordSchema.Type;

export interface OpenRecoveryRecord {
  readonly record: RecoveryRecord;
  readonly path: string;
}

const recordsDir = (path: Path.Path, workspaceDir: string): string =>
  path.join(workspaceDir, OPERATION_RECORDS_DIRNAME);

const decodeRecord = Schema.decodeUnknownOption(RecoveryRecordSchema);

/** Write one recovery record. Failures are logged, never operational. */
export const writeOperationRecoveryRecord = (args: {
  readonly workspaceDir: string;
  readonly kind: RecoveryRecord["kind"];
  readonly command: string;
  readonly retained: ReadonlyArray<string>;
  readonly resolveBy: string;
  readonly signal?: "SIGINT" | "SIGTERM";
  readonly candidateId?: string;
}): Effect.Effect<string | undefined, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = recordsDir(path, args.workspaceDir);
    const occurredAt = yield* DateTime.now;
    const record: RecoveryRecord = {
      recordVersion: 1,
      kind: args.kind,
      command: args.command,
      occurredAt: DateTime.formatIso(occurredAt),
      ...(args.signal === undefined ? {} : { signal: args.signal }),
      retained: [...args.retained],
      resolveBy: args.resolveBy,
      ...(args.candidateId === undefined ? {} : { candidateId: args.candidateId }),
    };
    const file = path.join(dir, `${String(DateTime.toEpochMillis(occurredAt))}-${args.kind}.json`);
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(file, `${JSON.stringify(record, null, 2)}\n`);
    return file;
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Failed to write operation recovery record", cause).pipe(
        Effect.as(undefined),
      ),
    ),
  );

/** Records whose condition no later invocation has yet resolved. */
export const readOpenRecoveryRecords = (
  workspaceDir: string,
): Effect.Effect<ReadonlyArray<OpenRecoveryRecord>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = recordsDir(path, workspaceDir);
    const entries = yield* fs.readDirectory(dir);
    const names = new Set(entries);
    const open: Array<OpenRecoveryRecord> = [];
    for (const entry of [...entries].sort()) {
      if (!entry.endsWith(".json") || entry.endsWith(".resolved.json")) continue;
      if (names.has(`${entry.slice(0, -".json".length)}.resolved.json`)) continue;
      const file = path.join(dir, entry);
      const content = yield* fs.readFileString(file);
      const parsed = yield* Effect.try({
        try: (): unknown => JSON.parse(content),
        catch: () => undefined,
      }).pipe(Effect.catch(() => Effect.succeed<unknown>(undefined)));
      const decoded = decodeRecord(parsed);
      if (decoded._tag === "Some") {
        open.push({ record: decoded.value, path: file });
      }
    }
    return open;
  }).pipe(Effect.catch(() => Effect.succeed([])));

/**
 * Mark every open record resolved by appending a `.resolved.json` marker
 * beside it; the records themselves are never rewritten.
 */
export const resolveRecoveryRecords = (args: {
  readonly workspaceDir: string;
  readonly resolvedBy: string;
}): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const open = yield* readOpenRecoveryRecords(args.workspaceDir);
    const resolvedAt = yield* DateTime.now;
    for (const { path: file } of open) {
      const marker = `${file.slice(0, -".json".length)}.resolved.json`;
      yield* fs
        .writeFileString(
          marker,
          `${JSON.stringify(
            {
              resolvedBy: args.resolvedBy,
              resolvedAt: DateTime.formatIso(resolvedAt),
            },
            null,
            2,
          )}\n`,
        )
        .pipe(Effect.ignore);
    }
  }).pipe(Effect.catchCause(() => Effect.void));
