/**
 * Restricted local persistence for resumable OAuth device authorization.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { type AppError, makeAppError } from "../app-error/index.js";
import { DateTimeUtcSchema } from "../date-time.js";
import { envOption } from "../utils/index.js";

export const PendingDeviceLoginSchema = Schema.Struct({
  version: Schema.Literal(2),
  registryUrl: Schema.String,
  deviceCode: Schema.String,
  userCode: Schema.String,
  verificationUri: Schema.String,
  verificationUriComplete: Schema.String,
  requestedScopes: Schema.Array(Schema.String),
  interval: Schema.Number,
  expiresAt: DateTimeUtcSchema,
}).annotate({
  identifier: "PendingDeviceLogin",
  title: "Pending Device Login",
  description: "One resumable OAuth device authorization flow.",
});

export type PendingDeviceLogin = typeof PendingDeviceLoginSchema.Type;

export interface PendingDeviceLoginStoreService {
  readonly save: (pending: PendingDeviceLogin) => Effect.Effect<void, AppError>;
  readonly load: () => Effect.Effect<Option.Option<PendingDeviceLogin>, AppError>;
  readonly clear: () => Effect.Effect<void, AppError>;
}

export class PendingDeviceLoginStore extends ServiceMap.Service<
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreService
>()("@agentxm/client-core/unstable/auth/pending-device-login-store/PendingDeviceLoginStore") {}

const PENDING_LOGIN_FILENAME = "pending-login.json";
const DIR_PERMISSIONS = 0o700;
const FILE_PERMISSIONS = 0o600;

const resolveHomeDir = (values: ReadonlyArray<Option.Option<string>>): string => {
  for (const value of values) {
    if (Option.isSome(value)) return value.value;
  }
  return "/tmp";
};

const storeError = (detail: string, cause: unknown) =>
  makeAppError({ code: "auth", detail, cause });

export const PendingDeviceLoginStoreLive = Layer.effect(
  PendingDeviceLoginStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const homeDir = resolveHomeDir([
      yield* envOption("HOME"),
      yield* envOption("USERPROFILE"),
      yield* envOption("HOMEPATH"),
    ]);
    const directory = path.join(homeDir, ".axm");
    const filePath = path.join(directory, PENDING_LOGIN_FILENAME);
    const temporaryPath = path.join(directory, `${PENDING_LOGIN_FILENAME}.tmp`);

    const ensureDirectory = Effect.gen(function* () {
      yield* fs
        .makeDirectory(directory, { recursive: true })
        .pipe(
          Effect.mapError((error) => storeError("Could not create pending login storage", error)),
        );
      yield* fs.chmod(directory, DIR_PERMISSIONS).pipe(Effect.catch(() => Effect.void));
    });

    const save: PendingDeviceLoginStoreService["save"] = Effect.fn("PendingDeviceLoginStore.save")(
      function* (pending) {
        yield* ensureDirectory;
        const encoded = yield* Schema.encodeEffect(PendingDeviceLoginSchema)(pending).pipe(
          Effect.mapError((error) => storeError("Could not encode pending login", error)),
        );
        yield* fs.chmod(temporaryPath, FILE_PERMISSIONS).pipe(Effect.catch(() => Effect.void));
        yield* fs
          .writeFileString(temporaryPath, JSON.stringify(encoded, null, 2), {
            mode: FILE_PERMISSIONS,
          })
          .pipe(
            Effect.mapError((error) => storeError("Could not persist pending login", error)),
            Effect.tapError(() => fs.remove(temporaryPath).pipe(Effect.catch(() => Effect.void))),
          );
        yield* fs.chmod(temporaryPath, FILE_PERMISSIONS).pipe(Effect.catch(() => Effect.void));
        yield* fs.rename(temporaryPath, filePath).pipe(
          Effect.mapError((error) => storeError("Could not persist pending login", error)),
          Effect.tapError(() => fs.remove(temporaryPath).pipe(Effect.catch(() => Effect.void))),
        );
        yield* fs.chmod(filePath, FILE_PERMISSIONS).pipe(Effect.catch(() => Effect.void));
      },
    );

    const load: PendingDeviceLoginStoreService["load"] = Effect.fn("PendingDeviceLoginStore.load")(
      function* () {
        const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
        if (!exists) return Option.none<PendingDeviceLogin>();
        const content = yield* fs
          .readFileString(filePath)
          .pipe(Effect.mapError((error) => storeError("Could not read pending login", error)));
        return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PendingDeviceLoginSchema))(
          content,
        ).pipe(
          Effect.map(Option.some),
          Effect.mapError((error) =>
            makeAppError({
              code: "auth",
              detail:
                "Pending login storage was invalid and has been removed. Start a new device sign-in.",
              suggestions: [
                {
                  description: "Start a new device sign-in.",
                  cmd: "axm login --device-code --json",
                },
              ],
              cause: error,
            }),
          ),
          Effect.tapError(() => fs.remove(filePath).pipe(Effect.catch(() => Effect.void))),
        );
      },
    );

    const clear: PendingDeviceLoginStoreService["clear"] = Effect.fn(
      "PendingDeviceLoginStore.clear",
    )(function* () {
      const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
      if (exists) {
        yield* fs
          .remove(filePath)
          .pipe(Effect.mapError((error) => storeError("Could not clear pending login", error)));
      }
      const temporaryExists = yield* fs
        .exists(temporaryPath)
        .pipe(Effect.catch(() => Effect.succeed(false)));
      if (temporaryExists) {
        yield* fs.remove(temporaryPath).pipe(Effect.catch(() => Effect.void));
      }
    });

    return { save, load, clear } satisfies PendingDeviceLoginStoreService;
  }),
);

export const PendingDeviceLoginStoreTest = (initial?: PendingDeviceLogin) => {
  let value = initial === undefined ? Option.none<PendingDeviceLogin>() : Option.some(initial);
  return Layer.succeed(PendingDeviceLoginStore, {
    save: (pending) =>
      Effect.sync(() => {
        value = Option.some(pending);
      }),
    load: () => Effect.sync(() => value),
    clear: () =>
      Effect.sync(() => {
        value = Option.none();
      }),
  } satisfies PendingDeviceLoginStoreService);
};
