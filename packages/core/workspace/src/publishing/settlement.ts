import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  isRegistryClientFailure,
  type PublishExtensionArgs,
  type PublishExtensionResponse,
  type RegistryClient,
  type RegistryClientFailure,
} from "@agentxm/registry-client";
import { PublishFailed } from "./errors.js";

/** Every failure a publish settlement can surface. */
export type PublishSettlementFailure = PublishFailed | RegistryClientFailure;

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
      readonly error: PublishSettlementFailure;
    };

const isAmbiguousDispatch = (error: RegistryClientFailure): boolean =>
  error.category === "timeout" || error.metadata?.requestPolicy?.retryable === true;

type Readback =
  | { readonly kind: "matching" }
  | { readonly kind: "absent"; readonly error?: PublishSettlementFailure };

const readback = (
  client: Pick<RegistryClient, "getExactExtensionVersion">,
  args: PublishExtensionArgs,
  remaining: number,
  lastError?: PublishSettlementFailure,
): Effect.Effect<Readback, PublishSettlementFailure> =>
  client
    .getExactExtensionVersion({
      owner: args.owner,
      type: args.type,
      name: args.name,
      version: args.version,
      ...(args.accessToken === undefined ? {} : { accessToken: args.accessToken }),
    })
    .pipe(
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
                  new PublishFailed({
                    category: "conflict",
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

const unresolved = (
  initialError: PublishSettlementFailure,
  laterError?: PublishSettlementFailure,
): SettledPublish => {
  const error = laterError ?? initialError;
  return {
    status: "unknown",
    settlement: "unresolved",
    reason:
      isRegistryClientFailure(error) && error.category === "auth"
        ? "authorization_expired"
        : "settlement_unresolved",
    error,
  };
};

/** Settle one exact immutable publish with bounded readback and one replay. */
export const settlePublish = (
  client: Pick<RegistryClient, "publishExtension" | "getExactExtensionVersion">,
  args: PublishExtensionArgs,
): Effect.Effect<SettledPublish, PublishSettlementFailure> =>
  client.publishExtension(args).pipe(
    Effect.map((response): SettledPublish => ({
      status: "published",
      settlement: "response",
      response,
    })),
    Effect.catch((initialError) => {
      if (!isAmbiguousDispatch(initialError)) return Effect.fail(initialError);
      return readback(client, args, 3).pipe(
        Effect.flatMap((firstReadback) => {
          if (firstReadback.kind === "matching") {
            const settled: SettledPublish = { status: "published", settlement: "readback" };
            return Effect.succeed(settled);
          }
          return client.publishExtension(args).pipe(
            Effect.map((response): SettledPublish => ({
              status: "published",
              settlement: "replay",
              response,
            })),
            Effect.catch((replayError) =>
              replayError.category === "conflict"
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
