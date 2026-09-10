/**
 * `RetirePublishedVersion`: excluding published versions from fresh
 * resolution, and restoring one.
 *
 * A yank is a Registry write. Every form carries human verification through
 * the `registry-auth` step-up capability and reports the honest remote
 * outcome — never a workspace operation resolution.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { parseFqn, toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import {
  RegistryUrl,
  unyankExtensionVersion,
  yankAvailableExtensionVersions,
  yankExtensionVersion,
  type RegistryExtensionReference,
  type RegistryExtensionVersionReference,
  type YankCategory,
} from "@agentxm/registry-client";
import { runWithStepUp, type StepUpOptions } from "@agentxm/registry-auth";

import { PublishFailed } from "../errors.js";
import { registryTransition } from "./remote-outcome.js";

const decodeVersion = Schema.decodeUnknownResult(VersionSchema);

const validation = (detail: string, suggestions?: ReadonlyArray<{ description: string }>) =>
  new PublishFailed({
    category: "validation",
    detail,
    ...(suggestions === undefined ? {} : { suggestions }),
  });

/** The extension identity a Registry lifecycle write addresses. */
export const parseExtensionReference = (
  input: string,
): Effect.Effect<RegistryExtensionReference, PublishFailed> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.fromResult(
      Result.mapError(
        parseFqn(input),
        (cause) =>
          new PublishFailed({
            category: "validation",
            detail: `Invalid fully qualified name: ${input}`,
            cause,
          }),
      ),
    );
    return {
      owner: parsed.owner,
      type: toExtensionTypePlural(parsed.type),
      name: parsed.name,
    };
  });

/**
 * Yank and un-yank address one immutable version. The exact-version grammar
 * is required so no invocation can retire more than the caller named.
 */
export const parseExactVersionReference = (
  input: string,
): Effect.Effect<RegistryExtensionVersionReference, PublishFailed> =>
  Effect.gen(function* () {
    const lastSlash = input.lastIndexOf("/");
    const versionAt = lastSlash < 0 ? -1 : input.indexOf("@", lastSlash + 1);
    if (versionAt < 0) {
      return yield* Effect.fail(
        validation(`Expected an exact version in ${input}`, [
          { description: "Use @owner/<plural-type>/name@1.2.3." },
        ]),
      );
    }
    const ref = yield* parseExtensionReference(input.slice(0, versionAt));
    const decodedVersion = decodeVersion(input.slice(versionAt + 1));
    if (Result.isFailure(decodedVersion)) {
      return yield* Effect.fail(
        new PublishFailed({
          category: "validation",
          detail: `Expected an exact semantic version in ${input}`,
          cause: decodedVersion.failure,
        }),
      );
    }
    return { ...ref, version: decodedVersion.success };
  });

export interface YankRequest {
  readonly ref: string;
  readonly allVersions: boolean;
  readonly category?: YankCategory;
  readonly notice?: string;
  readonly verification: StepUpOptions;
}

export const yank = Effect.fn("RetirePublishedVersion.yank")(function* (request: YankRequest) {
  const registryUrl = yield* RegistryUrl;
  const input = {
    ...(request.category === undefined ? {} : { category: request.category }),
    ...(request.notice === undefined ? {} : { notice: request.notice }),
  };

  if (request.allVersions) {
    const ref = yield* parseExtensionReference(request.ref);
    const target = `${ref.owner}/${ref.type}/${ref.name}`;
    const result = yield* runWithStepUp(
      (stepUpRequestId) =>
        yankAvailableExtensionVersions(
          ref,
          input,
          stepUpRequestId === undefined ? undefined : { stepUpRequestId },
        ),
      {
        operationLabel: `Yank ${request.ref}`,
        waitingLabel: `verification to update ${request.ref}`,
      },
      request.verification,
      registryUrl,
    );
    const affected = result.value.affectedVersions;
    return registryTransition({
      action: "yank",
      registry: registryUrl,
      target,
      verificationCompleted: result.stepUpCompleted,
      affectedVersions: affected,
      message: `Yanked ${affected.length} available version${affected.length === 1 ? "" : "s"} of ${target}. Future versions are unaffected.`,
    });
  }

  const ref = yield* parseExactVersionReference(request.ref);
  const result = yield* runWithStepUp(
    (stepUpRequestId) =>
      yankExtensionVersion(
        ref,
        input,
        stepUpRequestId === undefined ? undefined : { stepUpRequestId },
      ),
    {
      operationLabel: `Yank ${request.ref}`,
      waitingLabel: `verification to update ${request.ref}`,
    },
    request.verification,
    registryUrl,
  );
  return registryTransition({
    action: "yank",
    registry: registryUrl,
    target: request.ref,
    version: ref.version,
    verificationCompleted: result.stepUpCompleted,
    message: `Yanked ${request.ref}. Exact installs remain available with a warning.`,
  });
});

export const unyank = Effect.fn("RetirePublishedVersion.unyank")(function* (
  ref: string,
  verification: StepUpOptions,
) {
  const registryUrl = yield* RegistryUrl;
  const parsed = yield* parseExactVersionReference(ref);
  const result = yield* runWithStepUp(
    (stepUpRequestId) =>
      unyankExtensionVersion(
        parsed,
        stepUpRequestId === undefined ? undefined : { stepUpRequestId },
      ),
    {
      operationLabel: `Un-yank ${ref}`,
      waitingLabel: `verification to update ${ref}`,
    },
    verification,
    registryUrl,
  );
  return registryTransition({
    action: "unyank",
    registry: registryUrl,
    target: ref,
    version: parsed.version,
    verificationCompleted: result.stepUpCompleted,
    message: `Restored ${ref} to fresh resolution.`,
  });
});

/** The application API for retiring and restoring published versions. */
export const RetirePublishedVersion = { yank, unyank, parseExactVersionReference } as const;
