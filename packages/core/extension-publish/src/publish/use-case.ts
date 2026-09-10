/**
 * `PublishExtensions`: the application API for publishing workspace-authored
 * extensions to a Registry.
 *
 * `prepare` resolves the target Registry, selects candidates, validates and
 * builds their archives, settles existing-version policy, and obtains the
 * Registry's authoritative admission of the complete publication set.
 * `previewOrApply` presents that immutable candidate and, on apply, acquires
 * exact authorization, revalidates the sources it planned against, and
 * uploads. Every termination resolves to one `PublishOutcome`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import { formatFqn } from "@agentxm/extension-model/unstable/extensions";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  publicationDescriptorDigest,
  publicationSetDigest,
  PreviewPublicationSetResponseSchema,
  type PreviewPublicationSetRequest,
  type PreviewPublicationSetResponse,
} from "@agentxm/registry-protocol/unstable/registry";
import {
  createRegistryClient,
  RegistryUrl,
  type RegistryPublishWarning,
} from "@agentxm/registry-client";
import type { GitDirectoryComparison } from "@agentxm/extension-sources";
import {
  AuthClient,
  AuthLoginPresenter,
  DeviceLoginInteraction,
  PendingPublishAuthorizationStore,
  resolveRequestToken,
  runPublishAuthorization,
  type AuthError,
  type PublishCapabilityResponse,
} from "@agentxm/registry-auth";
import {
  buildPackDependencyReachability,
  makeProspectiveExtensionConstraintFacts,
  type PackDependencyDeclaration,
  type PackDependencyMemberObservation,
  type PackDependencyReachability,
} from "@agentxm/workspace-projection";
import {
  InterruptionSignalSource,
  OperationJournal,
  awaitDrained,
  deriveOperationOutcome,
  getOperationJournal,
  makeOperationJournal,
  observeUnit,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  settleOperation,
  type Job,
  type JobStepResult,
  type OperationPrecondition,
  type Plan,
  type PlanExecution,
  type PlanRiskCondition,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";
import { FootprintRecorder, makeFootprintRecorder } from "@agentxm/workspace-transactions";

import { PublishFailed } from "../errors.js";
import { aggregatePublishFailure, publishCause, type PublishFailure } from "../failure.js";
import { publishAuthenticationPreconditions } from "../authorization.js";
import { buildPublishJobs } from "../jobs.js";
import {
  findPackPublishDivergenceFindings,
  localPackConstraintFailures,
  validatePublishOwners,
  type PublishAdvisoryFinding,
} from "../preflight.js";
import { publishRecoverySelection } from "../recovery.js";
import { assessPublishSourceState, publishSourceRiskCondition } from "../source-state.js";
import type { PublishSettlement } from "../settlement.js";
import {
  catalogEntries,
  decodeCandidate,
  resolveExistingVersionPolicy,
  resolveTargetRegistry,
  selectEntries,
  type PublishCandidate,
  type PublishPreparationFailure,
  type PublishRequest,
  type PublishSelection,
  type TargetRegistry,
} from "./model.js";
import {
  failedCandidateResult,
  failedSelectedResult,
  interruptedPublishResults,
  preparationFailureOf,
  publicationSetResult,
  pendingHumanCause,
  publishStepFailure,
  publishStepFailureCause,
  selectedResult,
  unconfirmedPublishOutcomes,
} from "./outcome.js";
import {
  previewPublishCandidates,
  publicationSetForCandidates,
  publishCandidate,
  publishTargetKey,
} from "./publication.js";
import type { PublishPublicationSet, PublishResult, PublishResultItem } from "./result.js";

const internal = (detail: string) => new PublishFailed({ category: "internal", detail });

/** The selection facts one publish result reports. */
export type PublishSelectionSummary = Omit<
  PublishResult["selection"],
  "counts" | "dependencyInclusion"
>;

/** How an invocation must terminate once its result document is reported. */
export type PublishDisposition =
  | { readonly _tag: "Completed" }
  | { readonly _tag: "Failed"; readonly failure: PublishFailed }
  | { readonly _tag: "Interrupted"; readonly signal: "SIGINT" | "SIGTERM" };

/**
 * One publish invocation's typed outcome. The application renders it, adds
 * the recovery command it alone can spell, and maps `disposition` to an exit.
 */
export interface PublishOutcome {
  readonly mode: "preview" | "apply";
  readonly selection: PublishSelectionSummary;
  readonly publicationSet: PublishPublicationSet;
  readonly results: ReadonlyArray<PublishResultItem>;
  readonly preconditions?: ReadonlyArray<OperationPrecondition>;
  readonly riskConditions?: ReadonlyArray<PlanRiskCondition>;
  readonly failure?: PublishResult["execution"]["failure"];
  readonly interruption?: PublishResult["interruption"];
  /** Items a continuation must cover, and the dependents they blocked. */
  readonly recovery?: {
    readonly description: string;
    readonly remainingItems: ReadonlyArray<string>;
    readonly blockedDependents: ReadonlyArray<string>;
  };
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly disposition: PublishDisposition;
}

/** A prepared publish run: either already settled, or ready to resolve. */
export type PublishPreparation =
  | { readonly _tag: "Settled"; readonly outcome: PublishOutcome }
  | { readonly _tag: "Ready"; readonly candidate: PublishCandidateSet };

interface PublishAuthorizationState {
  readonly exactCapabilities: ReadonlyMap<string, PublishCapabilityResponse>;
  readonly issuedCapabilities: ReadonlyArray<PublishCapabilityResponse>;
  readonly packDivergenceFindings: ReadonlyMap<string, ReadonlyArray<PublishAdvisoryFinding>>;
  readonly preview?: PreviewPublicationSetResponse;
}

