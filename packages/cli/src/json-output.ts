import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SourceTypeSchema } from "@agentxm/extension-management/unstable/sources";

import { CliRenderer, count } from "@agentxm/extension-management/unstable/cli-renderer";
import { Verbosity } from "@agentxm/extension-management/unstable/cli-flags";
import {
  SuggestedActionSchema,
  type SuggestedAction,
} from "@agentxm/registry-protocol/unstable/suggested-action";
import {
  type CommandOutcomeSummary,
  type SubjectType,
  getCommandSemanticProperties,
  setCommandSemanticProperties,
  summarizeCommandOutcome,
} from "@agentxm/extension-management/unstable/cli-runtime";
import { OperationPreconditionSchema } from "@agentxm/extension-management/unstable/plan";
import { AppErrorCodeSchema } from "@agentxm/extension-management/unstable/app-error";
import {
  PublishVisibilitySchema,
  type PublishVisibility,
} from "@agentxm/registry-protocol/unstable/publish";
import {
  ExtensionNameSchema,
  ExtensionTypeSchema,
  HandleSchema,
  formatFqn,
} from "@agentxm/extension-model/unstable/extensions";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";

const PublishActionSchema = Schema.Literals(["publish", "skip", "error"] as const).annotate({
  identifier: "PublishAction",
  title: "Publish Action",
  description: "Publish reconciliation decision for an extension version.",
});

const PublishModeSchema = Schema.Literals(["preview", "apply"] as const).annotate({
  identifier: "PublishMode",
  title: "Publish Mode",
  description: "Whether the publish command previewed or applied the reconciliation decisions.",
});

const PublishStatusSchema = Schema.Literals([
  "success",
  "failed",
  "pending",
  "blocked",
  "skipped",
  // The upload request was dispatched but no response was recorded: the
  // registry may have committed the version. Only evidenced states are
  // reported — recovery verifies before it re-runs.
  "unknown",
] as const).annotate({
  identifier: "PublishStatus",
  title: "Publish Status",
  description: "Execution status for an applied publish decision.",
});

const PublishReasonSchema = Schema.Literals([
  "selected",
  "excluded",
  "unmanaged",
  "unmatched_selector",
  "version_already_published",
  "not_authored",
  "not_publishable",
  "invalid_workspace_source",
  "authorization_failed",
  "authoritative_preflight_failed",
  "dependency_unavailable",
  "candidate_invalid",
  "stale_material",
  "publish_precondition_changed",
  "upload_failed",
  "integrity_conflict",
  "settlement_unresolved",
  "authorization_expired",
  "blocked_by_dependency",
  "interrupted",
  "version_exists",
  "integrity_drift",
  "verify_failed",
  "blocked_by_preflight",
] as const).annotate({
  identifier: "PublishReason",
  title: "Publish Reason",
  description: "Reason a publish item was skipped or errored.",
});

export const PublishAdvisoryFindingSchema = Schema.Struct({
  ruleId: Schema.String,
  severity: Schema.Literal("warning"),
  message: Schema.String,
  suggestions: Schema.Array(SuggestedActionSchema),
}).annotate({
  identifier: "PublishAdvisoryFinding",
  title: "Publish Advisory Finding",
  description: "A non-gating structured warning observed during publication.",
});
export type PublishAdvisoryFinding = typeof PublishAdvisoryFindingSchema.Type;

const PublishPhaseSchema = Schema.Literals([
  "selection",
  "authoritative_preflight",
  "authorization",
  "dependency_execution",
  "upload_execution",
] as const).annotate({
  identifier: "PublishPhase",
  title: "Publish Phase",
  description: "Publish lifecycle phase that produced an item outcome.",
});

