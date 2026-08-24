/**
 * The recovery capsule.
 *
 * The only recovery state that survives a process: one live capsule per
 * blocked recovery condition, under `.axm/tmp/recovery/<capsule-id>/` inside
 * the tool-owned transient location. The capsule is the workspace
 * transaction's snapshot store from the start — an entry is durably recorded
 * before its path is first mutated, and a path whose entry cannot be recorded
 * is never mutated — so a restoration failure always has its snapshots
 * already on disk. After restoration completes and verifies, the capsule is
 * removed entirely; a capsule outlives its process only when recovery is
 * genuinely required.
 *
 * Detection fails closed: an unreadable or malformed capsule is a blocking
 * conflict, never evidence of absence.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { createHash, randomBytes } from "node:crypto";

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { makeAppError, type AppError } from "../app-error/index.js";

const RECOVERY_SEGMENTS = ["tmp", "recovery"] as const;

/** `<workspaceDir>/tmp/recovery` — inside the tool-owned transient location. */
export const recoveryCapsulesDir = (path: Path.Path, workspaceDir: string): string =>
  path.join(workspaceDir, ...RECOVERY_SEGMENTS);

export const CapsuleEntrySchema = Schema.Union([
  Schema.Struct({
    path: Schema.String,
    preState: Schema.Literal("absent"),
  }),
  Schema.Struct({
    path: Schema.String,
    preState: Schema.Literal("copied"),
    /** Artifact file name inside the capsule directory holding the prior bytes. */
    snapshot: Schema.String,
  }),
  Schema.Struct({
    path: Schema.String,
    preState: Schema.Literal("symlink"),
    linkTarget: Schema.String,
  }),
]).annotate({
  identifier: "RecoveryCapsuleEntry",
  description:
    "One protected path: its workspace-relative location, its pre-mutation state, and an explicit reference to its snapshot artifact. Entry order fixes restoration order.",
});
export type CapsuleEntry = typeof CapsuleEntrySchema.Type;

export const CapsuleSealSchema = Schema.Struct({
  cause: Schema.Literals(["failure", "interruption", "compromised"] as const),
  sealedAt: Schema.String,
  /** Content hash of what the failed operation left at each entry path. */
  retained: Schema.Array(Schema.Struct({ path: Schema.String, stateHash: Schema.String })),
}).annotate({ identifier: "RecoveryCapsuleSeal" });
export type CapsuleSeal = typeof CapsuleSealSchema.Type;

export const RecoveryCapsuleSchema = Schema.Struct({
  capsuleVersion: Schema.Literal(1),
  /** `restorable` carries snapshots; `retained-work` only blocks with precise state. */
  form: Schema.Literals(["restorable", "retained-work"] as const),
  capsuleId: Schema.String,
  /** Per-run metadata only; never part of any machine-document value. */
  operationId: Schema.String,
  command: Schema.String,
  createdAt: Schema.String,
  entries: Schema.Array(CapsuleEntrySchema),
  seal: Schema.optional(CapsuleSealSchema),
}).annotate({
  identifier: "RecoveryCapsule",
  description: "Bounded transient recovery state for one blocked recovery condition.",
});
export type RecoveryCapsule = typeof RecoveryCapsuleSchema.Type;

const decodeCapsule = Schema.decodeUnknownOption(RecoveryCapsuleSchema);

export type DetectedCapsule =
  | { readonly state: "readable"; readonly dir: string; readonly capsule: RecoveryCapsule }
  | { readonly state: "unreadable"; readonly dir: string; readonly problem: string };

const capsuleError = (detail: string, cause?: unknown): AppError =>
  makeAppError({ code: "conflict", detail, cause });

const sha256 = (input: string | Uint8Array): string =>
  createHash("sha256").update(input).digest("hex");

/**
 * Deterministic content hash of a path's current state: file bytes, symlink
 * target, recursive directory listing, or the literal `absent`.
 */
export const hashPathState = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<string> =>
  Effect.gen(function* () {
    const link = yield* fs.readLink(target).pipe(Effect.option);
    if (Option.isSome(link)) return sha256(`symlink:${link.value}`);
    const exists = yield* fs.exists(target);
    if (!exists) return "absent";
    const info = yield* fs.stat(target);
    if (info.type === "Directory") {
      const entries = [...(yield* fs.readDirectory(target))].sort();
      const parts: Array<string> = [];
      for (const entry of entries) {
        const child = yield* hashPathState(fs, path, path.join(target, entry));
        parts.push(`${entry}:${child}`);
      }
      return sha256(`dir:${parts.join("\n")}`);
    }
    const bytes = yield* fs.readFile(target);
    return sha256(bytes);
  }).pipe(Effect.catch(() => Effect.succeed("unhashable")));

const capsuleJsonPath = (path: Path.Path, dir: string): string => path.join(dir, "capsule.json");

