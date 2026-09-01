import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";
import type {
  PublishExtensionArgs,
  PublishExtensionResponse,
  RegistryClient,
} from "@agentxm/registry-client";

export type PublishSettlement = "response" | "readback" | "replay" | "unresolved";

export type SettledPublish =
  | {
      readonly status: "published";
      readonly settlement: Exclude<PublishSettlement, "unresolved">;
      readonly response?: PublishExtensionResponse;
    }
  | {
      readonly status: "unknown";
      readonly settlement: "unresolved";
      readonly reason: "settlement_unresolved" | "authorization_expired";
      readonly error: AppError;
    };

const isAmbiguousDispatch = (error: AppError): boolean =>
  error.code === "timeout" || error.metadata?.requestPolicy?.retryable === true;

type Readback =
  { readonly kind: "matching" } | { readonly kind: "absent"; readonly error?: AppError };

const readback = (
  client: Pick<RegistryClient, "getExactExtensionVersion">,
  args: PublishExtensionArgs,
  remaining: number,
  lastError?: AppError,
): Effect.Effect<Readback, AppError> =>
  client
    .getExactExtensionVersion({
      owner: args.owner,
      type: args.type,
      name: args.name,
      version: args.version,
      ...(args.accessToken === undefined ? {} : { accessToken: args.accessToken }),
    })
    .pipe(
      Effect.mapError(toAppError),
      Effect.matchEffect({
        onFailure: (error) =>
          remaining <= 1
            ? Effect.succeed({ kind: "absent", error } as const)
            : Effect.sleep("500 millis").pipe(
                Effect.andThen(readback(client, args, remaining - 1, error)),
              ),
        onSuccess: (version) => {
          if (Option.isSome(version)) {
            return version.value.integrity === args.metadata.integrity
              ? Effect.succeed({ kind: "matching" } as const)
              : Effect.fail(
                  makeAppError({
                    code: "conflict",
                    detail: `Registry version ${args.owner}/${args.type}/${args.name}@${args.version} has different content.`,
                  }),
                );
          }
          return remaining <= 1
            ? Effect.succeed({
                kind: "absent",
                ...(lastError === undefined ? {} : { error: lastError }),
              } as const)
            : Effect.sleep("500 millis").pipe(
                Effect.andThen(readback(client, args, remaining - 1, lastError)),
              );
        },
      }),
    );

const unresolved = (initialError: AppError, laterError?: AppError): SettledPublish => {
  const error = laterError ?? initialError;
  return {
    status: "unknown",
    settlement: "unresolved",
    reason:
      error.code === "auth" || error.code === "auth_expired"
        ? "authorization_expired"
        : "settlement_unresolved",
    error,
  };
};

/** Settle one exact immutable publish with bounded readback and one replay. */
export const settlePublish = (
  client: Pick<RegistryClient, "publishExtension" | "getExactExtensionVersion">,
  args: PublishExtensionArgs,
): Effect.Effect<SettledPublish, AppError> =>
  client.publishExtension(args).pipe(
    Effect.mapError(toAppError),
    Effect.map((response): SettledPublish => ({
      status: "published",
      settlement: "response",
      response,
    })),
    Effect.catchTag("AppError", (initialError) => {
      if (!isAmbiguousDispatch(initialError)) return Effect.fail(initialError);
      return readback(client, args, 3).pipe(
        Effect.flatMap((firstReadback) => {
          if (firstReadback.kind === "matching") {
            const settled: SettledPublish = { status: "published", settlement: "readback" };
            return Effect.succeed(settled);
          }
          return client.publishExtension(args).pipe(
            Effect.mapError(toAppError),
            Effect.map((response): SettledPublish => ({
              status: "published",
              settlement: "replay",
              response,
            })),
            Effect.catchTag("AppError", (replayError) =>
              replayError.code === "conflict"
                ? Effect.fail(replayError)
                : readback(client, args, 3).pipe(
                    Effect.map((finalReadback): SettledPublish =>
                      finalReadback.kind === "matching"
                        ? { status: "published", settlement: "readback" }
                        : unresolved(initialError, finalReadback.error ?? replayError),
                    ),
                  ),
            ),
          );
        }),
      );
    }),
  );