const PublishCauseSchema = Schema.Struct({
  code: AppErrorCodeSchema,
  class: Schema.Literals(["internal", "user", "external"] as const),
  message: Schema.String,
  retryable: Schema.Boolean,
  attemptCount: Schema.optional(Schema.Number),
  maxAttempts: Schema.optional(Schema.Number),
  attemptsExhausted: Schema.optional(Schema.Boolean),
  retryStoppedBy: Schema.optional(
    Schema.Literals(["attempt-limit", "deadline", "replay-unsafe"] as const),
  ),
  requestId: Schema.optional(Schema.String),
  responseStatus: Schema.optional(Schema.Number),
  problemCode: Schema.optional(Schema.String),
}).annotate({
  identifier: "PublishCause",
  title: "Publish Cause",
  description: "Redacted typed cause for an operation that actually failed.",
});

const PublishResultItemSchema = Schema.Struct({
  id: Schema.String,
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  // Omitted when no version was resolved (skipped, not-publishable, or
  // preflight-failed items). Never fabricated.
  version: Schema.optional(VersionSchema),
  sourceType: Schema.optional(SourceTypeSchema),
  authored: Schema.optional(Schema.Boolean),
  action: PublishActionSchema,
  phase: PublishPhaseSchema,
  reason: PublishReasonSchema,
  status: PublishStatusSchema,
  message: Schema.optional(Schema.String),
  cause: Schema.optional(PublishCauseSchema),
  blockedBy: Schema.optional(Schema.Array(Schema.String)),
  findings: Schema.optional(Schema.Array(PublishAdvisoryFindingSchema)),
  archive: Schema.optional(
    Schema.Struct({
      included: Schema.Array(
        Schema.Struct({
          path: Schema.String,
          size: Schema.Number,
          matchedPatterns: Schema.Array(Schema.String),
        }),
      ),
      excluded: Schema.Array(
        Schema.Struct({
          path: Schema.String,
          size: Schema.Number,
          matchedPatterns: Schema.Array(Schema.String),
        }),
      ),
      patterns: Schema.Array(Schema.Struct({ pattern: Schema.String, matchCount: Schema.Number })),
      warnings: Schema.Array(Schema.String),
      includedCount: Schema.Number,
      excludedCount: Schema.Number,
      uncompressedBytes: Schema.Number,
      zipBytes: Schema.Number,
      integrity: Schema.String,
    }),
  ),
  visibility: Schema.optional(PublishVisibilitySchema),
  settlement: Schema.optional(
    Schema.Literals(["response", "readback", "replay", "unresolved"] as const),
  ),
  links: Schema.optional(
    Schema.Struct({
      html: Schema.String,
    }),
  ),
}).annotate({
  identifier: "PublishResultItem",
  title: "Publish Result Item",
  description: "Structured result for one publish reconciliation item.",
});

const PublishSelectionDecisionSchema = Schema.Struct({
  id: Schema.String,
  selector: Schema.optional(Schema.String),
  target: Schema.optional(
    Schema.Struct({
      owner: HandleSchema,
      type: ExtensionTypeSchema,
      name: ExtensionNameSchema,
    }),
  ),
  origin: Schema.Literals(["explicit-selector", "bulk-selection", "dependency-expansion"]),
  disposition: Schema.Literals([
    "included",
    "excluded",
    "unmanaged",
    "not-authored",
    "not-publishable",
    "unmatched",
  ]),
  reason: PublishReasonSchema,
  referencedBy: Schema.Array(Schema.String),
});

const PublishSelectionSchema = Schema.Struct({
  mode: Schema.Literals(["authored", "explicit"] as const),
  scope: Schema.Literals(["project", "user"] as const),
  owners: Schema.Array(HandleSchema),
  types: Schema.Array(ExtensionTypeSchema),
  registry: Schema.String,
  dependencyInclusion: Schema.Literal("explicit"),
  decisions: Schema.Array(PublishSelectionDecisionSchema),
  counts: Schema.Struct({
    considered: Schema.Number,
    included: Schema.Number,
    excluded: Schema.Number,
    unmanaged: Schema.Number,
    unmatched: Schema.Number,
  }),
});

const PublishSetFindingSchema = Schema.Struct({
  id: Schema.String,
  severity: Schema.Literals(["error", "warning"] as const),
  reason: Schema.String,
  message: Schema.String,
  targetId: Schema.optional(Schema.String),
  suggestions: Schema.Array(SuggestedActionSchema),
});

