/**
 * How one selected extension's state is reported at each publish phase, and
 * the two settlement rules that keep an interrupted or unconfirmed run from
 * reading as a publication.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";

import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import { redactRegistryText } from "@agentxm/registry-client";
import {
  PublishAuthorizationPending,
  StepUpVerificationPending,
  type AuthError,
} from "@agentxm/registry-auth";
import { StepFailure, unitIdOf, type OperationJournalState } from "@agentxm/workspace-operations";
import type { PreviewPublicationSetResponse } from "@agentxm/registry-protocol/unstable/registry";

import { PublishFailed } from "../errors.js";
import {
  isPublishFailure,
  publishCause,
  publishFailureCategory,
  publishFailureDetail,
  publishFailureProblemCode,
  publishFailureSuggestions,
  type PublishFailure,
} from "../failure.js";
import type { PublishCandidate, PublishPreparationFailure, SelectedEntry } from "./model.js";
import { publishItemId } from "./publication.js";
import type { PublishPublicationSet, PublishResultItem } from "./result.js";

/**
 * Publish steps settle with the typed publish failure as the step failure's
 * cause; the reader below recovers it so publish causes keep their
 * request and response evidence verbatim.
 */
export const publishStepFailure = (failure: PublishFailure | AuthError): StepFailure => {
  if (!isPublishFailure(failure)) {
    return new StepFailure({
      category: "auth",
      detail: "Publication authorization did not complete.",
      cause: failure,
    });
  }
  const suggestions = publishFailureSuggestions(failure);
  return new StepFailure({
    category: publishFailureCategory(failure),
    detail: publishFailureDetail(failure),
    ...(suggestions.length === 0 ? {} : { suggestions }),
    cause: failure,
  });
};

/**
 * The pending human handoff a settled step carried, if any. Publication did
 * not start, so the invocation reports the handoff instead of a result.
 */
export const pendingHumanCause = (
  failure: StepFailure,
): PublishAuthorizationPending | StepUpVerificationPending | undefined =>
  failure.cause instanceof PublishAuthorizationPending ||
  failure.cause instanceof StepUpVerificationPending
    ? failure.cause
    : undefined;

/** The typed failure a settled step carried, or a generic one it did not. */
export const publishStepFailureCause = (failure: StepFailure): PublishFailure =>
  isPublishFailure(failure.cause)
    ? failure.cause
    : new PublishFailed({
        category: failure.category,
        detail: failure.detail,
        ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
        ...(failure.cause === undefined ? {} : { cause: failure.cause }),
      });

export const preparationFailureOf = (
  failure: PublishFailure | PublishPreparationFailure,
): PublishFailure =>
  "_tag" in failure && failure._tag === "PublishPreparationFailure" ? failure.failure : failure;

/**
 * Per-item evidenced states for an externally interrupted publish apply. The
 * journal's settlement facts and the dispatch evidence separate four cases:
 * a recorded response (success or failure stands), a dispatched upload with
 * no recorded response (the registry may have committed — indeterminate),
 * and work the interruption prevented (pending; nothing left the process).
 */