type PublishPlanOutput =
  | {
      readonly _tag: "PublishAuthorizationOutput";
      readonly packDivergenceFindings: ReadonlyMap<string, ReadonlyArray<PublishAdvisoryFinding>>;
      readonly preview?: PreviewPublicationSetResponse;
    }
  | {
      readonly _tag: "PublishedCandidateOutput";
      readonly targetKey: string;
      readonly visibility: PublishCapabilityResponse["visibility"];
      readonly warnings: ReadonlyArray<RegistryPublishWarning>;
      readonly settlement: Exclude<PublishSettlement, "unresolved">;
    };

type PublishPlanRequirements =
  | HttpClient.HttpClient
  | FileSystem.FileSystem
  | Path.Path
  | GitDirectoryComparison
  | AuthClient
  | AuthLoginPresenter
  | DeviceLoginInteraction
  | PendingPublishAuthorizationStore;

/** Everything an admitted publish run needs to preview, confirm, and apply. */
export interface PublishCandidateSet {
  readonly request: PublishRequest;
  readonly registry: TargetRegistry;
  readonly selection: PublishSelectionSummary;
  readonly publicationSetOutput: PublishPublicationSet;
  readonly preflightResults: ReadonlyArray<PublishResultItem>;
  readonly candidates: ReadonlyArray<PublishCandidate>;
  readonly uploadCandidates: ReadonlyArray<PublishCandidate>;
  readonly publicationSet: PreviewPublicationSetRequest | undefined;
  readonly packDependencyReachability: ReadonlyArray<PackDependencyReachability>;
  readonly preconditions: ReadonlyArray<OperationPrecondition>;
  readonly riskConditions: ReadonlyArray<PlanRiskCondition>;
  readonly remoteRegistry: boolean;
  readonly authenticated: boolean;
  /** Candidate fully qualified names, in selection order, for recovery. */
  readonly candidateFqns: ReadonlyArray<string>;
}

const isRemote = (url: string): boolean => url.startsWith("https://") || url.startsWith("http://");

/**
 * The pack/member reachability the local workspace represents, derived from
 * the manifests the catalog already read. Publish uses it to refuse a
 * selection that would leave an installed pack's member unreachable.
 */
const workspaceReachability = (
  selection: PublishSelection,
): ReadonlyArray<PackDependencyReachability> => {
  const packs: ReadonlyArray<PackDependencyDeclaration> = selection.identities.flatMap((entry) =>
    entry.type === "pack" && entry.declaredDependencies !== undefined
      ? [
          {
            packFqn: entry.fqn,
            packAuthority: entry.authored ? "workspace" : "registry",
            manifestPath: entry.extensionDir ?? entry.fqn,
            dependencies: entry.declaredDependencies,
          } satisfies PackDependencyDeclaration,
        ]
      : [],
  );
  const members: ReadonlyArray<PackDependencyMemberObservation> = selection.identities.flatMap(
    (entry) =>
      entry.declaredVersion === undefined
        ? []
        : [
            {
              fqn: entry.fqn,
              version: entry.declaredVersion,
              authority: entry.authored ? "workspace" : "registry",
            } satisfies PackDependencyMemberObservation,
          ],
  );
  return buildPackDependencyReachability({ packs, members });
};

const rejectIncoherentRequest = (request: PublishRequest, registry: TargetRegistry) => {
  if (
    request.waitForHumanSeconds !== undefined &&
    (!Number.isSafeInteger(request.waitForHumanSeconds) || request.waitForHumanSeconds <= 0)
  ) {
    return Option.some(
      new PublishFailed({
        category: "validation",
        detail: "--wait-for-human must be a positive whole number of seconds.",
      }),
    );
  }
  if (request.authorizationRequest !== undefined && (request.preview || !isRemote(registry.url))) {
    return Option.some(
      new PublishFailed({
        category: "validation",
        detail: "--authorization-request requires a remote publish operation.",
      }),
    );
  }
  return Option.none();
};