const PublishSetItemSchema = Schema.Struct({
  id: Schema.String,
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  version: VersionSchema,
  participation: Schema.Literals(["publish", "verified-existing"] as const),
  dependencyIds: Schema.Array(Schema.String),
  dependencyResolutions: Schema.Array(
    Schema.Struct({
      dependencyId: Schema.String,
      range: Schema.String,
      effectiveVersion: VersionSchema,
    }),
  ),
  selectionOrder: Schema.Number,
  dependencyOrder: Schema.Number,
  visibility: Schema.optional(PublishVisibilitySchema),
});

const PublishPublicationSetSchema = Schema.Struct({
  status: Schema.Literals(["admitted", "blocked", "unavailable"] as const),
  items: Schema.Array(PublishSetItemSchema),
  findings: Schema.Array(PublishSetFindingSchema),
});

const PublishExecutionSchema = Schema.Struct({
  status: Schema.Literals(["not-run", "completed", "partial", "failed"] as const),
  preconditions: Schema.optional(Schema.Array(OperationPreconditionSchema)),
  outcomes: Schema.Array(PublishResultItemSchema),
  failure: Schema.optional(PublishCauseSchema),
});

const PublishRecoverySchema = Schema.Struct({
  description: Schema.String,
  cmd: Schema.String,
  remainingItems: Schema.Array(Schema.String),
  blockedDependents: Schema.Array(Schema.String),
});

export const PublishResultSchema = Schema.Struct({
  contract: Schema.Literal("publish-result-v3"),
  mode: PublishModeSchema,
  selection: PublishSelectionSchema,
  publicationSet: PublishPublicationSetSchema,
  execution: PublishExecutionSchema,
  recovery: Schema.optional(PublishRecoverySchema),
  /** Present when an external termination request stopped the invocation. */
  interruption: Schema.optional(
    Schema.Struct({ signal: Schema.Literals(["SIGINT", "SIGTERM"] as const) }),
  ),
  counts: Schema.Struct({
    selected: Schema.Number,
    published: Schema.Number,
    alreadyPublished: Schema.Number,
    skipped: Schema.Number,
    blocked: Schema.Number,
    failed: Schema.Number,
    pending: Schema.Number,
    unknown: Schema.Number,
  }),
}).annotate({
  identifier: "PublishResult",
  title: "Publish Result",
  description: "Structured publish reconciliation result.",
});
export type PublishResult = typeof PublishResultSchema.Type;
export type PublishResultItem = typeof PublishResultItemSchema.Type;
export type PublishSelectionDecision = typeof PublishSelectionDecisionSchema.Type;
export type PublishPublicationSet = typeof PublishPublicationSetSchema.Type;

interface PublishResultInput {
  readonly mode: PublishResult["mode"];
  readonly preconditions?: ReadonlyArray<Schema.Schema.Type<typeof OperationPreconditionSchema>>;
  readonly selection?: Omit<PublishResult["selection"], "counts" | "dependencyInclusion"> & {
    readonly counts?: PublishResult["selection"]["counts"];
    readonly dependencyInclusion?: "explicit";
  };
  readonly publicationSet?: PublishPublicationSet;
  readonly results: ReadonlyArray<PublishResultItem>;
  readonly failure?: PublishResult["execution"]["failure"];
  readonly recovery?: PublishResult["recovery"];
  readonly interruption?: PublishResult["interruption"];
}

export const classifyPublishResults = (
  results: ReadonlyArray<PublishResultItem>,
): PublishResult["counts"] => {
  const published = results.filter(
    (item) => item.action === "publish" && item.status === "success",
  ).length;
  const alreadyPublished = results.filter(
    (item) =>
      item.action === "skip" &&
      item.status === "success" &&
      item.reason === "version_already_published",
  ).length;
  const blocked = results.filter((item) => item.status === "blocked").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const pending = results.filter((item) => item.status === "pending").length;
  const unknown = results.filter((item) => item.status === "unknown").length;
  const skipped =
    results.length - published - alreadyPublished - blocked - failed - pending - unknown;
  return {
    selected: results.length,
    published,
    alreadyPublished,
    skipped,
    blocked,
    failed,
    pending,
    unknown,
  };
};

