/**
 * The publication set: the exact set of versions one invocation asks a
 * Registry to admit, the authoritative preview that admits or blocks it, and
 * the upload that settles one admitted candidate.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import {
  extensionTypeToPlural,
  formatFqn,
  parseFqn,
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionVisibility } from "@agentxm/extension-model/unstable/extensions/common";
import {
  decodeVersionRangeSync,
  type Version,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  resolveVisibilityIntent,
  type PublishVisibility,
  type VisibilityIntent,
} from "@agentxm/registry-protocol/unstable/publish";
import {
  PUBLICATION_SET_CONTRACT,
  archiveSha256Hex,
  type PackDependencyDescriptor,
  type PreviewPublicationSetRequest,
  type PublicationCandidateResult,
  type PublicationDescriptor,
  type PublicationVisibilityInput,
  type VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry";
import {
  createRegistryClient,
  type RegistryClient,
  type RegistryPublishWarning,
} from "@agentxm/registry-client";

import { PublishFailed } from "../errors.js";
import {
  exactPublishUploadBinding,
  previewPublishUploadBinding,
  type PublishGrant,
  type ResolvedPublishPreview,
} from "../authorization.js";
import { settlePublish } from "../settlement.js";

import type { PublishFailure } from "../failure.js";
import type { PublishCandidate, TargetRegistry } from "./model.js";

const internal = (detail: string) => new PublishFailed({ category: "internal", detail });

export const publishTargetKey = (target: {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}): string =>
  `${target.owner}/${extensionTypeToPlural[target.type]}/${target.name}@${target.version}`;

export const publishItemId = (target: {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
}): string => formatFqn(target);

const packDependencyDescriptors = Effect.fn("Publish.packDependencyDescriptors")(function* (
  dependencies: Readonly<Record<string, unknown>>,
) {
  return yield* Effect.forEach(Object.entries(dependencies), ([fqn, range]) =>
    Effect.gen(function* () {
      const parsed = yield* Effect.fromResult(
        Result.mapError(
          parseFqn(fqn),
          (cause) =>
            new PublishFailed({
              category: "validation",
              detail: `Invalid fully qualified name: ${fqn}`,
              cause,
            }),
        ),
      );
      if (parsed.type === "pack" || typeof range !== "string") {
        return yield* Effect.fail(
          new PublishFailed({
            category: "validation",
            detail: `Pack dependency ${fqn} is not a valid non-pack dependency.`,
          }),
        );
      }
      return {
        owner: parsed.owner,
        type: parsed.type,
        name: parsed.name,
        range: decodeVersionRangeSync(range),
      } satisfies PackDependencyDescriptor;
    }),
  );
});

/**
 * The visibility a publication declares: the manifest's decision, else the
 * workspace default. One resolver for publish and for `visibility`.
 */
export const declaredVisibilityIntent = (declaration: {
  readonly manifestVisibility?: ExtensionVisibility;
  readonly workspaceDefault: Option.Option<ExtensionVisibility>;
}): VisibilityIntent | null =>
  resolveVisibilityIntent({
    ...(declaration.manifestVisibility === undefined
      ? {}
      : {
          manifest: {
            value: declaration.manifestVisibility,
            material: JSON.stringify({ publish: { visibility: declaration.manifestVisibility } }),
          },
        }),
    ...Option.match(declaration.workspaceDefault, {
      onNone: () => ({}),
      onSome: (defaultVisibility) => ({
        workspace: {
          value: defaultVisibility,
          material: JSON.stringify({ publish: { defaultVisibility } }),
        },
      }),
    }),
  });

const publicationDescriptorForCandidate = Effect.fn("Publish.publicationDescriptor")(function* (
  candidate: PublishCandidate,
  visibility: Option.Option<ExtensionVisibility>,
  workspaceDefaultVisibility: Option.Option<ExtensionVisibility>,
) {
  const pack =
    candidate.type === "pack"
      ? { dependencies: yield* packDependencyDescriptors(candidate.dependencies ?? {}) }
      : undefined;
  return {
    target: {
      owner: candidate.owner,
      type: candidate.type,
      name: candidate.name,
      version: candidate.version,
    },
    participation: candidate.action === "publish" ? "publish" : "verified-existing",
    visibility: {
      intent: declaredVisibilityIntent({
        ...(candidate.publishVisibility === undefined
          ? {}
          : { manifestVisibility: candidate.publishVisibility }),
        workspaceDefault: workspaceDefaultVisibility,
      }),
      request: Option.getOrNull(visibility),
    },
    ...(candidate.action === "publish"
      ? { archiveSha256Hex: archiveSha256Hex(candidate.archive) }
      : {}),
    ...(pack === undefined ? {} : { pack }),
  } satisfies PublicationDescriptor;
});

