import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { makeAppError, type AppError } from "../app-error/index.js";
import { writeFileAtomic } from "../utils/index.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import {
  TRUST_STATE_FILENAME,
  WorkspaceTrustStateSchema,
  type WorkspaceTrustState,
} from "./schema.js";

export const readWorkspaceTrustState = (
  axmDir: string,
): Effect.Effect<Option.Option<WorkspaceTrustState>, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const trustPath = path.join(axmDir, TRUST_STATE_FILENAME);
    const exists = yield* fs.exists(trustPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to inspect workspace trust state at ${trustPath}`,
          cause,
        }),
      ),
    );
    if (!exists) return Option.none<WorkspaceTrustState>();

    const raw = yield* fs.readFileString(trustPath).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read workspace trust state at ${trustPath}`,
          cause,
        }),
      ),
    );
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(raw),
      catch: (cause) =>
        makeAppError({
          code: "validation",
          detail: `Failed to parse workspace trust state at ${trustPath}`,
          cause,
        }),
    });
    const decoded = yield* Schema.decodeUnknownEffect(WorkspaceTrustStateSchema)(parsed, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Failed to decode workspace trust state at ${trustPath}`,
          cause,
        }),
      ),
    );
    return Option.some(decoded);
  });

const encodeWorkspaceTrustState = (state: WorkspaceTrustState) =>
  Schema.encodeEffect(WorkspaceTrustStateSchema)(state).pipe(
    Effect.map((encoded) => `${JSON.stringify(encoded, null, 2)}\n`),
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: "Failed to encode workspace trust state",
        cause,
      }),
    ),
  );

/**
 * Persist a legacy trust migration only when no dedicated trust document
 * exists. Exclusive creation prevents a migration snapshot from overwriting a
 * concurrent install that established a newer trust baseline first.
 */
export const initializeWorkspaceTrustState = (
  axmDir: string,
  state: WorkspaceTrustState,
): Effect.Effect<boolean, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const trustPath = path.join(axmDir, TRUST_STATE_FILENAME);
    yield* fs.makeDirectory(axmDir, { recursive: true }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create workspace state directory ${axmDir}`,
          cause,
        }),
      ),
    );
    const content = yield* encodeWorkspaceTrustState(state);
    yield* protectWorkspacePath(trustPath);
    const written = yield* fs
      .writeFileString(trustPath, content, { flag: "wx" })
      .pipe(Effect.result);
    if (written._tag === "Success") return true;
    if (written.failure.reason._tag === "AlreadyExists") return false;
    return yield* makeAppError({
      code: "internal",
      detail: `Failed to initialize workspace trust state at ${trustPath}`,
      cause: written.failure,
    });
  });

export const writeWorkspaceTrustState = (axmDir: string, state: WorkspaceTrustState) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const trustPath = path.join(axmDir, TRUST_STATE_FILENAME);
    yield* fs.makeDirectory(axmDir, { recursive: true }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create workspace state directory ${axmDir}`,
          cause,
        }),
      ),
    );
    const content = yield* encodeWorkspaceTrustState(state);
    yield* protectWorkspacePath(trustPath);
    yield* writeFileAtomic(fs, {
      targetPath: trustPath,
      content,
      skipIfUnchanged: "ignore-read-errors",
      mapError: (failure) =>
        makeAppError({
          code: "internal",
          detail:
            failure.step === "rename"
              ? `Failed to atomically replace workspace trust state at ${trustPath}`
              : `Failed to write workspace trust state temp file at ${failure.tempPath}`,
          cause: failure.cause,
        }),
    });
  });