const selectionCounts = (
  decisions: PublishResult["selection"]["decisions"],
): PublishResult["selection"]["counts"] => ({
  considered: decisions.length,
  included: decisions.filter((decision) => decision.disposition === "included").length,
  excluded: decisions.filter((decision) => decision.disposition === "excluded").length,
  unmanaged: decisions.filter((decision) => decision.disposition === "unmanaged").length,
  unmatched: decisions.filter((decision) => decision.disposition === "unmatched").length,
});

const executionStatus = (
  mode: PublishResult["mode"],
  results: ReadonlyArray<PublishResultItem>,
  failure: PublishResult["execution"]["failure"] | undefined,
): PublishResult["execution"]["status"] => {
  if (mode === "preview") return "not-run";
  const failed = results.some((item) => item.status === "failed");
  const blocked = results.some((item) => item.status === "blocked");
  const succeeded = results.some((item) => item.status === "success");
  const unknown = results.some((item) => item.status === "unknown");
  if (failure !== undefined || ((failed || blocked) && !succeeded && !unknown)) return "failed";
  // An indeterminate outcome is never definitive failure: the registry may
  // have committed the version before its response was recorded.
  if (failed || blocked || unknown) return "partial";
  return "completed";
};

const normalizePublishResult = (result: PublishResultInput): PublishResult => {
  const decisions = result.selection?.decisions ?? [];
  const counts = classifyPublishResults(result.results);
  return {
    contract: "publish-result-v3",
    mode: result.mode,
    selection: {
      mode: result.selection?.mode ?? "explicit",
      scope: result.selection?.scope ?? "project",
      owners: result.selection?.owners ?? [],
      types: result.selection?.types ?? [],
      registry: result.selection?.registry ?? "unknown",
      dependencyInclusion: "explicit",
      decisions,
      counts: result.selection?.counts ?? selectionCounts(decisions),
    },
    publicationSet: result.publicationSet ?? {
      status: result.failure === undefined ? "unavailable" : "blocked",
      items: [],
      findings: [],
    },
    execution: {
      status: executionStatus(result.mode, result.results, result.failure),
      ...(result.preconditions === undefined ? {} : { preconditions: result.preconditions }),
      outcomes: result.results,
      ...(result.failure === undefined ? {} : { failure: result.failure }),
    },
    counts,
    ...(result.recovery === undefined ? {} : { recovery: result.recovery }),
    ...(result.interruption === undefined ? {} : { interruption: result.interruption }),
  };
};

const publishIdentity = (item: PublishResultItem): string => {
  const fqn = formatFqn({ owner: item.owner, type: item.type, name: item.name });
  return item.version === undefined ? fqn : `${fqn}@${item.version}`;
};

const publishBrowserSuggestions = (result: PublishResult): ReadonlyArray<SuggestedAction> =>
  result.execution.outcomes.flatMap((item) =>
    item.links === undefined ? [] : [{ description: "View in browser", url: item.links.html }],
  );

const publishVisibilityLine = (visibility: PublishVisibility): string =>
  `visibility: ${visibility.value} (${visibility.disposition}, ${visibility.source})`;

const publishItemLine = (item: PublishResultItem): string => {
  const identity = publishIdentity(item);
  const withVisibility =
    item.visibility === undefined
      ? identity
      : `${identity} — ${publishVisibilityLine(item.visibility)}`;
  return item.links === undefined ? withVisibility : `${withVisibility}\n${item.links.html}`;
};

const publishOutcomeLine = (item: PublishResultItem): string =>
  `${publishItemLine(item)} — ${item.status ?? "unknown"}/${item.phase}${
    item.reason === undefined ? "" : `/${item.reason}`
  }${
    item.cause?.retryable === true
      ? ` (retryable; attempts exhausted${
          item.cause.attemptCount === undefined || item.cause.maxAttempts === undefined
            ? ""
            : `: ${item.cause.attemptCount}/${item.cause.maxAttempts}`
        })`
      : item.cause === undefined
        ? ""
        : " (terminal)"
  }${item.message === undefined ? "" : `: ${item.message}`}`;