export const publicationSetForCandidates = Effect.fn("Publish.publicationSet")(function* (
  candidates: ReadonlyArray<PublishCandidate>,
  visibility: Option.Option<ExtensionVisibility>,
  workspaceDefaultVisibility: Option.Option<ExtensionVisibility>,
) {
  return {
    contract: PUBLICATION_SET_CONTRACT,
    candidates: yield* Effect.forEach(candidates, (candidate) =>
      publicationDescriptorForCandidate(candidate, visibility, workspaceDefaultVisibility),
    ),
  } satisfies PreviewPublicationSetRequest;
});

const resolvedPublishPreview = (
  result: PublicationCandidateResult,
  publicationSetDigest: string,
  visibilityInput: PublicationVisibilityInput,
): Effect.Effect<ResolvedPublishPreview, PublishFailed> =>
  result.kind === "resolved" && result.visibility.resolved !== null
    ? Effect.succeed({
        visibility: result.visibility.resolved,
        visibilityInput,
        ...(result.condition === undefined ? {} : { condition: result.condition }),
        publicationSetDigest,
        publicationDescriptorDigest: result.descriptorDigest,
      })
    : Effect.fail(
        new PublishFailed({
          category: "validation",
          detail: `The registry could not authoritatively preview ${publishTargetKey(result.target)}.`,
        }),
      );

/**
 * Ask the Registry to admit the complete publication set before any upload.
 * A blocked set fails here: no candidate in it is attempted.
 */
export const previewPublishCandidates = Effect.fn("Publish.previewCandidates")(function* (
  candidates: ReadonlyArray<PublishCandidate>,
  client: Pick<RegistryClient, "previewExtensionPublishes">,
  visibility: Option.Option<ExtensionVisibility>,
  workspaceDefaultVisibility: Option.Option<ExtensionVisibility>,
) {
  const publicationSet = yield* publicationSetForCandidates(
    candidates,
    visibility,
    workspaceDefaultVisibility,
  );
  const preview = yield* client.previewExtensionPublishes(publicationSet);
  if (preview.status === "blocked") {
    const packErrors = preview.packs.flatMap((pack) =>
      pack.findings.filter((finding) => finding.severity === "error"),
    );
    return yield* Effect.fail(
      new PublishFailed({
        category: "validation",
        detail:
          packErrors[0]?.message ??
          "The registry blocked the complete publication set before any upload.",
        suggestions: packErrors.flatMap((finding) => finding.suggestions),
        cause: preview,
      }),
    );
  }

  const resultsByTarget = new Map<string, PublicationCandidateResult>();
  const visibilityByTarget = new Map(
    publicationSet.candidates.map((descriptor) => [
      publishTargetKey(descriptor.target),
      descriptor.visibility,
    ]),
  );
  for (const result of preview.candidates) {
    const key = publishTargetKey(result.target);
    if (resultsByTarget.has(key)) {
      return yield* Effect.fail(
        internal("The registry returned an incompatible authoritative publish preview."),
      );
    }
    resultsByTarget.set(key, result);
  }

  const prepared: ReadonlyArray<PublishCandidate> = yield* Effect.forEach(candidates, (candidate) =>
    Effect.gen(function* () {
      const result = resultsByTarget.get(publishTargetKey(candidate));
      const visibilityInput = visibilityByTarget.get(publishTargetKey(candidate));
      if (result === undefined || visibilityInput === undefined) {
        return yield* Effect.fail(
          internal("The registry returned an incomplete authoritative publish preview."),
        );
      }
      return {
        ...candidate,
        publishPreview: yield* resolvedPublishPreview(
          result,
          preview.publicationSetDigest,
          visibilityInput,
        ),
      } satisfies PublishCandidate;
    }),
  );

  return { candidates: prepared, publicationSet, preview };
});