export const interruptedPublishResults = (
  base: ReadonlyArray<PublishResultItem>,
  journal: Option.Option<OperationJournalState>,
  dispatched: ReadonlySet<string>,
): ReadonlyArray<PublishResultItem> => {
  const resolvedByUnit = new Map(
    Option.match(journal, {
      onNone: () => [],
      onSome: (state) => state.resolved.map((step) => [unitIdOf(step), step] as const),
    }),
  );
  const started = new Set(
    Option.match(journal, { onNone: () => [], onSome: (state) => state.startedUnitIds }),
  );
  return base.map((result): PublishResultItem => {
    if (result.action !== "publish") return result;
    const fqn = formatFqn({ owner: result.owner, type: result.type, name: result.name });
    const step = resolvedByUnit.get(fqn);
    if (step !== undefined && step.result.result === "success") {
      return {
        ...result,
        phase: "upload_execution",
        status: "success",
        ...(step.result.message.length === 0 ? {} : { message: step.result.message }),
        ...(step.result.links === undefined ? {} : { links: step.result.links }),
      };
    }
    if (step !== undefined && step.result.result === "error") {
      const failure = publishStepFailureCause(step.result.error);
      return {
        ...result,
        action: "error",
        phase: "upload_execution",
        reason:
          publishFailureProblemCode(failure) === "publish/precondition-changed"
            ? "publish_precondition_changed"
            : "upload_failed",
        status: "failed",
        ...(step.result.message.length === 0 ? {} : { message: step.result.message }),
        cause: publishCause(failure),
      };
    }
    if (started.has(fqn) && dispatched.has(fqn)) {
      return {
        ...result,
        phase: "upload_execution",
        status: "unknown",
        reason: "interrupted",
        message:
          "The upload was dispatched but no response was recorded; the registry may have committed this version. Re-run publish to verify.",
      };
    }
    return {
      ...result,
      phase: "upload_execution",
      status: "pending",
      reason: "interrupted",
      message: "Interrupted before the upload was dispatched.",
    };
  });
};

/**
 * The outcomes of an executed apply that confirmed no publication and still
 * has work outstanding: an unproven settlement (`unknown`) or an item that
 * never left the process (`pending`). Empty when the apply did not execute
 * (preview, declined confirmation) or when at least one publication settled.
 * An interrupted run resolves before this decision and keeps its own exit.
 */
export const unconfirmedPublishOutcomes = (
  results: ReadonlyArray<PublishResultItem>,
  applyExecuted: boolean,
): ReadonlyArray<PublishResultItem> => {
  const confirmed = results.some(
    (result) => result.action === "publish" && result.status === "success",
  );
  return !applyExecuted || confirmed
    ? []
    : results.filter((result) => result.status === "unknown" || result.status === "pending");
};

export const selectedResult = (
  entry: SelectedEntry,
  candidate: PublishCandidate | undefined,
): PublishResultItem => {
  if (candidate === undefined) {
    const reason = entry.skipReason ?? "not_publishable";
    return {
      id: entry.fqn,
      owner: entry.owner,
      type: entry.type,
      name: decodeExtensionNameSync(entry.name),
      sourceType: entry.sourceType,
      authored: entry.authored,
      action: "skip",
      phase: "selection",
      reason,
      status: "skipped",
      message:
        reason === "not_authored"
          ? "External dependency remains a Registry reference and is not an upload candidate"
          : "Dependency is not a managed publish candidate",
    };
  }
  if (candidate.action === "skip") {
    return {
      id: candidate.fqn,
      owner: candidate.owner,
      type: candidate.type,
      name: candidate.name,
      version: candidate.version,
      sourceType: candidate.sourceType,
      authored: candidate.authored,
      action: "skip",
      phase: "authoritative_preflight",
      reason: "version_already_published",
      status: "success",
      archive: {
        ...candidate.archivePlan,
        zipBytes: candidate.archive.length,
        integrity: candidate.integrity,
      },
      ...(candidate.sourceAssessment?.state === undefined
        ? {}
        : { sourceState: candidate.sourceAssessment.state }),
      ...(candidate.publishPreview === undefined
        ? {}
        : { visibility: candidate.publishPreview.visibility }),
    };
  }
  return {
    id: candidate.fqn,
    owner: candidate.owner,
    type: candidate.type,
    name: candidate.name,
    version: candidate.version,
    sourceType: candidate.sourceType,
    authored: candidate.authored,
    action: "publish",
    phase: "authoritative_preflight",
    reason: "selected",
    status: "pending",
    archive: {
      ...candidate.archivePlan,
      zipBytes: candidate.archive.length,
      integrity: candidate.integrity,
    },
    ...(candidate.sourceAssessment?.state === undefined
      ? {}
      : { sourceState: candidate.sourceAssessment.state }),
    ...(candidate.publishPreview === undefined
      ? {}
      : { visibility: candidate.publishPreview.visibility }),
  };
};

