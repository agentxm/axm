/**
 * `ManagePublishedVisibility`: comparing what a repository declares about an
 * extension's visibility with what the Registry established, and writing one
 * of them onto the other.
 *
 * The repository intent resolver here is the same one publish uses for its
 * publication descriptors: manifest decision first, workspace default second.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  ExtensionFqnSchema,
  ExtensionVisibilitySchema,
  parseExtensionFqnParts,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions/common";
import { manifestFilenameForType } from "@agentxm/extension-content";
import { createRegistryClient, RegistryUrl } from "@agentxm/registry-client";
import type {
  VisibilityEvaluation,
  VisibilityIntent,
  VisibilityMutationResult,
} from "@agentxm/registry-protocol/unstable/publish";
import { runWithStepUp, type StepUpOptions } from "@agentxm/registry-auth";
import { WorkspaceMutations } from "@agentxm/workspace-state";

import { PublishFailed } from "../errors.js";
import { declaredVisibilityIntent } from "../publish/publication.js";

const ManifestVisibilitySchema = Schema.Struct({
  publish: Schema.optional(
    Schema.Struct({ visibility: Schema.optional(ExtensionVisibilitySchema) }),
  ),
});

const validation = (detail: string, suggestions?: ReadonlyArray<{ description: string }>) =>
  new PublishFailed({
    category: "validation",
    detail,
    ...(suggestions === undefined ? {} : { suggestions }),
  });

type FqnParts = NonNullable<ReturnType<typeof parseExtensionFqnParts>>;

export interface VisibilityTarget {
  readonly parts: FqnParts;
  readonly fqn: typeof ExtensionFqnSchema.Type;
}

export const parseVisibilityTarget = (input: string) =>
  Effect.gen(function* () {
    const parts = parseExtensionFqnParts(input);
    if (parts === undefined) {
      return yield* Effect.fail(
        validation(`Invalid extension target: ${input}`, [
          { description: "Use @owner/<plural-type>/name, for example @acme/skills/review." },
        ]),
      );
    }
    const fqn = yield* Schema.decodeUnknownEffect(ExtensionFqnSchema)(input).pipe(
      Effect.mapError(
        (cause) =>
          new PublishFailed({
            category: "validation",
            detail: `Invalid extension target: ${input}`,
            cause,
          }),
      ),
    );
    return { parts, fqn } satisfies VisibilityTarget;
  });

/**
 * The visibility this repository declares for the target: its authored
 * manifest's decision, else the workspace publication default.
 */
export const repositoryVisibilityIntent = Effect.fn("Visibility.repositoryIntent")(function* (
  parts: FqnParts,
) {
  const workspace = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (workspace.layout.scope !== "project") {
    return yield* Effect.fail(validation("Repository visibility intent requires project scope."));
  }
  const manifestPath = path.join(
    workspace.layout.authoredRoot(parts.type),
    parts.name,
    manifestFilenameForType(parts.type),
  );
  const manifest = yield* fs.exists(manifestPath).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs
            .readFileString(manifestPath)
            .pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(Schema.fromJsonString(ManifestVisibilitySchema)),
              ),
              Effect.map(Option.some),
            )
        : Effect.succeed(Option.none<typeof ManifestVisibilitySchema.Type>()),
    ),
    Effect.mapError(
      (cause) =>
        new PublishFailed({
          category: "validation",
          detail: `Unable to read visibility intent from ${manifestPath}.`,
          cause,
        }),
    ),
  );
  const workspaceDefault = yield* workspace.getPublishDefaultVisibility().pipe(
    Effect.mapError(
      (cause) =>
        new PublishFailed({
          category: "validation",
          detail: "Unable to read workspace publication visibility.",
          cause,
        }),
    ),
  );
  const manifestVisibility = Option.isSome(manifest)
    ? manifest.value.publish?.visibility
    : undefined;
  return declaredVisibilityIntent({
    ...(manifestVisibility === undefined ? {} : { manifestVisibility }),
    workspaceDefault,
  });
});

