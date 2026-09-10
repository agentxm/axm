import { createHash } from "node:crypto";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "@agentxm/extension-model/unstable/date-time";
import { RegistryAuthFailed } from "./errors.js";
import { envOption } from "./internal/environment.js";

export const PendingPublishAuthorizationSchema = Schema.Struct({
  version: Schema.Literal(1),
  purpose: Schema.Literal("publish"),
  registryUrl: Schema.String,
  requestRef: Schema.String,
  requestId: Schema.String,
  authorizationUrl: Schema.String,
  expiresAt: DateTimeUtcSchema,
  interval: Schema.Int.check(Schema.isGreaterThan(0)),
  publicationSetDigest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  initiatorProof: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43,128}$/)),
});
export type PendingPublishAuthorization = typeof PendingPublishAuthorizationSchema.Type;

export interface PendingPublishAuthorizationStoreService {
  readonly save: (pending: PendingPublishAuthorization) => Effect.Effect<void, RegistryAuthFailed>;
  readonly load: (
    requestRef: string,
  ) => Effect.Effect<Option.Option<PendingPublishAuthorization>, RegistryAuthFailed>;
  readonly clear: (requestRef: string) => Effect.Effect<void, RegistryAuthFailed>;
}
export class PendingPublishAuthorizationStore extends Context.Service<
  PendingPublishAuthorizationStore,
  PendingPublishAuthorizationStoreService
>()("@agentxm/registry-auth/PendingPublishAuthorizationStore") {}

const storageError = (operation: string) =>
  new RegistryAuthFailed({
    category: "auth",
    detail: `Could not ${operation} the private publish authorization record. Its public request URL cannot replace the missing proof.`,
  });

export const PendingPublishAuthorizationStoreLive = Layer.effect(
  PendingPublishAuthorizationStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const homes = [
      yield* envOption("AXM_USER_HOME"),
      yield* envOption("HOME"),
      yield* envOption("USERPROFILE"),
    ];
    const home = homes.find(Option.isSome);
    const storageDirectory =
      home === undefined
        ? Effect.fail(storageError("locate"))
        : Effect.succeed(path.join(home.value, ".axm", "publish-authorizations"));
    const filename = (directory: string, reference: string) =>
      path.join(directory, `${createHash("sha256").update(reference).digest("hex")}.json`);
    return {
      save: (pending) =>
        Effect.gen(function* () {
          const directory = yield* storageDirectory;
          yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
          yield* fs.chmod(directory, 0o700);
          const file = filename(directory, pending.requestRef);
          const encoded = yield* Schema.encodeEffect(PendingPublishAuthorizationSchema)(pending);
          yield* Effect.acquireUseRelease(
            fs.makeTempDirectory({ directory, prefix: "publish-" }),
            (temporaryDirectory) =>
              Effect.gen(function* () {
                const temporary = path.join(temporaryDirectory, "proof.json");
                yield* fs.writeFileString(temporary, JSON.stringify(encoded), {
                  mode: 0o600,
                  flag: "wx",
                });
                yield* fs.link(temporary, file);
              }),
            (temporaryDirectory) =>
              fs
                .remove(temporaryDirectory, { recursive: true, force: true })
                .pipe(Effect.catch(() => Effect.void)),
          );
        }).pipe(Effect.mapError(() => storageError("save"))),
      load: (reference) =>
        Effect.gen(function* () {
          const directory = yield* storageDirectory;
          const file = filename(directory, reference);
          if (!(yield* fs.exists(file))) return Option.none<PendingPublishAuthorization>();
          const content = yield* fs.readFileString(file);
          const pending = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(PendingPublishAuthorizationSchema),
          )(content);
          if (pending.requestRef !== reference) return yield* storageError("validate");
          return Option.some(pending);
        }).pipe(Effect.mapError(() => storageError("read"))),
      clear: (reference) =>
        Effect.gen(function* () {
          const directory = yield* storageDirectory;
          yield* fs.remove(filename(directory, reference), { force: true });
        }).pipe(Effect.mapError(() => storageError("remove"))),
    } satisfies PendingPublishAuthorizationStoreService;
  }),
);

export const PendingPublishAuthorizationStoreTest = (
  initial: ReadonlyArray<PendingPublishAuthorization> = [],
) => {
  const records = new Map(initial.map((record) => [record.requestRef, record]));
  return Layer.succeed(PendingPublishAuthorizationStore, {
    save: (pending) =>
      Effect.sync(() => {
        records.set(pending.requestRef, pending);
      }),
    load: (reference) => Effect.sync(() => Option.fromNullishOr(records.get(reference))),
    clear: (reference) =>
      Effect.sync(() => {
        records.delete(reference);
      }),
  });
};