const writeCapsuleJson = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  capsule: RecoveryCapsule,
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const file = capsuleJsonPath(path, dir);
    const staged = `${file}.tmp`;
    yield* fs.writeFileString(staged, `${JSON.stringify(capsule, null, 2)}\n`);
    yield* fs.rename(staged, file);
  }).pipe(
    Effect.mapError((cause) =>
      capsuleError(`Failed to record the recovery capsule at ${dir}`, cause),
    ),
  );

export interface CapsuleWriter {
  readonly dir: string;
  readonly workspaceDir: string;
  readonly baseDir: string;
  readonly entries: Array<CapsuleEntry>;
  readonly capsuleId: string;
  readonly operationId: string;
  readonly command: string;
  readonly createdAt: string;
}

const writerDocument = (writer: CapsuleWriter, seal?: CapsuleSeal): RecoveryCapsule => ({
  capsuleVersion: 1,
  form: "restorable",
  capsuleId: writer.capsuleId,
  operationId: writer.operationId,
  command: writer.command,
  createdAt: writer.createdAt,
  entries: [...writer.entries],
  ...(seal === undefined ? {} : { seal }),
});

/**
 * Open a live capsule as the transaction's snapshot store. Fails when a live
 * capsule already occupies the directory: an unresolved recovery condition
 * must never be overwritten.
 */
export const createRecoveryCapsule = (args: {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceDir: string;
  readonly capsuleId: string;
  readonly command: string;
}): Effect.Effect<CapsuleWriter, AppError> =>
  Effect.gen(function* () {
    const { fs, path } = args;
    const dir = path.join(recoveryCapsulesDir(path, args.workspaceDir), args.capsuleId);
    const occupied = yield* fs
      .exists(capsuleJsonPath(path, dir))
      .pipe(Effect.catch(() => Effect.succeed(true)));
    if (occupied) {
      return yield* capsuleError(
        `A live recovery capsule already exists at ${dir}; resolve it before mutating the workspace.`,
      );
    }
    yield* fs
      .makeDirectory(dir, { recursive: true })
      .pipe(
        Effect.mapError((cause) =>
          capsuleError(`Failed to create the recovery capsule at ${dir}`, cause),
        ),
      );
    const createdAt = DateTime.formatIso(yield* DateTime.now);
    const writer: CapsuleWriter = {
      dir,
      workspaceDir: args.workspaceDir,
      baseDir: path.dirname(args.workspaceDir),
      entries: [],
      capsuleId: args.capsuleId,
      operationId: randomBytes(8).toString("hex"),
      command: args.command,
      createdAt,
    };
    yield* writeCapsuleJson(fs, path, dir, writerDocument(writer));
    return writer;
  });

/** The artifact path the next `copied` entry must snapshot into. */
export const nextCapsuleArtifact = (path: Path.Path, writer: CapsuleWriter): string =>
  path.join(writer.dir, `${writer.entries.length}.snap`);

/** Workspace-relative form of a protected target, resolved against the workspace base. */
export const capsuleEntryPath = (path: Path.Path, writer: CapsuleWriter, target: string): string =>
  path.relative(writer.baseDir, target);

/**
 * Durably record one entry before its path is first mutated. A failure here
 * must fail the unit: the path is not yet mutated and must stay that way.
 */
export const appendCapsuleEntry = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  writer: CapsuleWriter,
  entry: CapsuleEntry,
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    writer.entries.push(entry);
    yield* writeCapsuleJson(fs, path, writer.dir, writerDocument(writer)).pipe(
      Effect.tapError(() => Effect.sync(() => writer.entries.pop())),
    );
  });

/**
 * Seal the capsule at terminal failure: retained-state hash per entry plus
 * the termination cause. Best-effort — an unsealed capsule still blocks.
 */
export const sealRecoveryCapsule = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  writer: CapsuleWriter,
  cause: CapsuleSeal["cause"],
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const sealedAt = DateTime.formatIso(yield* DateTime.now);
    const retained: Array<{ path: string; stateHash: string }> = [];
    for (const entry of writer.entries) {
      const absolute = path.resolve(writer.baseDir, entry.path);
      retained.push({ path: entry.path, stateHash: yield* hashPathState(fs, path, absolute) });
    }
    yield* writeCapsuleJson(
      fs,
      path,
      writer.dir,
      writerDocument(writer, { cause, sealedAt, retained }),
    );
    return true;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/**
 * Remove a capsule completely, leaving `tmp/recovery` (and nothing else)
 * behind only while other capsules remain.
 */
export const removeRecoveryCapsule = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  workspaceDir: string,
  dir: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* fs.remove(dir, { recursive: true, force: true });
    const recoveryDir = recoveryCapsulesDir(path, workspaceDir);
    const entries = yield* fs.readDirectory(recoveryDir);
    if (entries.length === 0) {
      yield* fs.remove(recoveryDir, { recursive: true, force: false });
    }
  }).pipe(Effect.ignore);