/** Compare the repository's declared intent with the Registry's state. */
export const status = Effect.fn("ManagePublishedVisibility.status")(function* (target: string) {
  const parsed = yield* parseVisibilityTarget(target);
  const intent = yield* repositoryVisibilityIntent(parsed.parts);
  const registryUrl = yield* RegistryUrl;
  const client = yield* createRegistryClient(registryUrl);
  return yield* client.getExtensionVisibility({ ...parsed.parts, intent });
});

const requireEstablishedVisibility = (target: string, evaluation: VisibilityEvaluation) =>
  evaluation.actual === null
    ? Option.some(
        new PublishFailed({
          category: "not_found",
          detail: `${target} has no established Registry visibility.`,
        }),
      )
    : Option.none();

export interface VisibilityWriteRequest {
  readonly target: string;
  readonly verification: StepUpOptions;
}

export interface VisibilitySetRequest extends VisibilityWriteRequest {
  readonly visibility: ExtensionVisibility;
}

/**
 * Write an operator's explicit decision at the revision the evaluation
 * observed. An optimistic precondition: a concurrent change refuses the write.
 */
export const set = Effect.fn("ManagePublishedVisibility.set")(function* (
  request: VisibilitySetRequest,
) {
  const parsed = yield* parseVisibilityTarget(request.target);
  const registryUrl = yield* RegistryUrl;
  const client = yield* createRegistryClient(registryUrl);
  const evaluation = yield* client.getExtensionVisibility({ ...parsed.parts, intent: null });
  const missing = requireEstablishedVisibility(request.target, evaluation);
  if (Option.isSome(missing)) return yield* Effect.fail(missing.value);
  const actual = evaluation.actual;
  if (actual === null) {
    return yield* Effect.fail(
      new PublishFailed({
        category: "internal",
        detail: "The Registry visibility evaluation lost its established value.",
      }),
    );
  }
  const mutation = yield* runWithStepUp(
    (verification) =>
      client.updateExtensionVisibility({
        target: parsed.fqn,
        visibility: request.visibility,
        revision: actual.revision,
        authority: { kind: "operator" },
        ...(verification === undefined ? {} : { verification }),
      }),
    {
      operationLabel: `Update ${request.target}`,
      waitingLabel: `verification to update ${request.target}`,
    },
    request.verification,
    registryUrl,
  );
  return {
    registry: registryUrl,
    verificationCompleted: mutation.stepUpCompleted,
    mutation: mutation.value satisfies VisibilityMutationResult,
  };
});

/** Apply the repository's declared intent, carrying its provenance. */
export const reconcile = Effect.fn("ManagePublishedVisibility.reconcile")(function* (
  request: VisibilityWriteRequest,
) {
  const parsed = yield* parseVisibilityTarget(request.target);
  const intent: VisibilityIntent | null = yield* repositoryVisibilityIntent(parsed.parts);
  if (intent === null) {
    return yield* Effect.fail(
      validation(`${request.target} has no manifest or workspace visibility intent to reconcile.`),
    );
  }
  const registryUrl = yield* RegistryUrl;
  const client = yield* createRegistryClient(registryUrl);
  const evaluation = yield* client.getExtensionVisibility({ ...parsed.parts, intent });
  const missing = requireEstablishedVisibility(request.target, evaluation);
  if (Option.isSome(missing)) return yield* Effect.fail(missing.value);
  const actual = evaluation.actual;
  if (actual === null) {
    return yield* Effect.fail(
      new PublishFailed({
        category: "internal",
        detail: "The Registry visibility evaluation lost its established value.",
      }),
    );
  }
  const mutation = yield* runWithStepUp(
    (verification) =>
      client.updateExtensionVisibility({
        target: parsed.fqn,
        visibility: intent.value,
        revision: actual.revision,
        authority: {
          kind: "repository",
          source: intent.source,
          fingerprint: intent.fingerprint,
        },
        ...(verification === undefined ? {} : { verification }),
      }),
    {
      operationLabel: `Reconcile ${request.target}`,
      waitingLabel: `verification to reconcile ${request.target}`,
    },
    request.verification,
    registryUrl,
  );
  return {
    registry: registryUrl,
    verificationCompleted: mutation.stepUpCompleted,
    mutation: mutation.value satisfies VisibilityMutationResult,
  };
});

/** The application API for whole-extension Registry visibility. */
export const ManagePublishedVisibility = { status, set, reconcile } as const;