export const prepare = Effect.fn("PublishExtensions.prepare")(function* (request: PublishRequest) {
  const registry = yield* observeUnit(
    { id: "registry", label: "publish registry" },
    resolveTargetRegistry(request.registry, request.registryUrl),
  );
  const incoherent = rejectIncoherentRequest(request, registry);
  if (Option.isSome(incoherent)) return yield* Effect.fail(incoherent.value);

  const workspace = yield* WorkspaceMutations;
  const registryUrl = yield* RegistryUrl;
  const remoteRegistry = isRemote(registry.url);

  const prepared = yield* observeUnit(
    { id: "candidates", label: "publish candidates" },
    Effect.gen(function* () {
      const catalog = yield* catalogEntries();
      const selection = yield* selectEntries(catalog, request);
      if (remoteRegistry && selection.entries.length > 0) {
        const client = yield* createRegistryClient(registry.url);
        yield* validatePublishOwners(
          selection.entries.map((entry) => entry.owner),
          client,
        );
      }
      const decoded = yield* Effect.forEach(
        selection.entries,
        (entry) =>
          Effect.result(
            decodeCandidate(
              entry,
              resolveExistingVersionPolicy(request.onExisting, {
                mode: selection.mode,
                includedDependency: entry.includedDependency === true,
              }),
              registry,
              request.backfill,
            ),
          ),
        { concurrency: 4 },
      );
      return { selection, decoded };
    }),
  );
  const selection = prepared.selection;
  const selected = selection.entries;
  const decoded: ReadonlyArray<
    Result.Result<PublishCandidate | undefined, PublishFailure | PublishPreparationFailure>
  > = prepared.decoded;
  const decodedCandidates = decoded.flatMap((result) =>
    Result.isSuccess(result) && result.success !== undefined ? [result.success] : [],
  );
  const decodedPreflightFailures = decoded.flatMap((result) =>
    Result.isFailure(result) ? [preparationFailureOf(result.failure)] : [],
  );
  const sourceAssessments = yield* Effect.forEach(decodedCandidates, (candidate) =>
    Effect.result(
      Effect.gen(function* () {
        if (candidate.action === "skip") return candidate;
        const sourceAssessment = yield* assessPublishSourceState({
          directory: candidate.extensionDir,
          archivePlan: candidate.archivePlan,
          ...(candidate.publishIgnore === undefined ? {} : { ignore: candidate.publishIgnore }),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new PublishFailed({
                category: "internal",
                detail: `Could not assess the published source state for ${candidate.fqn}.`,
                cause,
              }),
          ),
        );
        return { ...candidate, sourceAssessment } satisfies PublishCandidate;
      }),
    ),
  );
  const sourceFailuresByMember = new Map<string, PublishFailure>(
    sourceAssessments.flatMap((result, index) => {
      const candidate = decodedCandidates[index];
      return candidate === undefined || Result.isSuccess(result)
        ? []
        : [[candidate.fqn, result.failure] as const];
    }),
  );
  const sourceAssessedCandidates = sourceAssessments.flatMap((result) =>
    Result.isSuccess(result) ? [result.success] : [],
  );
  const packDependencyReachability = sourceAssessedCandidates.some(
    (candidate) => candidate.authored,
  )
    ? workspaceReachability(selection)
    : [];
  const localConstraintFacts = makeProspectiveExtensionConstraintFacts({
    candidates: sourceAssessedCandidates.filter(
      (candidate) => candidate.type === "pack" || candidate.authored,
    ),
    reachability: packDependencyReachability,
  });
  const localFailuresByMember = localPackConstraintFailures(localConstraintFacts);
  const preflightFailures: ReadonlyArray<PublishFailure> = [
    ...decodedPreflightFailures,
    ...sourceFailuresByMember.values(),
    ...localFailuresByMember.values(),
  ];
  const selectionOutput: PublishSelectionSummary = {
    mode: selection.mode,
    scope: request.scope,
    owners: [...new Set(selected.map((entry) => entry.owner))],
    types: [...new Set(selected.map((entry) => entry.type))],
    registry: registry.name,
    decisions: selection.decisions,
  };
  if (selected.length === 0) {
    const preparation: PublishPreparation = {
      _tag: "Settled",
      outcome: {
        mode: request.preview ? "preview" : "apply",
        selection: selectionOutput,
        publicationSet: publicationSetResult({ candidates: [] }),
        results: [],
        suggestions: [],
        disposition: { _tag: "Completed" },
      },
    };
    return preparation;
  }

  const storedToken = yield* resolveRequestToken(registry.url, registryUrl);
  const workspaceDefaultVisibility = yield* workspace.getPublishDefaultVisibility();
  const shouldPreviewAuthoritatively =
    preflightFailures.length === 0 &&
    sourceAssessedCandidates.length > 0 &&
    (!remoteRegistry || Option.isSome(storedToken));
  const authoritativePreview: Result.Result<
    {
      readonly candidates: ReadonlyArray<PublishCandidate>;
      readonly publicationSet: PreviewPublicationSetRequest;
      readonly preview?: PreviewPublicationSetResponse;
    },
    PublishFailure
  > = shouldPreviewAuthoritatively
    ? yield* Effect.result(
        Effect.gen(function* () {
          const client = yield* createRegistryClient(registry.url);
          return yield* previewPublishCandidates(
            sourceAssessedCandidates,
            client,
            request.visibility,
            workspaceDefaultVisibility,
          );
        }),
      )
    : yield* Effect.result(
        Effect.gen(function* () {
          return {
            candidates: sourceAssessedCandidates,
            publicationSet: yield* publicationSetForCandidates(
              sourceAssessedCandidates,
              request.visibility,
              workspaceDefaultVisibility,
            ),
          };
        }),
      );
  const authoritativeFailure = Result.isFailure(authoritativePreview)
    ? authoritativePreview.failure
    : undefined;
  const authoritativeFailurePreview =
    authoritativeFailure === undefined || authoritativeFailure._tag !== "PublishFailed"
      ? undefined
      : Option.getOrUndefined(
          Schema.decodeUnknownOption(PreviewPublicationSetResponseSchema)(
            authoritativeFailure.cause,
          ),
        );
  const candidates: ReadonlyArray<PublishCandidate> = Result.isSuccess(authoritativePreview)
    ? authoritativePreview.success.candidates
    : sourceAssessedCandidates;
  const publicationSet = Result.isSuccess(authoritativePreview)
    ? authoritativePreview.success.publicationSet
    : undefined;
  const packDivergenceFindings = findPackPublishDivergenceFindings({
    candidates,
    reachability: packDependencyReachability,
    packs:
      Result.isSuccess(authoritativePreview) && authoritativePreview.success.preview !== undefined
        ? authoritativePreview.success.preview.packs
        : [],
  });
  const publicationSetOutput = publicationSetResult({
    candidates,
    ...(Result.isSuccess(authoritativePreview) && authoritativePreview.success.preview !== undefined
      ? { preview: authoritativePreview.success.preview }
      : authoritativeFailurePreview === undefined
        ? {}
        : { preview: authoritativeFailurePreview }),
    ...(authoritativeFailure === undefined ? {} : { blocked: authoritativeFailure }),
  });
  const candidatesByTarget = new Map(
    candidates.map((candidate) => [publishTargetKey(candidate), candidate]),
  );

  const initialPreflightResults = selected.map((entry, index) => {
    const decodedResult = decoded[index];
    if (decodedResult === undefined) return selectedResult(entry, undefined);
    if (Result.isFailure(decodedResult)) return failedSelectedResult(entry, decodedResult.failure);
    const candidate = decodedResult.success;
    if (candidate !== undefined) {
      const sourceFailure = sourceFailuresByMember.get(candidate.fqn);
      if (sourceFailure !== undefined) return failedCandidateResult(candidate, sourceFailure);
      const localFailure = localFailuresByMember.get(candidate.fqn);
      if (localFailure !== undefined) return failedCandidateResult(candidate, localFailure);
    }
    const item = selectedResult(
      entry,
      candidate === undefined
        ? undefined
        : (candidatesByTarget.get(publishTargetKey(candidate)) ?? candidate),
    );
    const findings =
      candidate === undefined ? undefined : packDivergenceFindings.get(candidate.fqn);
    return findings === undefined ? item : { ...item, findings };
  });
  const localPreflightFailureIds = initialPreflightResults
    .filter((result) => result.status === "failed")
    .map((result) => result.id);
  const preflightResults = initialPreflightResults.map((result): PublishResultItem => {
    if (preflightFailures.length > 0) {
      return result.action === "publish"
        ? {
            ...result,
            status: "blocked",
            reason: "blocked_by_preflight",
            message: "Not attempted because another selected extension failed preflight",
            blockedBy:
              localPreflightFailureIds.length === 0
                ? ["local-publication-preflight"]
                : localPreflightFailureIds,
          }
        : result;
    }
    if (authoritativeFailure === undefined || result.version === undefined) return result;
    const causalFindings = publicationSetOutput.findings
      .filter((finding) => finding.targetId === result.id)
      .map((finding) => finding.id);
    return {
      ...result,
      action: "error",
      phase: "authoritative_preflight",
      status: "blocked",
      reason: "blocked_by_preflight",
      message: "Not attempted because authoritative publish preflight failed",
      blockedBy: causalFindings.length === 0 ? ["authoritative-publication-set"] : causalFindings,
    };
  });
  const allPreflightFailures = [
    ...preflightFailures,
    ...(authoritativeFailure === undefined ? [] : [authoritativeFailure]),
  ];
  if (allPreflightFailures.length > 0) {
    const preparation: PublishPreparation = {
      _tag: "Settled",
      outcome: {
        mode: request.preview ? "preview" : "apply",
        selection: selectionOutput,
        publicationSet: publicationSetOutput,
        results: preflightResults,
        ...(authoritativeFailure === undefined
          ? {}
          : { failure: publishCause(authoritativeFailure) }),
        suggestions: [],
        disposition: {
          _tag: "Failed",
          failure: aggregatePublishFailure(allPreflightFailures.length, allPreflightFailures),
        },
      },
    };
    return preparation;
  }

  const uploadCandidates = candidates.filter((candidate) => candidate.action === "publish");
  const preconditions = publishAuthenticationPreconditions({
    preview: request.preview,
    remoteRegistry,
    authenticated: Option.isSome(storedToken),
    hasPublishCandidates: uploadCandidates.length > 0,
  });
  if (uploadCandidates.length === 0) {
    const preparation: PublishPreparation = {
      _tag: "Settled",
      outcome: {
        mode: request.preview ? "preview" : "apply",
        selection: selectionOutput,
        publicationSet: publicationSetOutput,
        results: preflightResults,
        suggestions: [],
        disposition: { _tag: "Completed" },
      },
    };
    return preparation;
  }

  const riskConditions = uploadCandidates.flatMap((candidate) => {
    const condition = publishSourceRiskCondition(candidate.fqn, candidate.sourceAssessment?.state);
    return condition === undefined ? [] : [condition];
  });

  const preparation: PublishPreparation = {
    _tag: "Ready",
    candidate: {
      request,
      registry,
      selection: selectionOutput,
      publicationSetOutput,
      preflightResults,
      candidates,
      uploadCandidates,
      publicationSet,
      packDependencyReachability,
      preconditions,
      riskConditions,
      remoteRegistry,
      authenticated: Option.isSome(storedToken),
      candidateFqns: candidates.map((candidate) => candidate.fqn),
    },
  };
  return preparation;
});

