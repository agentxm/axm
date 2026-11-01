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
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import {
  isNotFound,
  readFileStringIfPresent,
  resolveUserAxmHome,
  sweepStaleAtomicWriteTemps,
  writeFileAtomic,
} from "@agentxm/host-primitives";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { RegistryAccessFailed } from "./errors.js";

const PendingDeviceLoginSchema = Schema.Struct({
  version: Schema.Literal(3),
  registryUrl: Schema.String,
  deviceCode: Schema.String,
  userCode: Schema.String,
  verificationUri: Schema.String,
  verificationUriComplete: Schema.String,
  interval: Schema.Number,
  expiresAt: DateTimeUtcSchema,
}).annotate({
  identifier: "PendingDeviceLogin",
  title: "Pending Device Login",
  description: "One resumable OAuth device authorization flow.",
});

export type PendingDeviceLogin = typeof PendingDeviceLoginSchema.Type;

export interface PendingDeviceLoginStoreService {
  readonly save: (pending: PendingDeviceLogin) => Effect.Effect<void, RegistryAccessFailed>;
  readonly load: () => Effect.Effect<Option.Option<PendingDeviceLogin>, RegistryAccessFailed>;
  readonly clear: () => Effect.Effect<void, RegistryAccessFailed>;
}

export class PendingDeviceLoginStore extends ServiceMap.Service<
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreService
>()("@agentxm/registry-access/pending-device-login-store/PendingDeviceLoginStore") {}

const PENDING_LOGIN_FILENAME = "pending-login.json";
const DIR_PERMISSIONS = 0o700;
const FILE_PERMISSIONS = 0o600;

const storeError = (detail: string, cause: unknown) =>
  new RegistryAccessFailed({ category: "auth", detail, cause });

export const PendingDeviceLoginStoreLive = Layer.effect(
  PendingDeviceLoginStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* resolveUserAxmHome().pipe(
      Effect.mapError((cause) => storeError("Could not read pending login home", cause)),
    );
    const filePath = path.join(directory, PENDING_LOGIN_FILENAME);
    const sweepTemps = sweepStaleAtomicWriteTemps(fs, filePath).pipe(
      Effect.provideService(Path.Path, path),
    );

    const ensureDirectory = Effect.gen(function* () {
      yield* fs
        .makeDirectory(directory, { recursive: true, mode: DIR_PERMISSIONS })
        .pipe(
          Effect.mapError((error) => storeError("Could not create pending login storage", error)),
        );
      yield* fs
        .chmod(directory, DIR_PERMISSIONS)
        .pipe(
          Effect.mapError((cause) =>
            storeError("Could not restrict pending login storage permissions", cause),
          ),
        );
    });

    const save: PendingDeviceLoginStoreService["save"] = Effect.fn("PendingDeviceLoginStore.save")(
      function* (pending) {
        yield* ensureDirectory;
        const encoded = yield* Schema.encodeEffect(PendingDeviceLoginSchema)(pending).pipe(
          Effect.mapError(() =>
            storeError("Could not encode pending login", { _tag: "PendingDeviceLoginEncodeError" }),
          ),
        );
        yield* sweepTemps;
        yield* writeFileAtomic(fs, {
          targetPath: filePath,
          content: JSON.stringify(encoded, null, 2),
          mode: FILE_PERMISSIONS,
          mapError: (failure) => storeError("Could not persist pending login", failure.cause),
        });
        yield* fs
          .chmod(filePath, FILE_PERMISSIONS)
          .pipe(
            Effect.mapError((cause) =>
              storeError("Could not restrict pending login file permissions", cause),
            ),
          );
      },
    );

    const load: PendingDeviceLoginStoreService["load"] = Effect.fn("PendingDeviceLoginStore.load")(
      function* () {
        const content = yield* readFileStringIfPresent(fs, filePath).pipe(
          Effect.mapError((cause) => storeError("Could not read pending login", cause)),
        );
        if (Option.isNone(content)) return Option.none<PendingDeviceLogin>();
        return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PendingDeviceLoginSchema))(
          content.value,
        ).pipe(
          Effect.map(Option.some),
          Effect.catch(() =>
            fs.remove(filePath).pipe(
              Effect.catchIf(isNotFound, () => Effect.void),
              Effect.mapError((cause) =>
                storeError(
                  "Pending login storage was invalid and could not be removed. Check storage permissions before starting a new sign-in.",
                  {
                    _tag: "PendingDeviceLoginCleanupFailed",
                    validation: { _tag: "PendingDeviceLoginDecodeError" },
                    cleanup: cause,
                  },
                ),
              ),
              Effect.andThen(
                Effect.fail(
                  new RegistryAccessFailed({
                    category: "auth",
                    detail:
                      "Pending login storage was invalid and has been removed. Start a new sign-in.",
                    suggestions: [
                      {
                        description: "Start a new sign-in.",
                        cmd: "axm login --device-code --json",
                      },
                    ],
                    // Schema errors include input containing the secret device code.
                    cause: { _tag: "PendingDeviceLoginDecodeError" },
                  }),
                ),
              ),
            ),
          ),
        );
      },
    );

    const clear: PendingDeviceLoginStoreService["clear"] = Effect.fn(
      "PendingDeviceLoginStore.clear",
    )(() =>
      fs.remove(filePath).pipe(
        Effect.catchIf(isNotFound, () => Effect.void),
        Effect.mapError((cause) => storeError("Could not clear pending login", cause)),
      ),
    );

    return { save, load, clear } satisfies PendingDeviceLoginStoreService;
  }),
);

export const PendingDeviceLoginStoreTest = (initial?: PendingDeviceLogin) =>
  Layer.effect(
    PendingDeviceLoginStore,
    Effect.gen(function* () {
      const value = yield* Ref.make(
        initial === undefined ? Option.none<PendingDeviceLogin>() : Option.some(initial),
      );
      return {
        save: (pending) => Ref.set(value, Option.some(pending)),
        load: () => Ref.get(value),
        clear: () => Ref.set(value, Option.none()),
      } satisfies PendingDeviceLoginStoreService;
    }),
  );