const renderHumanPublishResult = (
  renderer: typeof CliRenderer.Service,
  result: PublishResult,
  options: {
    readonly suggestions: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const verbosity = yield* Verbosity;
    if (verbosity.level === "quiet") return;

    for (const precondition of result.execution.preconditions ?? []) {
      if (precondition.status === "unmet") {
        yield* renderer.warn(
          `${precondition.label}: ${precondition.detail ?? "Required before apply"}`,
        );
      }
    }

    const omittedDecisions = result.selection.decisions.filter(
      (decision) => decision.disposition !== "included",
    );
    if (omittedDecisions.length > 0) {
      yield* renderer.info(
        `Selection decisions (${result.selection.counts.included} included; ${omittedDecisions.length} not included)\n${omittedDecisions
          .map(
            (decision) =>
              `${decision.id} — ${decision.disposition}/${decision.reason}${
                decision.referencedBy.length === 0
                  ? ""
                  : `; referenced by ${decision.referencedBy.join(", ")}`
              }`,
          )
          .join("\n")}`,
      );
    }
    if (result.publicationSet.items.length > 0) {
      yield* renderer.info(
        `Authoritative publication set (${result.publicationSet.status})\n${result.publicationSet.items
          .map(
            (item) =>
              `${item.id}@${item.version} — ${item.participation}; dependency order ${item.dependencyOrder}`,
          )
          .join("\n")}`,
      );
    }

    for (const finding of result.execution.outcomes.flatMap((item) => item.findings ?? [])) {
      yield* renderer.warn(
        finding.ruleId === "publish/required-pack-version-unreachable"
          ? `Required pack compatibility review: ${finding.message}`
          : finding.message,
      );
    }
    for (const item of result.execution.outcomes) {
      if (item.archive === undefined) continue;
      yield* renderer.info(
        `Archive ${publishIdentity(item)} — ${item.archive.includedCount} included, ${item.archive.excludedCount} excluded, ${item.archive.uncompressedBytes} source bytes, ${item.archive.zipBytes} ZIP bytes`,
      );
      for (const warning of item.archive.warnings) yield* renderer.warn(warning);
      if (verbosity.level === "verbose") {
        const inventory = [
          ...item.archive.included.map((file) => `include ${file.path} (${file.size} bytes)`),
          ...item.archive.excluded.map(
            (file) =>
              `exclude ${file.path} (${file.size} bytes) — ${file.matchedPatterns.join(", ")}`,
          ),
        ];
        if (inventory.length > 0) yield* renderer.info(inventory.join("\n"));
      }
    }
    for (const finding of result.publicationSet.findings) {
      if (finding.severity === "error") yield* renderer.error(finding.message);
      else yield* renderer.warn(finding.message);
    }

    const published = result.execution.outcomes.filter(
      (item) => item.action === "publish" && item.status === "success",
    );
    const publishable = result.execution.outcomes.filter((item) => item.action === "publish");
    const verifiedExisting = result.execution.outcomes.filter(
      (item) => item.action === "skip" && item.reason === "version_already_published",
    );
    const skipped = result.execution.outcomes.filter(
      (item) => item.action === "skip" && item.reason !== "version_already_published",
    );
    const blocked = result.execution.outcomes.filter((item) => item.status === "blocked");
    const failed = result.execution.outcomes.filter((item) => item.status === "failed");
    const suggestions =
      options.suggestions.length === 0
        ? undefined
        : {
            suggestions: options.suggestions,
            ...(options.withoutSuggestions === undefined
              ? {}
              : { withoutSuggestions: options.withoutSuggestions }),
          };

    if (result.execution.outcomes.length === 0) {
      yield* renderer.success("No extensions selected for publishing", suggestions);
      return;
    }

    if (result.execution.failure !== undefined) {
      yield* renderer.error(`Publish failed: ${result.execution.failure.message}`, suggestions);
      if (blocked.length > 0) {
        yield* renderer.warn(
          `${count(blocked.length, "extension")} not attempted\n${blocked
            .map(publishOutcomeLine)
            .join("\n")}`,
        );
      }
      return;
    }

    if (result.mode === "preview") {
      const previewItems = publishable.filter(
        (item) => item.status !== "failed" && item.status !== "blocked",
      );
      if (previewItems.length > 0) {
        const [previewItem] = previewItems;
        const headline =
          previewItem !== undefined && previewItems.length === 1
            ? `Would publish ${publishItemLine(previewItem)}`
            : `Would publish ${count(previewItems.length, "extension")}`;
        const summary =
          previewItems.length <= 1
            ? undefined
            : previewItems.map((item) => publishItemLine(item)).join("\n");
        const previewOptions = {
          ...(summary === undefined ? {} : { summary }),
          ...(suggestions ?? {}),
        };
        yield* renderer.success(headline, previewOptions);
      } else if (verifiedExisting.length > 0 && failed.length === 0 && blocked.length === 0) {
        yield* renderer.success(
          `All ${verifiedExisting.length} selected versions are already published and integrity-verified`,
          {
            summary: verifiedExisting.map((item) => publishItemLine(item)).join("\n"),
            ...(suggestions ?? {}),
          },
        );
      }
      if (
        verifiedExisting.length > 0 &&
        (previewItems.length > 0 || failed.length > 0 || blocked.length > 0)
      ) {
        yield* renderer.info(
          `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
            .map((item) => publishItemLine(item))
            .join("\n")}`,
        );
      }
      if (failed.length > 0) {
        yield* renderer.error(`${count(failed.length, "extension")} failed preflight`);
      }
      if (blocked.length > 0) {
        yield* renderer.warn(`${count(blocked.length, "extension")} not attempted`);
      }
      return;
    }

    if (published.length > 0 && failed.length === 0) {
      const [publishedItem] = published;
      const headline =
        publishedItem !== undefined && published.length === 1
          ? `Published ${publishItemLine(publishedItem)}`
          : `Published ${count(published.length, "extension")}`;
      const summary =
        published.length <= 1
          ? undefined
          : published.map((item) => publishItemLine(item)).join("\n");
      yield* renderer.success(headline, {
        ...(summary === undefined ? {} : { summary }),
        ...(suggestions ?? {}),
      });
      if (verifiedExisting.length > 0) {
        yield* renderer.info(
          `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
            .map((item) => publishItemLine(item))
            .join("\n")}`,
        );
      }
      return;
    }

    if (published.length > 0) {
      const headline = `Published ${count(published.length, "extension")}; ${count(failed.length, "extension")} failed; ${count(blocked.length, "extension")} not attempted`;
      yield* renderer.error(headline, suggestions);
      yield* renderer.info(
        [
          ...published.map((item) => publishItemLine(item)),
          ...failed.map(publishOutcomeLine),
          ...blocked.map(publishOutcomeLine),
        ].join("\n"),
      );
      if (verifiedExisting.length > 0) {
        yield* renderer.info(
          `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
            .map((item) => publishItemLine(item))
            .join("\n")}`,
        );
      }
      return;
    }

    if (failed.length > 0) {
      const [failedItem] = failed;
      const failureLabel = failed.some((item) => item.phase === "upload_execution")
        ? "Publish failed"
        : "Publish preflight failed";
      const headline =
        failedItem !== undefined && failed.length === 1
          ? `${failureLabel} for ${publishIdentity(failedItem)}`
          : `${failureLabel} for ${count(failed.length, "extension")}`;
      yield* renderer.error(headline, suggestions);
      yield* renderer.info(failed.map(publishOutcomeLine).join("\n"));
      if (verifiedExisting.length > 0) {
        yield* renderer.info(
          `${count(verifiedExisting.length, "version")} already published and integrity-verified\n${verifiedExisting
            .map((item) => publishItemLine(item))
            .join("\n")}`,
        );
      }
      if (blocked.length > 0) {
        yield* renderer.warn(
          `${count(blocked.length, "extension")} ready but not attempted\n${blocked
            .map(publishOutcomeLine)
            .join("\n")}`,
        );
      }
      return;
    }

    const [verifiedItem] = verifiedExisting;
    const headline =
      verifiedItem !== undefined && verifiedExisting.length === 1 && skipped.length === 0
        ? `Already published and integrity-verified — ${publishItemLine(verifiedItem)}`
        : verifiedExisting.length > 0
          ? `All ${verifiedExisting.length} selected versions are already published and integrity-verified`
          : `No extensions published — ${count(skipped.length, "extension")} skipped`;
    yield* renderer.success(headline, {
      ...(verifiedExisting.length > 1
        ? { summary: verifiedExisting.map((item) => publishItemLine(item)).join("\n") }
        : {}),
      ...(suggestions ?? {}),
    });
  });