/**
 * Enumerate live capsules. Absence of the recovery directory is absence of
 * recovery state; every error interpreting present state is reported as an
 * unreadable capsule so callers block instead of proceeding.
 */
export const readRecoveryCapsules = (
  workspaceDir: string,
): Effect.Effect<ReadonlyArray<DetectedCapsule>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const recoveryDir = recoveryCapsulesDir(path, workspaceDir);
    const present = yield* fs.exists(recoveryDir).pipe(Effect.catch(() => Effect.succeed(true)));
    if (!present) return [];
    const listing = yield* fs.readDirectory(recoveryDir).pipe(Effect.option);
    if (Option.isNone(listing)) {
      return [
        {
          state: "unreadable",
          dir: recoveryDir,
          problem: "The recovery location exists but cannot be read.",
        },
      ] satisfies ReadonlyArray<DetectedCapsule>;
    }
    const detected: Array<DetectedCapsule> = [];
    for (const name of [...listing.value].sort()) {
      const dir = path.join(recoveryDir, name);
      const content = yield* fs.readFileString(capsuleJsonPath(path, dir)).pipe(Effect.option);
      if (Option.isNone(content)) {
        detected.push({
          state: "unreadable",
          dir,
          problem: "The capsule record cannot be read.",
        });
        continue;
      }
      const parsed = yield* Effect.try({
        try: (): unknown => JSON.parse(content.value),
        catch: () => undefined,
      }).pipe(Effect.catch(() => Effect.succeed<unknown>(undefined)));
      const decoded = decodeCapsule(parsed);
      if (decoded._tag === "None") {
        detected.push({
          state: "unreadable",
          dir,
          problem: "The capsule record is malformed.",
        });
        continue;
      }
      detected.push({ state: "readable", dir, capsule: decoded.value });
    }
    return detected;
  });

/**
 * True only when every sealed entry's current bytes still match the
 * retained-state hash the seal recorded. Any error reading current state
 * fails the match — restoration must not proceed on unproven ground.
 */
export const capsuleMatchesSealedState = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  workspaceDir: string,
  capsule: RecoveryCapsule,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const seal = capsule.seal;
    if (seal === undefined) return false;
    const baseDir = path.dirname(path.resolve(workspaceDir));
    for (const record of seal.retained) {
      const current = yield* hashPathState(fs, path, path.resolve(baseDir, record.path));
      if (current !== record.stateHash || current === "unhashable") return false;
    }
    return true;
  }).pipe(Effect.catch(() => Effect.succeed(false)));

/**
 * Restore every entry from its snapshot, in reverse recording order, verify
 * the restored bytes, and remove the capsule. All-or-nothing: any failure
 * leaves the capsule in place and reports the error.
 */
export const restoreRecoveryCapsule = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  workspaceDir: string,
  detected: { readonly dir: string; readonly capsule: RecoveryCapsule },
): Effect.Effect<ReadonlyArray<string>, AppError> =>
  Effect.gen(function* () {
    const { dir, capsule } = detected;
    if (capsule.form !== "restorable") {
      return yield* capsuleError(
        `The recovery capsule at ${dir} retains work without snapshots; nothing can be restored from it.`,
      );
    }
    const baseDir = path.dirname(path.resolve(workspaceDir));
    const restore = Effect.gen(function* () {
      for (const entry of [...capsule.entries].reverse()) {
        const target = path.resolve(baseDir, entry.path);
        yield* fs.remove(target, { recursive: true, force: true });
        if (entry.preState === "absent") continue;
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        if (entry.preState === "symlink") {
          yield* fs.symlink(entry.linkTarget, target);
          continue;
        }
        yield* fs.copy(path.join(dir, entry.snapshot), target, { preserveTimestamps: true });
      }
    }).pipe(
      Effect.mapError((cause) =>
        capsuleError(`Restoration from the recovery capsule at ${dir} failed.`, cause),
      ),
    );
    yield* restore;
    for (const entry of capsule.entries) {
      const target = path.resolve(baseDir, entry.path);
      const verified = yield* Effect.gen(function* () {
        if (entry.preState === "absent") {
          return !(yield* fs.exists(target));
        }
        if (entry.preState === "symlink") {
          const link = yield* fs.readLink(target).pipe(Effect.option);
          return Option.exists(link, (value) => value === entry.linkTarget);
        }
        const restored = yield* hashPathState(fs, path, target);
        const snapshot = yield* hashPathState(fs, path, path.join(dir, entry.snapshot));
        return restored === snapshot && restored !== "unhashable";
      }).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!verified) {
        return yield* capsuleError(
          `Restoration from the recovery capsule at ${dir} did not verify for ${entry.path}.`,
        );
      }
    }
    yield* removeRecoveryCapsule(fs, path, workspaceDir, dir);
    return capsule.entries.map((entry) => entry.path);
  });