export const failedSelectedResult = (
  entry: SelectedEntry,
  failure: PublishFailure | PublishPreparationFailure,
): PublishResultItem => {
  const typed = preparationFailureOf(failure);
  const reason =
    "_tag" in failure && failure._tag === "PublishPreparationFailure"
      ? failure.reason
      : "candidate_invalid";
  return {
    id: entry.fqn,
    owner: entry.owner,
    type: entry.type,
    name: decodeExtensionNameSync(entry.name),
    sourceType: entry.sourceType,
    authored: entry.authored,
    action: "error",
    phase: "selection",
    status: "failed",
    reason,
    message: redactRegistryText(publishCause(typed).message),
    cause: publishCause(typed),
  };
};

export const failedCandidateResult = (
  candidate: PublishCandidate,
  failure: PublishFailure,
): PublishResultItem => ({
  id: candidate.fqn,
  owner: candidate.owner,
  type: candidate.type,
  name: candidate.name,
  version: candidate.version,
  sourceType: candidate.sourceType,
  authored: candidate.authored,
  action: "error",
  phase: "authoritative_preflight",
  reason: "candidate_invalid",
  status: "failed",
  message: publishCause(failure).message,
  cause: publishCause(failure),
  archive: {
    ...candidate.archivePlan,
    zipBytes: candidate.archive.length,
    integrity: candidate.integrity,
  },
  ...(candidate.sourceAssessment?.state === undefined
    ? {}
    : { sourceState: candidate.sourceAssessment.state }),
});

export const publicationSetResult = (options: {
  readonly candidates: ReadonlyArray<PublishCandidate>;
  readonly preview?: PreviewPublicationSetResponse;
  readonly blocked?: PublishFailure;
}): PublishPublicationSet => {
  const packResultsById = new Map(
    (options.preview?.packs ?? []).map((pack) => [publishItemId(pack.target), pack]),
  );
  const candidateOrder = new Map(
    options.candidates.map((candidate, index) => [candidate.fqn, index]),
  );
  const findings = (options.preview?.packs ?? []).flatMap((pack) => {
    const targetId = publishItemId(pack.target);
    return pack.findings.map((finding) => ({
      id: `${targetId}:${finding.ruleId}:${publishItemId(finding.dependency)}`,
      severity: finding.severity,
      reason: finding.reason,
      message: finding.message,
      targetId,
      suggestions: finding.suggestions,
    }));
  });
  return {
    status:
      options.blocked !== undefined
        ? "blocked"
        : options.preview === undefined
          ? "unavailable"
          : options.preview.status,
    items: options.candidates.map((candidate, selectionOrder) => {
      const pack = packResultsById.get(candidate.fqn);
      const dependencyIds = Object.keys(candidate.dependencies ?? {});
      return {
        id: candidate.fqn,
        owner: candidate.owner,
        type: candidate.type,
        name: candidate.name,
        version: candidate.version,
        participation: candidate.action === "publish" ? "publish" : "verified-existing",
        dependencyIds,
        dependencyResolutions: (pack?.resolutions ?? []).map((resolution) => ({
          dependencyId: publishItemId(resolution.dependency),
          range: resolution.dependency.range,
          effectiveVersion: resolution.effectiveVersion,
        })),
        selectionOrder,
        dependencyOrder:
          dependencyIds.length === 0
            ? 0
            : 1 +
              Math.max(
                ...dependencyIds.map((dependencyId) => candidateOrder.get(dependencyId) ?? -1),
              ),
        ...(candidate.publishPreview === undefined
          ? {}
          : { visibility: candidate.publishPreview.visibility }),
      };
    }),
    findings:
      findings.length > 0 || options.blocked === undefined
        ? findings
        : [
            {
              id: "authoritative-publication-set",
              severity: "error",
              reason: "authoritative_preflight_failed",
              message: publishCause(options.blocked).message,
              suggestions: options.blocked.suggestions ?? [],
            },
          ],
  };
};
