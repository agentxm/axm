import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { JobStepResult } from "@agentxm/client-core/unstable/plan";
import { createRegistryClient } from "@agentxm/client-core/unstable/registry";

import type { PublishIdentity } from "./publish-preflight.js";

export interface SkipExistingPublishTarget {
  readonly fqn: string;
  readonly identity: PublishIdentity;
}

export const skippedExistingPublishMessage = (target: SkipExistingPublishTarget): string =>
  `Skipped ${target.fqn}@${target.identity.version}: version already published`;

export const skippedExistingPublishResult = (
  target: SkipExistingPublishTarget,
  scope: "project" | "user",
): JobStepResult => ({
  result: "success",
  message: skippedExistingPublishMessage(target),
  artifact: {
    path: `${target.fqn}@${target.identity.version}`,
    scope,
    change: "unchanged",
    targets: [{ path: `${target.fqn}@${target.identity.version}`, change: "unchanged" }],
  },
});

const isConflict = (error: AppError): boolean => error.code === "conflict";

const confirmPublishedVersion = (args: {
  readonly registryUrl: string;
  readonly target: SkipExistingPublishTarget;
  readonly expectedIntegrity?: string;
}) =>
  Effect.gen(function* () {
    const client = yield* createRegistryClient(args.registryUrl);
    const index = yield* client.getExtensionIndex({
      owner: args.target.identity.owner,
      type: args.target.identity.type,
      name: args.target.identity.name,
    });

    if (Option.isNone(index)) return false;
    return index.value.versions.some(
      (entry) =>
        entry.version === args.target.identity.version &&
        (args.expectedIntegrity === undefined || entry.integrity === args.expectedIntegrity),
    );
  }).pipe(
    Effect.catch(() => Effect.succeed(false)),
    Effect.provide(NodeServices.layer),
  );

export const recoverPublishConflictAsSkipExisting =
  (args: {
    readonly registryUrl: string;
    readonly target: SkipExistingPublishTarget;
    readonly scope: "project" | "user";
    readonly expectedIntegrity?: string;
  }) =>
  (error: AppError): Effect.Effect<JobStepResult, AppError> => {
    if (!isConflict(error)) return Effect.fail(error);

    return confirmPublishedVersion({
      registryUrl: args.registryUrl,
      target: args.target,
      ...(args.expectedIntegrity === undefined
        ? {}
        : { expectedIntegrity: args.expectedIntegrity }),
    }).pipe(
      Effect.flatMap((versionExists) =>
        versionExists
          ? Effect.succeed(skippedExistingPublishResult(args.target, args.scope))
          : Effect.fail(error),
      ),
    );
  };
