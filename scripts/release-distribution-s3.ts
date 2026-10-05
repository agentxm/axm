import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import * as Config from "effect/Config";
import type * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { ReleaseStorageError, type ReleaseStorage } from "./release-distribution.js";

/** Supported S3 transport; the credential must be scoped to this release bucket. */
export const makeReleaseStorage = (
  provider: ConfigProvider.ConfigProvider,
  requestHandler?: S3ClientConfig["requestHandler"],
) =>
  Effect.gen(function* () {
    const config = yield* Config.all({
      accountId: Config.String("RELEASE_R2_ACCOUNT_ID"),
      bucket: Config.String("RELEASE_R2_BUCKET"),
      accessKeyId: Config.Redacted("RELEASE_R2_ACCESS_KEY_ID"),
      secretAccessKey: Config.Redacted("RELEASE_R2_SECRET_ACCESS_KEY"),
    }).parse(provider);
    if (
      !/^[0-9a-f]{32}$/u.test(config.accountId) ||
      !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(config.bucket)
    ) {
      return yield* new ReleaseStorageError({
        operation: "configuration",
        detail: "Invalid release storage account or bucket",
      });
    }
    const client = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new S3Client({
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            region: "auto",
            credentials: {
              accessKeyId: Redacted.value(config.accessKeyId),
              secretAccessKey: Redacted.value(config.secretAccessKey),
            },
            ...(requestHandler === undefined ? {} : { requestHandler }),
            maxAttempts: 1,
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
          }),
      ),
      (client) => Effect.sync(() => client.destroy()),
    );
    const boundary = <A>(operation: string, run: (signal: AbortSignal) => Promise<A>) =>
      Effect.tryPromise({
        try: run,
        catch: (cause) =>
          new ReleaseStorageError({
            operation,
            detail:
              cause instanceof S3ServiceException
                ? `S3 ${cause.name} (${String(cause.$metadata.httpStatusCode ?? "unknown")})`
                : "S3 transport or response failure",
          }),
      }).pipe(
        Effect.timeoutOrElse({
          duration: "2 minutes",
          orElse: () =>
            Effect.fail(new ReleaseStorageError({ operation, detail: "S3 request timed out" })),
        }),
      );
    return {
      read: (key) =>
        boundary(`read ${key}`, async (signal) => {
          try {
            const object = await client.send(
              new GetObjectCommand({ Bucket: config.bucket, Key: key }),
              { abortSignal: signal },
            );
            if (object.Body === undefined || object.ETag === undefined)
              throw new Error("Incomplete S3 response");
            return { bytes: await object.Body.transformToByteArray(), etag: object.ETag };
          } catch (cause) {
            if (cause instanceof S3ServiceException && cause.name === "NoSuchKey") return null;
            throw cause;
          }
        }),
      put: (key, bytes, options) =>
        boundary(`write ${key}`, async (signal) => {
          await client.send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: key,
              Body: bytes,
              ContentType: options.contentType,
              CacheControl: options.cacheControl,
              ...("absent" in options.condition
                ? { IfNoneMatch: "*" }
                : { IfMatch: options.condition.etag }),
            }),
            { abortSignal: signal },
          );
        }),
    } satisfies ReleaseStorage;
  });