export const emitPublishResult = <TCommand extends string>(
  command: TCommand,
  input: PublishResultInput,
  options?: {
    readonly summary?: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const result = normalizePublishResult(input);
    const renderer = yield* CliRenderer;
    const browserSuggestions = publishBrowserSuggestions(result);
    const findingSuggestions = result.execution.outcomes.flatMap((item) =>
      (item.findings ?? []).flatMap((finding) => finding.suggestions),
    );
    const suggestions = [
      ...(options?.suggestions ?? []),
      ...(result.recovery === undefined ? [] : [result.recovery]),
      ...result.publicationSet.findings.flatMap((finding) => finding.suggestions),
      ...findingSuggestions,
      ...browserSuggestions,
    ];
    const summary = publishResultToSummary(result);
    const renderOptions = {
      ...(options?.summary === undefined ? {} : { summary: options.summary }),
      ...(suggestions.length === 0 ? {} : { suggestions }),
      ...(options?.withoutSuggestions === undefined
        ? {}
        : { withoutSuggestions: options.withoutSuggestions }),
      ok:
        result.execution.status !== "failed" &&
        result.execution.status !== "partial" &&
        result.execution.failure === undefined &&
        summary.failedCount === 0,
    };
    const existingSemanticProperties = yield* getCommandSemanticProperties;
    yield* setCommandSemanticProperties({
      ...existingSemanticProperties,
      ...summarizeCommandOutcome(summary),
    });
    const emitted = yield* renderer.result(result, PublishResultSchema, renderOptions);
    if (!emitted) {
      yield* renderHumanPublishResult(renderer, result, {
        suggestions,
        ...(options?.withoutSuggestions === undefined
          ? {}
          : { withoutSuggestions: options.withoutSuggestions }),
      });
    }
    return emitted;
  });

