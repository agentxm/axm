/**
 * InstallMeta service — reads and writes `install-meta.json`.
 *
 * The metadata file lives at `~/.axm/install-meta.json` (Unix)
 * or `$AXM_USER_HOME/.axm/install-meta.json` when AXM_USER_HOME is set.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";

import { makeAppError, type AppError } from "../app-error/index.js";
import { DateTimeUtcSchema } from "../date-time.js";
import { InstallMethodLiteral } from "../install-method/install-method.js";
import { resolveUserScopeDir } from "../workspace/paths.js";

// -----------------------------------------------------------------------------
// Schema
// -----------------------------------------------------------------------------

/**
 * Schema for `install-meta.json`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const InstallMetaDataSchema = Schema.Struct({
  schemaVersion: Schema.optional(Schema.Literal(2)),
  method: InstallMethodLiteral.pipe(
    Schema.annotateKey({ messageMissingKey: "method is required" }),
  ),
  installedAt: DateTimeUtcSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "installedAt is required" }),
  ),
  packageName: Schema.optional(Schema.String),
  managerMajorVersion: Schema.optional(Schema.Number),
  executablePath: Schema.optional(Schema.String),
}).annotate({
  identifier: "InstallMetaData",
  title: "Install Metadata",
  description: "How and when axm was installed.",
});

/**
 * Type of the decoded `install-meta.json` data.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallMetaData = typeof InstallMetaDataSchema.Type;

const decodeInstallMetaDataFromJsonString = Schema.decodeUnknownEffect(
  Schema.fromJsonString(InstallMetaDataSchema),
);

const encodeInstallMetaData = Schema.encodeEffect(InstallMetaDataSchema);

// -----------------------------------------------------------------------------
// Service interface
// -----------------------------------------------------------------------------

export interface InstallMetaService {
  /** Read `install-meta.json`. Returns `None` if file is missing or invalid. */
  readonly read: () => Effect.Effect<Option.Option<InstallMetaData>>;
  /** Write `install-meta.json` with the given method and timestamp. */
  readonly write: (data: InstallMetaData) => Effect.Effect<void, AppError>;
}

/**
 * Effect service tag for install metadata I/O.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class InstallMeta extends ServiceMap.Service<InstallMeta, InstallMetaService>()(
  "@agentxm/client-core/unstable/install-meta/install-meta/InstallMeta",
) {}

// -----------------------------------------------------------------------------
// Data directory resolution
// -----------------------------------------------------------------------------

const resolveDataDir = resolveUserScopeDir;

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const INSTALL_META_FILENAME = "install-meta.json";

// -----------------------------------------------------------------------------
// Core read/write logic
// -----------------------------------------------------------------------------

/**
 * Read `install-meta.json` from the given directory.
 * Returns `Option.none()` if the file is missing or contains invalid data.
 *
 * Exposed for testability.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const readInstallMeta = (dataDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const metaPath = path.join(dataDir, INSTALL_META_FILENAME);

    const exists = yield* fs.exists(metaPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<InstallMetaData>();

    const content = yield* fs.readFileString(metaPath).pipe(Effect.option);
    if (Option.isNone(content)) return Option.none<InstallMetaData>();

    const decoded = yield* decodeInstallMetaDataFromJsonString(content.value).pipe(Effect.option);
    if (Option.isNone(decoded)) return Option.none<InstallMetaData>();

    return Option.some({ ...decoded.value, schemaVersion: 2 as const });
  });

/**
 * Write `install-meta.json` to the given directory.
 * Creates the directory if it does not exist.
 *
 * Exposed for testability.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const writeInstallMeta = (dataDir: string, data: InstallMetaData) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const metaPath = path.join(dataDir, INSTALL_META_FILENAME);

    yield* fs.makeDirectory(dataDir, { recursive: true }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: "Failed to create the AXM metadata directory",
          suggestions: [{ description: "Check permissions and retry the upgrade." }],
          cause,
        }),
      ),
    );

    const encoded = yield* encodeInstallMetaData({ ...data, schemaVersion: 2 as const }).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: "Failed to encode AXM install metadata",
          cause,
        }),
      ),
    );
    const content = JSON.stringify(encoded, null, 2) + "\n";
    const tempPath = yield* fs
      .makeTempFile({
        directory: dataDir,
        prefix: ".install-meta-",
        suffix: ".tmp",
      })
      .pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "internal",
            detail: "Failed to create temporary AXM install metadata",
            cause,
          }),
        ),
      );
    const tempDirectory = path.dirname(tempPath);

    yield* Effect.ensuring(
      Effect.gen(function* () {
        yield* fs.writeFileString(tempPath, content).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: "Failed to write AXM install metadata",
              suggestions: [{ description: "Check permissions and retry the upgrade." }],
              cause,
            }),
          ),
        );
        yield* fs.rename(tempPath, metaPath).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: "Failed to atomically persist AXM install metadata",
              suggestions: [{ description: "Check permissions and retry the upgrade." }],
              cause,
            }),
          ),
        );
      }),
      fs.remove(tempDirectory, { recursive: true }).pipe(Effect.ignore),
    );
  });

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

/**
 * Live layer providing the `InstallMeta` service.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const InstallMetaLive = Layer.effect(
  InstallMeta,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    const dataDir = yield* resolveDataDir();

    const read: InstallMetaService["read"] = () =>
      readInstallMeta(dataDir).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, pathService),
      );

    const write: InstallMetaService["write"] = (data) =>
      writeInstallMeta(dataDir, data).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, pathService),
      );

    return { read, write } satisfies InstallMetaService;
  }),
);

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

/**
 * Create an `InstallMeta` layer for testing with a configurable data directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const InstallMetaTest = (dataDir: string) =>
  Layer.effect(
    InstallMeta,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;

      const read: InstallMetaService["read"] = () =>
        readInstallMeta(dataDir).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, pathService),
        );

      const write: InstallMetaService["write"] = (data) =>
        writeInstallMeta(dataDir, data).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, pathService),
        );

      return { read, write } satisfies InstallMetaService;
    }),
  );