/** A settled upload, or the evidence that its outcome could not be proven. */
export type PublishedCandidate =
  | {
      readonly status: "unknown";
      readonly reason: string;
      readonly settlement: "unresolved";
      readonly failure: PublishFailure;
    }
  | {
      readonly status: "published";
      readonly stepResult: {
        readonly result: "success";
        readonly message: string;
        readonly links?: { readonly html: string };
      };
      readonly visibility: PublishVisibility;
      readonly warnings: ReadonlyArray<RegistryPublishWarning>;
      readonly settlement: "response" | "readback" | "replay";
    };

export const publishCandidate: (
  candidate: PublishCandidate,
  registry: TargetRegistry,
  exactCapability: PublishGrant | undefined,
  exactVisibilityInput: PublicationVisibilityInput | undefined,
  onUploadDispatched?: Effect.Effect<void>,
) => Effect.Effect<
  PublishedCandidate,
  PublishFailure,
  HttpClient.HttpClient | FileSystem.FileSystem | Path.Path
> = (
  candidate: PublishCandidate,
  registry: TargetRegistry,
  exactCapability: PublishGrant | undefined,
  exactVisibilityInput: PublicationVisibilityInput | undefined,
  /**
   * Records that the upload request is being dispatched, before the response
   * wait — the invocation-local evidence that separates "nothing left the
   * process" from "the registry may have committed before its response was
   * recorded".
   */
  onUploadDispatched: Effect.Effect<void> = Effect.void,
) =>
  Effect.gen(function* () {
    const client = yield* createRegistryClient(registry.url);
    const metadata: VersionEntry = {
      version: candidate.version,
      published: yield* DateTime.now,
      integrity: candidate.integrity,
      ...(candidate.packages === undefined ? {} : { packages: candidate.packages }),
      ...(candidate.dependencies === undefined ? {} : { dependencies: candidate.dependencies }),
    };
    const publishPreview = candidate.publishPreview;
    if (publishPreview === undefined && exactCapability === undefined) {
      return yield* Effect.fail(
        internal(`Missing authoritative visibility input for ${candidate.fqn}.`),
      );
    }
    const visibilityInput = publishPreview?.visibilityInput ?? exactVisibilityInput;
    if (visibilityInput === undefined) {
      return yield* Effect.fail(internal(`Missing exact visibility input for ${candidate.fqn}.`));
    }
    const authoritativeVisibility = publishPreview?.visibility ?? exactCapability?.visibility;
    if (authoritativeVisibility === undefined) {
      return yield* Effect.fail(
        internal(`Missing authoritative visibility outcome for ${candidate.fqn}.`),
      );
    }
    const uploadBinding =
      exactCapability === undefined
        ? publishPreview === undefined
          ? yield* Effect.fail(
              internal(`Missing authoritative visibility input for ${candidate.fqn}.`),
            )
          : previewPublishUploadBinding(publishPreview)
        : exactPublishUploadBinding(exactCapability, visibilityInput);
    // The dispatch evidence is recorded before the request can leave the
    // process; the response wait itself stays interruptible. Publication is
    // replay-unsafe, so an unrecorded response is never auto-retried — it is
    // reported indeterminate and recovery verifies before re-running.
    const settlement = yield* Effect.uninterruptibleMask((restore) =>
      onUploadDispatched.pipe(
        Effect.andThen(
          restore(
            settlePublish(client, {
              owner: candidate.owner,
              type: candidate.type,
              name: candidate.name,
              version: candidate.version,
              archive: candidate.archive,
              metadata,
              ...uploadBinding,
            }),
          ),
        ),
      ),
    );
    if (settlement.status === "unknown") {
      return {
        status: "unknown",
        reason: settlement.reason,
        settlement: settlement.settlement,
        failure: settlement.error,
      } satisfies PublishedCandidate;
    }
    const response = settlement.response;
    return {
      status: "published",
      stepResult: {
        result: "success",
        message:
          settlement.settlement === "response"
            ? `Published ${candidate.fqn}@${candidate.version}`
            : settlement.settlement === "replay"
              ? `Published ${candidate.fqn}@${candidate.version} after one exact replay`
              : `Verified ${candidate.fqn}@${candidate.version} by Registry readback`,
        ...(response?.links === undefined ? {} : { links: response.links }),
      },
      visibility: response?.visibility ?? authoritativeVisibility,
      warnings: response?.warnings ?? [],
      settlement: settlement.settlement,
    } satisfies PublishedCandidate;
  });