/**
 * Present the prepared candidate and, on apply, authorize, revalidate, and
 * upload it. Remote publication is not restorable: the plan declares itself
 * non-rollbackable and every unproven upload is reported, never retried.
 *
 * The whole resolution is uninterruptible except the plan: an external
 * termination must be able to stop the upload, and the outcome that
 * termination settles into must survive to be reported, so the interrupt is
 * caught outside the interruptible region and everything after it — the
 * evidenced results, the recovery selection, the outcome — is built where no
 * further interrupt can land.
 */
export const previewOrApply = Effect.fn("PublishExtensions.previewOrApply")(function* (
  candidateSet: PublishCandidateSet,
  execution: PlanExecution,
) {
  const {
    request,
    registry,
    candidates,
    uploadCandidates,
    publicationSet,
    packDependencyReachability,
  } = candidateSet;
  const authClient = yield* AuthClient;
  const remoteUnauthenticated = candidateSet.remoteRegistry && !candidateSet.authenticated;

  const expectedPublicationSetDigest =
    publicationSet === undefined ? undefined : publicationSetDigest(publicationSet.candidates);
  const descriptorDigestsByTarget = new Map(
    (publicationSet?.candidates ?? []).map((descriptor) => [
      publishTargetKey(descriptor.target),
      publicationDescriptorDigest(descriptor),
    ]),
  );
  const visibilityInputsByTarget = new Map(
    (publicationSet?.candidates ?? []).map((descriptor) => [
      publishTargetKey(descriptor.target),
      descriptor.visibility,
    ]),
  );

  const acquirePublishAuthorization: Effect.Effect<
    PublishAuthorizationState,
    PublishFailure | AuthError,
    AuthClient | AuthLoginPresenter | DeviceLoginInteraction | PendingPublishAuthorizationStore
  > =
    candidateSet.remoteRegistry &&
    (!candidateSet.authenticated || request.authorizationRequest !== undefined)
      ? Effect.gen(function* () {
          if (publicationSet === undefined) {
            return yield* Effect.fail(
              internal("The publication set was unavailable for exact authorization."),
            );
          }
          const exchange = yield* runPublishAuthorization({
            registryUrl: registry.url,
            publicationSet,
            unattended: request.unattended,
            ...(request.authorizationRequest === undefined
              ? {}
              : { authorizationRequest: request.authorizationRequest }),
            ...(request.waitForHumanSeconds === undefined
              ? {}
              : { waitForHumanSeconds: request.waitForHumanSeconds }),
          });
          if (exchange.status === "blocked") {
            const firstFinding = exchange.preview.packs
              .flatMap((pack) => pack.findings)
              .find((finding) => finding.severity === "error");
            return yield* Effect.fail(
              new PublishFailed({
                category: "validation",
                detail:
                  firstFinding?.message ??
                  "The reviewed publication set was blocked before any upload.",
                suggestions: firstFinding?.suggestions ?? [],
                cause: exchange.preview,
              }),
            );
          }
          const divergence = findPackPublishDivergenceFindings({
            candidates,
            reachability: packDependencyReachability,
            packs: exchange.preview.packs,
          });
          const byDescriptor = new Map<string, PublishCapabilityResponse>();
          for (const capability of exchange.grants) {
            if (
              byDescriptor.has(capability.publicationDescriptorDigest) ||
              capability.publicationSetDigest !== expectedPublicationSetDigest
            ) {
              return yield* Effect.fail(
                internal("The registry returned an incompatible exact publish grant bundle."),
              );
            }
            byDescriptor.set(capability.publicationDescriptorDigest, capability);
          }
          if (byDescriptor.size !== uploadCandidates.length) {
            return yield* Effect.fail(
              internal("The registry returned an incomplete exact publish grant bundle."),
            );
          }
          return {
            exactCapabilities: byDescriptor,
            issuedCapabilities: exchange.grants,
            packDivergenceFindings: divergence,
            preview: exchange.preview,
          } satisfies PublishAuthorizationState;
        })
      : Effect.succeed<PublishAuthorizationState>({
          exactCapabilities: new Map<string, PublishCapabilityResponse>(),
          issuedCapabilities: [],
          packDivergenceFindings: new Map<string, ReadonlyArray<PublishAdvisoryFinding>>(),
        });

  const releasePublishAuthorization = (authorization: PublishAuthorizationState) =>
    Effect.forEach(
      authorization.issuedCapabilities,
      (capability) =>
        authClient.revokeToken(capability.accessToken).pipe(Effect.catch(() => Effect.void)),
      { concurrency: 4, discard: true },
    );

  // Invocation-local evidence of dispatched uploads: which candidates'
  // requests were released toward the registry before termination.
  const dispatchedUploads = yield* Ref.make<ReadonlySet<string>>(new Set());
  const unresolvedSettlements = yield* Ref.make<ReadonlyMap<string, PublishFailure>>(new Map());
  const unresolvedReasons = yield* Ref.make<ReadonlyMap<string, string>>(new Map());

  const candidateStep = (
    authorizationState: Effect.Effect<PublishAuthorizationState, PublishFailure | AuthError>,
    candidate: PublishCandidate,
  ): PlannedJobStep<PublishPlanRequirements, PublishPlanOutput> => {
    const run = Effect.gen(function* () {
      const authorization = yield* authorizationState;
      const descriptorDigest =
        candidate.publishPreview?.publicationDescriptorDigest ??
        descriptorDigestsByTarget.get(publishTargetKey(candidate));
      const exactCapability =
        descriptorDigest === undefined
          ? undefined
          : authorization.exactCapabilities.get(descriptorDigest);
      if (remoteUnauthenticated && exactCapability === undefined) {
        return yield* Effect.fail(
          internal(`The exact grant bundle omitted ${candidate.fqn}@${candidate.version}.`),
        );
      }
      const published = yield* publishCandidate(
        candidate,
        registry,
        exactCapability,
        visibilityInputsByTarget.get(publishTargetKey(candidate)),
        Ref.update(dispatchedUploads, (dispatched) => new Set([...dispatched, candidate.fqn])),
      );
      if (published.status === "unknown") {
        const key = publishTargetKey(candidate);
        yield* Ref.update(
          unresolvedSettlements,
          (settlements) => new Map([...settlements, [key, published.failure]]),
        );
        yield* Ref.update(
          unresolvedReasons,
          (reasons) => new Map([...reasons, [key, published.reason]]),
        );
        return yield* Effect.fail(published.failure);
      }
      return {
        ...published.stepResult,
        output: {
          _tag: "PublishedCandidateOutput",
          targetKey: publishTargetKey(candidate),
          visibility: published.visibility,
          warnings: published.warnings,
          settlement: published.settlement,
        },
      } satisfies JobStepResult<PublishPlanOutput>;
    }).pipe(Effect.mapError(publishStepFailure));
    return {
      readiness: "ready",
      label: `${candidate.backfill ? "Backfill" : "Publish"} ${candidate.fqn}`,
      run,
    };
  };

  const revalidatePublishSources = Effect.forEach(
    uploadCandidates,
    (candidate) =>
      Effect.gen(function* () {
        const planned = candidate.sourceAssessment;
        if (planned === undefined) {
          return yield* Effect.fail(
            internal(`Missing source-state evidence for ${candidate.fqn}.`),
          );
        }
        const current = yield* assessPublishSourceState({
          directory: candidate.extensionDir,
          archivePlan: candidate.archivePlan,
          ...(candidate.publishIgnore === undefined ? {} : { ignore: candidate.publishIgnore }),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new PublishFailed({
                category: "internal",
                detail: `Could not assess the published source state for ${candidate.fqn}.`,
                cause,
              }),
          ),
        );
        if (current.fingerprint !== planned.fingerprint) {
          return yield* Effect.fail(
            new PublishFailed({
              category: "conflict",
              detail: `Publish source state changed after planning for ${candidate.fqn}; no upload was attempted.`,
            }),
          );
        }
      }),
    { discard: true },
  );

  // The journal and the footprint recorder are this run's own: the journal
  // records per-unit started and resolved facts through the apply so an
  // external termination resolves into evidenced states, and the footprint
  // records what was durably touched. Nothing outside this resolution reads
  // either, so the use case owns their lifetime instead of taking them from
  // the caller.
  const journal = yield* makeOperationJournal;
  const footprint = yield* makeFootprintRecorder;

  const resolved = yield* Effect.interruptible(
    Effect.scoped(
      Effect.gen(function* () {
        const authorizationDeferred = yield* Deferred.make<
          PublishAuthorizationState,
          PublishFailure | AuthError
        >();
        const acquired = yield* Ref.make(Option.none<PublishAuthorizationState>());
        yield* Effect.addFinalizer(() =>
          Ref.get(acquired).pipe(
            Effect.flatMap(
              Option.match({ onNone: () => Effect.void, onSome: releasePublishAuthorization }),
            ),
          ),
        );
        const authorize = yield* Effect.cached(
          acquirePublishAuthorization.pipe(
            Effect.tap((authorization) => Ref.set(acquired, Option.some(authorization))),
            Effect.tap((authorization) => Deferred.succeed(authorizationDeferred, authorization)),
            Effect.tapError((failure) => Deferred.fail(authorizationDeferred, failure)),
            Effect.asVoid,
          ),
        );
        const authorizationState = Deferred.await(authorizationDeferred);
        const authorizationJobs: ReadonlyArray<Job<PublishPlanRequirements, PublishPlanOutput>> =
          remoteUnauthenticated
            ? [
                {
                  concurrency: 1,
                  steps: [
                    {
                      readiness: "ready",
                      label: "Authorize exact publication set",
                      run: authorizationState.pipe(
                        Effect.mapError(publishStepFailure),
                        Effect.map(
                          (authorization) =>
                            ({
                              result: "success",
                              message: "Authorized exact publication set",
                              output: {
                                _tag: "PublishAuthorizationOutput",
                                packDivergenceFindings: authorization.packDivergenceFindings,
                                ...(authorization.preview === undefined
                                  ? {}
                                  : { preview: authorization.preview }),
                              },
                            }) satisfies JobStepResult<PublishPlanOutput>,
                        ),
                      ),
                    },
                  ],
                },
              ]
            : [];
        const plan: Plan<PublishPlanRequirements, PublishPlanOutput> = {
          _tag: "Plan",
          name: "Publish extensions",
          description: Option.some(
            `Publish ${uploadCandidates.length} extension${uploadCandidates.length === 1 ? "" : "s"} to registry "${registry.name}"; ${candidates.length - uploadCandidates.length} already published and integrity-verified`,
          ),
          ...(candidateSet.preconditions.length === 0
            ? {}
            : { preconditions: candidateSet.preconditions }),
          materialPaths: uploadCandidates.map((candidate) => candidate.extensionDir),
          executionCapabilities: { rollback: "non-rollbackable" },
          ...(candidateSet.riskConditions.length === 0
            ? {}
            : { riskConditions: candidateSet.riskConditions }),
          jobs: [
            ...authorizationJobs,
            ...buildPublishJobs(uploadCandidates, (candidate) =>
              candidateStep(authorizationState, candidate),
            ),
          ],
        };
        const preparedCandidate = yield* prepareExecutionCandidate(plan);
        return yield* resolveExecutionCandidate(preparedCandidate, execution, {
          beforeApply: () =>
            authorize.pipe(
              Effect.andThen(revalidatePublishSources),
              Effect.mapError(publishStepFailure),
            ),
        });
      }),
    ),
  ).pipe(
    Effect.map((resolution) => ({ interrupted: false as const, resolution })),
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.gen(function* () {
            const journalState = yield* getOperationJournal;
            const dispatched = yield* Ref.get(dispatchedUploads);
            const results = interruptedPublishResults(
              candidateSet.preflightResults,
              journalState,
              dispatched,
            );
            const recoverySelection = publishRecoverySelection(results);
            const signal =
              Option.match(yield* Effect.serviceOption(InterruptionSignalSource), {
                onNone: () => undefined,
                onSome: (source) => source.requestedSignal(),
              }) ?? "SIGINT";
            const outcome: PublishOutcome = {
              mode: "apply",
              selection: candidateSet.selection,
              publicationSet: candidateSet.publicationSetOutput,
              results,
              interruption: { signal },
              ...(recoverySelection.remainingItems.length === 0
                ? {}
                : {
                    recovery: {
                      description:
                        "Verify or re-publish the items the interruption left unsettled.",
                      remainingItems: recoverySelection.remainingItems,
                      blockedDependents: recoverySelection.blockedDependents,
                    },
                  }),
              suggestions: [],
              disposition: { _tag: "Interrupted", signal },
            };
            return { interrupted: true as const, outcome };
          })
        : Effect.failCause(cause),
    ),
    Effect.provideService(OperationJournal, journal),
    Effect.provideService(FootprintRecorder, footprint),
  );

  if (resolved.interrupted) return resolved.outcome;
  const resolution = resolved.resolution;

  // A pending human approval is not a publish outcome: nothing was uploaded,
  // and the invocation reports the handoff instead of a result document.
  const pending =
    resolution.failure === undefined ? undefined : pendingHumanCause(resolution.failure);
  if (pending !== undefined) return yield* Effect.fail(pending);

  const planBlocking = resolution.blocking;
  const planFailed = planBlocking !== undefined || resolution.failure !== undefined;
  const staleCandidate = planBlocking?.class === "stale-candidate";
  const sourceStateChanged =
    resolution.failure?.detail.startsWith("Publish source state changed after planning") === true;
  const planFailureCategory =
    resolution.failure?.category ??
    (planBlocking === undefined
      ? "internal"
      : planBlocking.class === "approval-required" || planBlocking.class === "override-required"
        ? "usage"
        : (planBlocking.causeCode ?? "conflict"));
  const planFailureReason = planBlocking?.class ?? "execution-failed";
  const applyExecuted =
    resolution.mode === "apply" &&
    resolution.declined !== true &&
    (!planFailed ||
      resolution.units.some((unit) => unit.state === "committed" || unit.state === "failed"));
  const executionOutputs = resolution.units.flatMap((unit) =>
    unit.output === undefined ? [] : [unit.output],
  );
  const authorizationOutput = executionOutputs.find(
    (output) => output._tag === "PublishAuthorizationOutput",
  );
  const publishedOutputs = new Map(
    executionOutputs.flatMap((output) =>
      output._tag === "PublishedCandidateOutput" ? [[output.targetKey, output] as const] : [],
    ),
  );
  const unresolvedFailures = yield* Ref.get(unresolvedSettlements);
  const unresolvedByTarget = yield* Ref.get(unresolvedReasons);
  const failedStepFailures = resolution.units.flatMap((unit) =>
    unit.state === "failed" && unit.error !== undefined
      ? [publishStepFailureCause(unit.error)]
      : [],
  );
  const baseResults = candidateSet.preflightResults;
  let results: ReadonlyArray<PublishResultItem>;
  if (applyExecuted) {
    const unitsById = new Map(resolution.units.map((unit) => [unit.id, unit] as const));
    results = baseResults.map((result) => {
      if (result.action !== "publish") return result;
      const fqn = formatFqn({ owner: result.owner, type: result.type, name: result.name });
      const candidate = candidates.find((item) => item.fqn === fqn);
      const unit = candidate === undefined ? undefined : unitsById.get(candidate.fqn);
      if (unit === undefined) return result;
      if (unit.state === "failed" || unit.state === "blocked") {
        if (unit.state === "blocked" && unit.blocking?.class === "dependency-failed") {
          const blockedBy = Object.keys(candidate?.dependencies ?? {}).filter((dependencyFqn) => {
            const dependencyUnit = unitsById.get(dependencyFqn);
            return (
              dependencyUnit !== undefined &&
              (dependencyUnit.state === "failed" || dependencyUnit.state === "blocked")
            );
          });
          return {
            ...result,
            action: "error",
            phase: "dependency_execution",
            reason: "blocked_by_dependency",
            status: "blocked",
            ...(unit.message === undefined ? {} : { message: unit.message }),
            blockedBy,
          };
        }
        const targetKey = candidate === undefined ? undefined : publishTargetKey(candidate);
        const unresolvedReason =
          targetKey === undefined ? undefined : unresolvedByTarget.get(targetKey);
        if (unresolvedReason !== undefined) {
          return {
            ...result,
            phase: "upload_execution",
            reason:
              unresolvedReason === "authorization_expired"
                ? "authorization_expired"
                : "settlement_unresolved",
            status: "unknown",
            settlement: "unresolved",
            message:
              "The Registry may have committed this version, but bounded readback and one exact replay could not prove the outcome.",
          };
        }
        const unitFailure =
          unit.error === undefined ? undefined : publishStepFailureCause(unit.error);
        const cause = unitFailure === undefined ? undefined : publishCause(unitFailure);
        return {
          id: result.id,
          owner: result.owner,
          type: result.type,
          name: result.name,
          ...(result.version === undefined ? {} : { version: result.version }),
          ...(result.sourceType === undefined ? {} : { sourceType: result.sourceType }),
          ...(result.authored === undefined ? {} : { authored: result.authored }),
          ...(result.archive === undefined ? {} : { archive: result.archive }),
          ...(result.sourceState === undefined ? {} : { sourceState: result.sourceState }),
          action: "error",
          phase: "upload_execution",
          reason:
            cause?.problemCode === "publish/precondition-changed"
              ? "publish_precondition_changed"
              : cause?.code === "conflict"
                ? "integrity_conflict"
                : "upload_failed",
          status: "failed",
          ...(unit.message === undefined ? {} : { message: unit.message }),
          ...(cause === undefined ? {} : { cause }),
        } satisfies PublishResultItem;
      }
      const publishedOutput =
        candidate === undefined ? undefined : publishedOutputs.get(publishTargetKey(candidate));
      const findings = [
        ...(result.findings ?? []),
        ...(candidate === undefined
          ? []
          : (authorizationOutput?.packDivergenceFindings.get(candidate.fqn) ?? [])),
        ...(publishedOutput?.warnings ?? []),
      ].sort(
        (left, right) =>
          Number(right.ruleId === "publish/required-pack-version-unreachable") -
            Number(left.ruleId === "publish/required-pack-version-unreachable") ||
          left.message.localeCompare(right.message),
      );
      return {
        ...result,
        phase: "upload_execution",
        status: "success",
        ...(unit.message === undefined ? {} : { message: unit.message }),
        ...(publishedOutput === undefined ? {} : { visibility: publishedOutput.visibility }),
        ...(publishedOutput === undefined ? {} : { settlement: publishedOutput.settlement }),
        ...(unit.links === undefined ? {} : { links: unit.links }),
        ...(findings.length === 0 ? {} : { findings }),
      };
    });
  } else {
    const unacceptedSourceIds = new Set(
      uploadCandidates.flatMap((candidate) =>
        candidate.sourceAssessment?.state?.status === "matches-head" ||
        candidate.sourceAssessment?.state === undefined
          ? []
          : [candidate.fqn],
      ),
    );
    results = baseResults.map((result) => {
      if (result.action !== "publish") return result;
      if (planBlocking?.class === "override-required" && unacceptedSourceIds.size > 0) {
        return unacceptedSourceIds.has(result.id)
          ? {
              ...result,
              status: "blocked",
              reason: "source_state_not_accepted",
              message:
                "The Registry archive is not fully represented by Git HEAD; pass --accept-warnings to publish it explicitly.",
            }
          : {
              ...result,
              status: "blocked",
              reason: "blocked_by_preflight",
              message:
                "Not attempted because another selected archive requires explicit acceptance",
              blockedBy: [...unacceptedSourceIds],
            };
      }
      if (staleCandidate || sourceStateChanged) {
        return {
          ...result,
          status: "blocked",
          reason: "stale_material",
          message: "Workspace material changed after planning; no upload was attempted.",
        };
      }
      return { ...result, status: "pending" };
    });
  }
  const recoverySelection = publishRecoverySelection(results);
  const authorizedPublicationPreview = authorizationOutput?.preview;
  const finalPublicationSetOutput =
    authorizedPublicationPreview === undefined
      ? candidateSet.publicationSetOutput
      : publicationSetResult({
          candidates,
          preview: authorizedPublicationPreview,
          ...(authorizedPublicationPreview.status === "blocked" && planFailed
            ? {
                blocked:
                  resolution.failure === undefined
                    ? new PublishFailed({
                        category: planFailureCategory,
                        detail: "The reviewed publication set was blocked before upload.",
                      })
                    : publishStepFailureCause(resolution.failure),
              }
            : {}),
        });
  // Live-to-settled handoff: observers collapse before the result document.
  yield* settleOperation(deriveOperationOutcome(resolution));
  yield* awaitDrained;

  const failed = results.filter((result) => result.status === "failed");
  const unconfirmed = unconfirmedPublishOutcomes(results, applyExecuted);
  const disposition: PublishDisposition =
    planFailed && !request.preview
      ? {
          _tag: "Failed",
          failure: new PublishFailed({
            category: planFailureCategory,
            detail: staleCandidate
              ? "Workspace material changed after authorization; no upload was attempted."
              : (resolution.failure?.detail ??
                planBlocking?.detail ??
                `Publish execution did not start: ${planFailureReason}.`),
            suggestions: resolution.suggestions ?? [],
          }),
        }
      : failed.length > 0
        ? {
            _tag: "Failed",
            failure: aggregatePublishFailure(failed.length, [
              ...unresolvedFailures.values(),
              ...failedStepFailures,
            ]),
          }
        : unconfirmed.length > 0
          ? {
              _tag: "Failed",
              failure: new PublishFailed({
                category: "issues",
                detail: `No publication was confirmed; ${unconfirmed.length} extension${
                  unconfirmed.length === 1 ? "" : "s"
                } left unsettled. Verify the target registry before re-publishing.`,
              }),
            }
          : { _tag: "Completed" };

  const outcome: PublishOutcome = {
    mode: request.preview ? "preview" : "apply",
    ...(candidateSet.preconditions.length === 0
      ? {}
      : { preconditions: candidateSet.preconditions }),
    ...(resolution.riskConditions === undefined
      ? {}
      : { riskConditions: resolution.riskConditions }),
    selection: candidateSet.selection,
    publicationSet: finalPublicationSetOutput,
    results,
    ...(applyExecuted && recoverySelection.remainingItems.length > 0
      ? {
          recovery: {
            description: "Continue the failed items and their blocked dependents",
            remainingItems: recoverySelection.remainingItems,
            blockedDependents: recoverySelection.blockedDependents,
          },
        }
      : {}),
    ...(planFailed && !request.preview
      ? {
          failure: publishCause(
            staleCandidate || resolution.failure === undefined
              ? new PublishFailed({
                  category: planFailureCategory,
                  detail: staleCandidate
                    ? "Workspace material changed after authorization; no upload was attempted."
                    : (planBlocking?.detail ??
                      `Publish execution did not start: ${planFailureReason}.`),
                })
              : publishStepFailureCause(resolution.failure),
          ),
        }
      : {}),
    suggestions: planFailed ? (resolution.suggestions ?? []) : [],
    disposition,
  };
  return outcome;
}, Effect.uninterruptible);

/** The application API for publishing workspace-authored extensions. */
export const PublishExtensions = { prepare, previewOrApply } as const;

export type { OperationJournal, PublishAuthorizationState, PublishPlanOutput };