/**
 * Convert a PublishResult to a CommandOutcomeSummary for telemetry.
 *
 * Outcome follows the same convention as executed plans: a run that touched
 * nothing is `no-op`, and any applied or failed work is `applied` even when
 * every item failed, so partial failures stay in one bucket.
 */
export const publishResultToSummary = (result: PublishResult): CommandOutcomeSummary => {
  const appliedCount = result.counts.published;
  const failedCount = result.counts.failed + (result.execution.failure === undefined ? 0 : 1);
  const blockedCount = result.counts.blocked;
  const types = new Set(result.execution.outcomes.map((item) => item.type));
  const [onlyType] = [...types];
  const subjectType: SubjectType =
    onlyType === undefined ? "unknown" : types.size === 1 ? onlyType : "mixed";
  return {
    outcome:
      result.interruption !== undefined
        ? "interrupted"
        : result.mode === "preview"
          ? "previewed"
          : appliedCount > 0 && (failedCount > 0 || blockedCount > 0)
            ? "partial"
            : failedCount > 0
              ? "failed"
              : blockedCount > 0
                ? "blocked"
                : appliedCount === 0
                  ? "no-op"
                  : "applied",
    subjectType,
    sourceKind: "workspace",
    appliedCount,
    failedCount,
    blockedCount,
  };
};
