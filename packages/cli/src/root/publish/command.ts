// @effect-diagnostics anyUnknownInErrorContext:off — publication lint translates opaque extension accessor failures into AppError
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as ServiceMap from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { Argument, Command, Flag } from "effect/unstable/cli";
import * as os from "node:os";
import * as semver from "semver";

import {
  AppError,
  errorClassForAppErrorCode,
  exitCodeFor,
  makeAppError,
  redactSensitiveText,
  type AppErrorCode,
} from "@agentxm/extension-management/unstable/app-error";
import {
  AuthClient,
  AuthLoginPresenter,
  DeviceLoginInteraction,
  resolveRequestToken,
  runPublishAuthorization,
  type PublishCapabilityResponse,
} from "@agentxm/extension-management/unstable/auth";
import { RegistryUrl } from "@agentxm/extension-management/unstable/registry";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import {
  effectCliExit,
  recordCommandCompletion,
  requestedInterruptionSignal,
  withArgvTracking,
} from "@agentxm/extension-management/unstable/cli-runtime";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
  renderConfirmationRecoveryCommand,
} from "@agentxm/extension-management/unstable/plan";
import {
  ExtensionDependencyConstraintMapSchema,
  ExtensionMetadataSchema,
  ExtensionNameSchema,
  ExtensionTypeSchema,
  HandleSchema,
  PublishOptionsSchema,
  extensionTypes,
  extensionTypeToPlural,
  decodeExtensionNameSync,
  formatFqn,
  parseFqn,
  parseSourceQualifiedRegistrySourcePatternParts,
  type ExtensionName,
  type ExtensionType,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import {
  fqnInvalidErrorToAppError,
  stepFailureToAppError,
} from "@agentxm/extension-management/unstable/app-error/conversions";
import type {
  Job,
  JobStepResult,
  OperationPrecondition,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  OperationJournal,
  StepFailure,
  getOperationJournal,
  makeOperationJournal,
  previewOrApplyPlan,
  unitIdOf,
  type OperationJournalState,
} from "@agentxm/extension-management/unstable/plan";
import {
  extensionConstraintFactText,
  makeProspectiveExtensionConstraintFacts,
  type ExtensionConstraintInvariantFact,
} from "@agentxm/extension-management/unstable/projection";
import { makeConfirmationRecovery, makePlanExecution } from "../shared/confirmation-recovery.js";
import { CompanionPackageSchema } from "@agentxm/extension-model/unstable/package-urls";
import {
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
} from "@agentxm/extension-model/unstable/knowledge";
import { inspectKnowledgeBundle } from "@agentxm/registry-protocol/unstable/knowledge";
import {
  checkForbiddenSourceEntries,
  enforceArchiveSizeLimit,
  resolveVisibilityIntent,
  type PublishVisibility,
  type VisibilityIntent,
  normalizePublishInput,
  validateArchive,
} from "@agentxm/registry-protocol/unstable/publish";
import {
  publishArchiveOptions,
  runPublishLintGate,
} from "@agentxm/extension-management/unstable/publish";
import { buildLintWorkspace } from "@agentxm/extension-management/unstable/lint";
import type { PackDependencyReachability } from "@agentxm/extension-management/unstable/packs";
import {
  PUBLICATION_SET_CONTRACT,
  archiveSha256Hex,
  publicationDescriptorDigest,
  publicationSetDigest,
  type PackDependencyDescriptor,
  type PreviewPublicationSetRequest,
  type PreviewPublicationSetResponse,
  PreviewPublicationSetResponseSchema,
  type PublicationCandidateResult,
  type PublicationDescriptor,
  type PublicationVisibilityInput,
  type PublicationPackResult,
  type VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry";
import {
  createRegistryClient,
  type ExtensionVisibility,
  type PublishExtensionArgs,
  type RegistryClient,
} from "@agentxm/extension-management/unstable/registry";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { SourceType } from "@agentxm/extension-model/unstable/sources/types";
import {
  computeIntegrity,
  expandGlobs,
  isGlobPattern,
  planZipArchive,
  type ArchivePlan,
} from "@agentxm/extension-management/unstable/utils";
import {
  VersionSchema,
  decodeVersionRangeSync,
  type Version,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  WorkspaceMutations,
  acceptedCanonicalObservation,
  configuredRowsByName,
  type WorkspaceScope,
} from "@agentxm/extension-management/unstable/workspace";

import {
  emitPublishResult,
  type PublishAdvisoryFinding,
  type PublishPublicationSet,
  type PublishSelectionDecision,
  type PublishResultItem,
} from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import {
  backfillFlag,
  onExistingFlag,
  resolveExistingVersionPolicy,
  type OnExistingPolicy,
  type PublishSelectionMode,
} from "../shared/publish-flags.js";
import {
  alreadyPublishedVersionConflict,
  nonMonotonicVersionConflict,
} from "../shared/publish-preflight.js";
import {
  settlePublish,
  type PublishSettlement,
  type SettledPublish,
} from "./publish-settlement.js";

/**
 * Publish policy, total over every extension type: a new type cannot be added
 * without deciding whether it publishes.
 */
export const PUBLISHABLE_TYPES = {
  skill: true,
  "mcp-server": true,
  subagent: true,
  rule: true,
  hook: true,
  knowledge: true,
  pack: true,
} as const satisfies Record<ExtensionType, boolean>;

type TruthyKeys<T> = { [K in keyof T]: T[K] extends true ? K : never }[keyof T];

export type PublishableType = TruthyKeys<typeof PUBLISHABLE_TYPES>;

export const isPublishableType = (type: ExtensionType): type is PublishableType =>
  PUBLISHABLE_TYPES[type];

const selectableTypes: ReadonlyArray<PublishableType> = extensionTypes.filter(isPublishableType);
type SelectableType = PublishableType;
type SelectionMode = PublishSelectionMode;
type ExistingVersionPolicy = OnExistingPolicy;

export const aggregatePublishFailure = (
  failedCount: number,
  errors: ReadonlyArray<AppError>,
): AppError => {
  const [firstError] = errors;
  const allRetryable =
    errors.length > 0 && errors.every((error) => error.metadata?.requestPolicy?.retryable === true);
  const commonCode: AppErrorCode =
    firstError !== undefined &&
    (allRetryable || errors.every((error) => error.code === firstError.code))
      ? firstError.code
      : "internal";

  return makeAppError({
    code: commonCode,
    detail: `Failed to publish ${failedCount} extension${failedCount === 1 ? "" : "s"}${
      firstError !== undefined && commonCode !== "internal" ? `: ${firstError.detail}` : ""
    }`,
    ...(firstError !== undefined && commonCode !== "internal"
      ? { suggestions: firstError.suggestions }
      : {}),
  });
};

const manifestFilename: Readonly<Record<SelectableType, string>> = {
  skill: "skill.json",
  "mcp-server": "mcp.json",
  subagent: "subagent.json",
  rule: "rule.json",
  hook: "hook.json",
  knowledge: "knowledge.json",
  pack: "pack.json",
};

const CandidateManifestSchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
  version: VersionSchema,
  packages: Schema.optional(Schema.Array(CompanionPackageSchema)),
  dependencies: Schema.optional(ExtensionDependencyConstraintMapSchema),
  publish: Schema.optional(PublishOptionsSchema),
  metadata: Schema.optional(ExtensionMetadataSchema),
});

interface CatalogEntry {
  readonly type: SelectableType;
  readonly name: string;
  readonly source: string;
}

interface SelectedEntry extends CatalogEntry {
  readonly owner: Handle;
  readonly fqn: string;
  readonly sourceType: SourceType;
  readonly authored: boolean;
  readonly includedDependency?: true;
  readonly includedBy?: ReadonlyArray<string>;
  readonly extensionDir?: string;
  readonly skipReason?: "not_authored" | "not_publishable";
}

interface PublishCandidate extends SelectedEntry {
  readonly type: PublishableType;
  readonly name: ExtensionName;
  readonly extensionDir: string;
  readonly manifestJson: unknown;
  readonly version: Version;
  readonly packages?: ReadonlyArray<Schema.Schema.Type<typeof CompanionPackageSchema>>;
  readonly dependencies?: Schema.Schema.Type<typeof ExtensionDependencyConstraintMapSchema>;
  readonly publishVisibility?: ExtensionVisibility;
  readonly archive: Uint8Array;
  readonly archivePlan: ArchivePlan;
  readonly integrity: string;
  readonly action: "publish" | "skip";
  readonly backfill: boolean;
  readonly extensionExists: boolean;
  readonly publishPreview?: ResolvedPublishPreview;
}

interface PublishPreparationFailure {
  readonly _tag: "PublishPreparationFailure";
  readonly reason: "version_exists" | "integrity_drift" | "not_authored";
  readonly error: AppError;
}

/**
 * Publish steps settle with the registry `AppError` as the step failure's
 * cause; the readers below recover it so publish causes keep their
 * request/response metadata verbatim.
 */
const publishStepFailure = (error: AppError): StepFailure =>
  new StepFailure({
    category: error.code,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    cause: error,
  });

const publishStepAppError = (error: StepFailure): AppError =>
  error.cause instanceof AppError ? error.cause : stepFailureToAppError(error);

const preparationFailure = (
  reason: PublishPreparationFailure["reason"],
  error: AppError,
): PublishPreparationFailure => ({ _tag: "PublishPreparationFailure", reason, error });

const preparationError = (failure: AppError | PublishPreparationFailure): AppError =>
  failure._tag === "PublishPreparationFailure" ? failure.error : failure;

export const publicPublishCause = (error: AppError) => ({
  code: error.code,
  class: errorClassForAppErrorCode(error.code),
  message: redactSensitiveText(error.detail),
  retryable: error.metadata?.requestPolicy?.retryable ?? false,
  ...(error.metadata?.requestPolicy === undefined
    ? {}
    : {
        attemptCount: error.metadata.requestPolicy.attemptCount,
        maxAttempts: error.metadata.requestPolicy.maxAttempts,
        attemptsExhausted: error.metadata.requestPolicy.exhausted,
        ...(error.metadata.requestPolicy.stoppedBy === undefined
          ? {}
          : { retryStoppedBy: error.metadata.requestPolicy.stoppedBy }),
      }),
  ...(error.metadata?.response?.requestId === undefined
    ? {}
    : { requestId: redactSensitiveText(error.metadata.response.requestId) }),
  ...(error.metadata?.response === undefined
    ? {}
    : {
        responseStatus: error.metadata.response.status,
        ...(error.metadata.response.problemCode === undefined
          ? {}
          : { problemCode: redactSensitiveText(error.metadata.response.problemCode) }),
      }),
});

interface LocalPackConstraintCandidate {
  readonly fqn: string;
  readonly type: PublishableType;
  readonly authored: boolean;
  readonly version: Version;
  readonly dependencies?: Schema.Schema.Type<typeof ExtensionDependencyConstraintMapSchema>;
}

export const findPackPublishDivergenceFindings = (args: {
  readonly candidates: ReadonlyArray<LocalPackConstraintCandidate>;
  readonly reachability: ReadonlyArray<PackDependencyReachability>;
  readonly packs: ReadonlyArray<PublicationPackResult>;
}): ReadonlyMap<string, ReadonlyArray<PublishAdvisoryFinding>> => {
  const authoredPacks = new Set(
    args.candidates
      .filter((candidate) => candidate.authored && candidate.type === "pack")
      .map((candidate) => candidate.fqn),
  );
  const localByPair = new Map(
    args.reachability.map((record) => [`${record.packFqn}\u0000${record.memberFqn}`, record]),
  );
  const findings = new Map<string, Array<PublishAdvisoryFinding>>();
  for (const pack of args.packs) {
    if (pack.status !== "admitted") continue;
    const packFqn = formatFqn(pack.target);
    if (!authoredPacks.has(packFqn)) continue;
    for (const resolution of pack.resolutions) {
      const memberFqn = formatFqn(resolution.dependency);
      const local = localByPair.get(`${packFqn}\u0000${memberFqn}`);
      if (
        local?.classification !== "satisfying" ||
        local.memberVersion === undefined ||
        local.memberVersion === resolution.effectiveVersion
      ) {
        continue;
      }
      const finding: PublishAdvisoryFinding = {
        ruleId: "pack/publish-resolution-divergence",
        severity: "warning",
        message: `${packFqn} resolves ${memberFqn}@${local.memberVersion} in this workspace, while Registry consumers resolve ${memberFqn}@${resolution.effectiveVersion} within ${resolution.dependency.range}.`,
        suggestions: [
          local.memberAuthority === "workspace"
            ? {
                description: `Publish ${memberFqn} before publishing the pack if consumers should receive the workspace version`,
                cmd: `axm publish ${memberFqn}`,
              }
            : {
                description: `Update ${memberFqn} if this workspace should match Registry consumers`,
                cmd: `axm update ${memberFqn}`,
              },
        ],
      };
      const current = findings.get(packFqn);
      if (current === undefined) findings.set(packFqn, [finding]);
      else current.push(finding);
    }
  }
  return new Map(
    [...findings.entries()].map(([packFqn, values]) => [
      packFqn,
      [...values].sort((left, right) => left.message.localeCompare(right.message)),
    ]),
  );
};

const localPackConstraintErrors = (
  facts: ReadonlyArray<ExtensionConstraintInvariantFact>,
): ReadonlyMap<string, AppError> => {
  return new Map(
    facts.map((fact) => {
      const memberFqn = fact.subject.identity;
      const memberVersion = fact.observation.candidateVersion ?? "unknown";
      const violations = fact.observation.violations ?? [];
      return [
        memberFqn,
        makeAppError({
          code: "validation",
          detail: `${extensionConstraintFactText(fact)}; ${memberFqn}@${memberVersion} is excluded by the current workspace Pack constraints: ${violations
            .map(
              (constraint) =>
                `${constraint.dependingPack ?? "unknown Pack"} declares ${constraint.range}`,
            )
            .join("; ")}`,
          suggestions: violations.flatMap((constraint) =>
            constraint.authority === "workspace"
              ? [
                  {
                    description: `Replace ${constraint.dependingPack ?? "the Pack"}'s constraint with the selected version, then publish the member and pack together`,
                    cmd: `axm packs add ${constraint.dependingPack ?? "<name>"} ${memberFqn}`,
                  },
                ]
              : [
                  {
                    description: `Update ${constraint.dependingPack ?? "the Pack"} if its owner has published a compatible constraint`,
                    cmd: `axm update ${constraint.dependingPack ?? "<extension[@version]>"}`,
                  },
                  {
                    description: `Otherwise stop workspace authority from shadowing ${memberFqn}`,
                  },
                ],
          ),
        }),
      ];
    }),
  );
};

export interface ResolvedPublishPreview {
  readonly visibility: PublishVisibility;
  readonly visibilityInput: PublicationVisibilityInput;
  readonly condition?: string;
  readonly publicationSetDigest: string;
  readonly publicationDescriptorDigest: string;
}

interface PublishPlanCandidate {
  readonly fqn: string;
  readonly type: PublishableType;
  readonly dependencies?: Readonly<Record<string, unknown>>;
  readonly includedDependency?: true;
}

interface PublishAuthorizationState {
  readonly exactCapabilities: ReadonlyMap<string, PublishCapabilityResponse>;
  readonly issuedCapabilities: ReadonlyArray<PublishCapabilityResponse>;
  readonly packDivergenceFindings: ReadonlyMap<string, ReadonlyArray<PublishAdvisoryFinding>>;
  readonly preview?: PreviewPublicationSetResponse;
}

interface PublishAuthorizationService {
  readonly authorize: Effect.Effect<void, AppError>;
  readonly state: Effect.Effect<PublishAuthorizationState, AppError>;
}

class PublishAuthorization extends ServiceMap.Service<
  PublishAuthorization,
  PublishAuthorizationService
>()("axm.sh/root/publish/command/PublishAuthorization") {}

type PublishPlanOutput =
  | {
      readonly _tag: "PublishAuthorizationOutput";
      readonly packDivergenceFindings: ReadonlyMap<string, ReadonlyArray<PublishAdvisoryFinding>>;
      readonly preview?: PreviewPublicationSetResponse;
    }
  | {
      readonly _tag: "PublishedCandidateOutput";
      readonly targetKey: string;
      readonly visibility: PublishVisibility;
      readonly warnings: ReadonlyArray<PublishAdvisoryFinding>;
      readonly settlement: Exclude<PublishSettlement, "unresolved">;
    };

type PublishPlanRequirements =
  HttpClient.HttpClient | PublishAuthorization | FileSystem.FileSystem | Path.Path;

/** Creates dependency edges without expanding the user's selection. */
export const buildPublishJobs = <
  Candidate extends PublishPlanCandidate,
  Requirements = never,
  Output = never,
>(
  candidates: ReadonlyArray<Candidate>,
  candidateStep: (candidate: Candidate) => PlannedJobStep<Requirements, Output>,
): ReadonlyArray<Job<Requirements, Output>> => {
  const selectedFqns = new Set(candidates.map((candidate) => candidate.fqn));
  return [
    {
      concurrency: 4,
      executionPolicy: "best-effort",
      steps: candidates.map((candidate) => ({
        ...candidateStep(candidate),
        key: candidate.fqn,
        ...(candidate.type !== "pack"
          ? {}
          : {
              dependsOn: Object.keys(candidate.dependencies ?? {}).filter((fqn) =>
                selectedFqns.has(fqn),
              ),
            }),
      })),
    },
  ];
};

interface TargetRegistry {
  readonly name: string;
  readonly url: string;
}

export interface RootPublishHandlerArgs {
  readonly selectors: ReadonlyArray<string>;
  readonly owners: ReadonlyArray<string>;
  readonly types: ReadonlyArray<SelectableType>;
  readonly excludes: ReadonlyArray<string>;
  readonly registry: Option.Option<string>;
  readonly registryUrl: Option.Option<string>;
  readonly onExisting: Option.Option<ExistingVersionPolicy>;
  readonly backfill: boolean;
  readonly yes: boolean;
  readonly preview: boolean;
  readonly scope: WorkspaceScope;
  readonly visibility: Option.Option<ExtensionVisibility>;
  readonly includeDependencies: boolean;
  readonly recoveryCommand?: ReadonlyArray<string>;
  readonly recoverySelectors?: ReadonlyArray<string>;
  readonly recoveryExcludes?: ReadonlyArray<string>;
}

export const makeExactPublishRecovery = (
  args: Pick<RootPublishHandlerArgs, "registry" | "registryUrl" | "backfill" | "visibility">,
  candidateFqns: ReadonlyArray<string>,
) =>
  makeConfirmationRecovery(
    ["publish"],
    [
      ...Option.match(args.registry, {
        onNone: () => [],
        onSome: (registryName) => [recoveryOption("--registry", publicRecoveryValue(registryName))],
      }),
      ...Option.match(args.registryUrl, {
        onNone: () => [],
        onSome: (url) => [
          recoveryOption("--registry-url", credentialFreeLocatorRecoveryValue(url)),
        ],
      }),
      recoveryOption("--on-existing", publicRecoveryValue("verify")),
      recoverySwitch("--backfill", args.backfill),
      ...Option.match(args.visibility, {
        onNone: () => [],
        onSome: (visibility) => [recoveryOption("--visibility", publicRecoveryValue(visibility))],
      }),
      ...candidateFqns.map((fqn) => recoveryPositional(publicRecoveryValue(fqn))),
    ],
  );

export const publishRecoverySelection = (
  results: ReadonlyArray<PublishResultItem>,
): {
  readonly remainingItems: ReadonlyArray<string>;
  readonly blockedDependents: ReadonlyArray<string>;
} => ({
  // The continuation set covers everything not definitively published:
  // failures, blocked dependents, indeterminate uploads (the re-run verifies
  // byte-identical versions before retrying), and interrupted pending items.
  remainingItems: results
    .filter(
      (result) =>
        result.status === "failed" ||
        result.status === "blocked" ||
        result.status === "unknown" ||
        (result.status === "pending" && result.reason === "interrupted"),
    )
    .map((result) => result.id),
  blockedDependents: results
    .filter((result) => result.status === "blocked")
    .map((result) => result.id),
});

/**
 * Per-item evidenced states for an externally interrupted publish apply. The
 * journal's settlement facts and the dispatch evidence separate four cases:
 * a recorded response (success or failure stands), a dispatched upload with
 * no recorded response (the registry may have committed — indeterminate),
 * and work the interruption prevented (pending; nothing left the process).
 *
 * @internal Exported for direct tests.
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
      const stepError = publishStepAppError(step.result.error);
      return {
        ...result,
        action: "error",
        phase: "upload_execution",
        reason:
          stepError.metadata?.response?.problemCode === "publish/precondition-changed"
            ? "publish_precondition_changed"
            : "upload_failed",
        status: "failed",
        ...(step.result.message.length === 0 ? {} : { message: step.result.message }),
        cause: publicPublishCause(stepError),
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

export const publishAuthenticationPreconditions = (options: {
  readonly preview: boolean;
  readonly remoteRegistry: boolean;
  readonly authenticated: boolean;
  readonly hasPublishCandidates: boolean;
}): ReadonlyArray<OperationPrecondition> =>
  options.preview &&
  options.remoteRegistry &&
  !options.authenticated &&
  options.hasPublishCandidates
    ? [
        {
          id: "authentication",
          label: "Registry authentication",
          status: "unmet",
          detail:
            "Publishing requires human authorization before apply; authenticate before preparing a release workflow.",
          blockedOn: "human",
          command: "axm login --device-code --json",
        },
      ]
    : [];

export const exactPublishUploadBinding = (
  capability: PublishCapabilityResponse,
  visibilityInput: PublicationVisibilityInput,
): Pick<
  PublishExtensionArgs,
  | "accessToken"
  | "condition"
  | "visibility"
  | "visibilityInput"
  | "publicationSetDigest"
  | "publicationDescriptorDigest"
> => ({
  accessToken: capability.accessToken,
  condition: capability.condition,
  publicationSetDigest: capability.publicationSetDigest,
  publicationDescriptorDigest: capability.publicationDescriptorDigest,
  visibilityInput,
  ...(capability.visibility.disposition === "establish"
    ? { visibility: capability.visibility }
    : {}),
});

export const previewPublishUploadBinding = (
  preview: ResolvedPublishPreview,
): Pick<
  PublishExtensionArgs,
  | "condition"
  | "visibility"
  | "visibilityInput"
  | "publicationSetDigest"
  | "publicationDescriptorDigest"
> => ({
  ...(preview.condition === undefined ? {} : { condition: preview.condition }),
  publicationSetDigest: preview.publicationSetDigest,
  publicationDescriptorDigest: preview.publicationDescriptorDigest,
  visibilityInput: preview.visibilityInput,
  ...(preview.visibility.disposition === "establish" ? { visibility: preview.visibility } : {}),
});

export const validatePublishOwners = (
  owners: ReadonlyArray<Handle>,
  client: Pick<RegistryClient, "ownerExists">,
): Effect.Effect<void, AppError> =>
  Effect.forEach(
    [...new Set(owners)],
    (owner) =>
      client.ownerExists(owner).pipe(
        Effect.flatMap(({ exists }) =>
          exists
            ? Effect.void
            : makeAppError({
                code: "not_found",
                detail: `Publish owner ${owner} does not exist.`,
                suggestions: [
                  {
                    description: "Create the organization in AgentXM before publishing.",
                    url: "https://agentxm.ai/orgs/new",
                  },
                ],
              }),
        ),
      ),
    { concurrency: 4, discard: true },
  );

const entrySource = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null || !("source" in entry)) return undefined;
  return typeof entry.source === "string" ? entry.source : undefined;
};

const catalogEntries = Effect.fn("Publish.catalogEntries")(function* () {
  const ws = yield* WorkspaceMutations;
  const [skills, mcps, subagents, rules, hooks, knowledge, packs] = yield* Effect.all(
    [
      ws.records.rows("skill").pipe(Effect.map(configuredRowsByName)),
      ws.records.rows("mcp-server").pipe(Effect.map(configuredRowsByName)),
      ws.records.rows("subagent").pipe(Effect.map(configuredRowsByName)),
      ws.getConfiguredRuleEntries(),
      ws.getConfiguredHookEntries(),
      ws.getConfiguredKnowledgeEntries(),
      ws.records.rows("pack").pipe(Effect.map(configuredRowsByName)),
    ],
    { concurrency: "unbounded" },
  );

  const group = (type: SelectableType, entries: Readonly<Record<string, unknown>>) =>
    Object.entries(entries).flatMap(([name, entry]) => {
      const source = entrySource(entry);
      return source === undefined ? [] : [{ type, name, source } satisfies CatalogEntry];
    });

  return [
    ...group("skill", skills),
    ...group("mcp-server", mcps),
    ...group("subagent", subagents),
    ...group("rule", rules),
    ...group("hook", hooks),
    ...group("knowledge", knowledge),
    ...group("pack", packs),
  ];
});

const sourceType = (source: string): SourceType => {
  if (isWorkspaceSourceLocator(source)) return "workspace";
  if (source.startsWith("github:")) return "github";
  if (source.startsWith("gitlab:")) return "gitlab";
  if (source.startsWith("bitbucket:")) return "bitbucket";
  if (source.startsWith("azurerepos:")) return "azurerepos";
  if (source.startsWith("git:")) return "git";
  if (source.startsWith("file:") || source.startsWith("./") || source.startsWith("../")) {
    return "local";
  }
  if (source.startsWith("inline:")) return "inline";
  return "registry";
};

const identityFromSource = (entry: CatalogEntry) => {
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(entry.source);
  if (
    parsed === undefined ||
    parsed.name === undefined ||
    parsed.type !== extensionTypeToPlural[entry.type]
  ) {
    return undefined;
  }
  return {
    ...entry,
    owner: parsed.owner,
    fqn: `${parsed.owner}/${parsed.type}/${parsed.name}`,
    sourceType: sourceType(entry.source),
    authored: false,
  } satisfies SelectedEntry;
};

const identityFromManagedPackage = Effect.fn("Publish.identityFromManagedPackage")(function* (
  entry: CatalogEntry,
) {
  const parsedIdentity = identityFromSource(entry);
  if (parsedIdentity !== undefined) return parsedIdentity;

  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const authored = isWorkspaceSourceLocator(entry.source);
  const accepted = authored
    ? Option.none()
    : yield* acceptedCanonicalObservation({
        workspace: ws,
        type: entry.type,
        name: entry.name,
      });
  const extensionRoots = authored
    ? ws.layout.scope === "project"
      ? [path.join(ws.layout.authoredRoot(entry.type), entry.name)]
      : []
    : Option.match(accepted, {
        onNone: () => [],
        onSome: ({ observation }) => (observation.path === undefined ? [] : [observation.path]),
      });

  for (const extensionDir of extensionRoots) {
    const manifestPath = path.join(extensionDir, manifestFilename[entry.type]);
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) continue;
    const json = yield* Effect.sync((): unknown => {
      try {
        return JSON.parse(raw.value);
      } catch {
        return undefined;
      }
    });
    const manifest = Schema.decodeUnknownOption(CandidateManifestSchema)(json);
    if (
      Option.isNone(manifest) ||
      manifest.value.type !== entry.type ||
      manifest.value.name !== entry.name
    ) {
      continue;
    }
    return {
      ...entry,
      owner: manifest.value.owner,
      fqn: formatFqn(manifest.value),
      sourceType: sourceType(entry.source),
      authored,
      extensionDir,
    } satisfies SelectedEntry;
  }
  return undefined;
});

const parseRootSelector = (selector: string) => {
  if (selector.startsWith("@")) {
    if (isGlobPattern(selector)) {
      const [owner, plural, name, extra] = selector.split("/");
      const supportedPlural = selectableTypes.some(
        (candidate) => extensionTypeToPlural[candidate] === plural,
      );
      if (
        owner === undefined ||
        plural === undefined ||
        name === undefined ||
        extra !== undefined ||
        !supportedPlural
      ) {
        return makeAppError({
          code: "validation",
          detail: `Unsupported publish selector: ${selector}`,
        });
      }
      return Effect.succeed({ plural, name });
    }
    return Effect.fromResult(Result.mapError(parseFqn(selector), fqnInvalidErrorToAppError));
  }
  const [plural, name, extra] = selector.split("/");
  if (plural === undefined || name === undefined || extra !== undefined) {
    return makeAppError({
      code: "validation",
      detail: `Root publish selector "${selector}" is ambiguous`,
      recover: "Use @owner/<plural-type>/name or <plural-type>/name.",
    });
  }
  const type = selectableTypes.find((candidate) => extensionTypeToPlural[candidate] === plural);
  if (type === undefined) {
    return makeAppError({
      code: "validation",
      detail: `Unsupported publish selector: ${selector}`,
    });
  }
  return Effect.succeed({ type, name });
};

const matchesSelector = (entry: SelectedEntry, selector: string): boolean => {
  const typeName = `${extensionTypeToPlural[entry.type]}/${entry.name}`;
  const candidates = [entry.fqn, typeName];
  return isGlobPattern(selector)
    ? expandGlobs([selector], candidates).length > 0
    : candidates.includes(selector);
};

const selectEntries = Effect.fn("Publish.selectEntries")(function* (
  catalog: ReadonlyArray<CatalogEntry>,
  args: RootPublishHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const hasFilters = args.owners.length > 0 || args.types.length > 0 || args.excludes.length > 0;
  if (args.selectors.length > 0 && hasFilters) {
    return yield* makeAppError({
      code: "usage",
      detail: "Selection filters cannot be combined with explicit selectors",
    });
  }
  const resolvedIdentities = yield* Effect.forEach(
    catalog,
    (entry) => identityFromManagedPackage(entry),
    { concurrency: 8 },
  );
  const identities: Array<SelectedEntry> = [];
  for (const identity of resolvedIdentities) {
    if (identity !== undefined) identities.push(identity);
  }
  let selected: ReadonlyArray<SelectedEntry>;
  let mode: SelectionMode;

  if (args.selectors.length > 0) {
    for (const selector of args.selectors) {
      yield* parseRootSelector(selector);
    }
    selected = identities
      .filter((entry) => args.selectors.some((selector) => matchesSelector(entry, selector)))
      .map((entry) => (entry.authored ? entry : { ...entry, skipReason: "not_authored" }));
    mode = "explicit";
  } else {
    selected = identities.filter((entry) => entry.authored);
    mode = "authored";
    if (args.owners.length > 0) {
      selected = selected.filter((entry) => args.owners.includes(entry.owner));
    }
    if (args.types.length > 0) {
      selected = selected.filter((entry) => args.types.includes(entry.type));
    }
    if (args.excludes.length > 0) {
      selected = selected.filter(
        (entry) => !args.excludes.some((selector) => matchesSelector(entry, selector)),
      );
    }
  }

  if (args.includeDependencies) {
    const selectedPacks = selected.filter((entry) => entry.type === "pack");
    for (const pack of selectedPacks) {
      const packDir =
        pack.extensionDir ??
        (ws.layout.scope === "project"
          ? path.join(ws.layout.authoredRoot("pack"), pack.name)
          : path.join(ws.layout.acquiredRoot, pack.owner, "packs", pack.name));
      const manifestPath = path.join(packDir, manifestFilename.pack);
      const raw = yield* fs.readFileString(manifestPath).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "validation",
            detail: `Cannot read dependencies for ${pack.fqn}`,
            cause,
          }),
        ),
      );
      const json = yield* Effect.try({
        try: (): unknown => JSON.parse(raw),
        catch: (cause) =>
          makeAppError({
            code: "validation",
            detail: `Invalid pack manifest for ${pack.fqn}`,
            cause,
          }),
      });
      const manifest = yield* Schema.decodeUnknownEffect(CandidateManifestSchema)(json).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "validation",
            detail: `Invalid pack manifest for ${pack.fqn}`,
            cause,
          }),
        ),
      );
      for (const dependencyFqn of Object.keys(manifest.dependencies ?? {})) {
        const dependency = identities.find((entry) => entry.fqn === dependencyFqn);
        if (dependency === undefined) {
          const parsed = yield* Effect.fromResult(
            Result.mapError(parseFqn(dependencyFqn), fqnInvalidErrorToAppError),
          );
          selected = [
            ...selected,
            {
              type: parsed.type,
              name: parsed.name,
              source: dependencyFqn,
              owner: parsed.owner,
              fqn: dependencyFqn,
              sourceType: "registry",
              authored: false,
              includedDependency: true,
              includedBy: [pack.fqn],
              skipReason: "not_publishable",
            },
          ];
          continue;
        }
        selected = [
          ...selected,
          dependency.authored
            ? { ...dependency, includedDependency: true, includedBy: [pack.fqn] }
            : {
                ...dependency,
                includedDependency: true,
                includedBy: [pack.fqn],
                skipReason: "not_authored",
              },
        ];
      }
    }
  }

  const unique = new Map<string, SelectedEntry>();
  for (const entry of selected) {
    const key = `${entry.type}:${entry.owner}:${entry.name}`;
    const existing = unique.get(key);
    unique.set(
      key,
      existing === undefined
        ? entry
        : {
            ...existing,
            ...entry,
            includedBy: [...new Set([...(existing.includedBy ?? []), ...(entry.includedBy ?? [])])],
          },
    );
  }
  const entries = [...unique.values()];
  const selectedByFqn = new Map(entries.map((entry) => [entry.fqn, entry]));
  const decisions: ReadonlyArray<PublishSelectionDecision> = [
    ...identities.map((identity): PublishSelectionDecision => {
      const included = selectedByFqn.get(identity.fqn);
      const excluded = args.excludes.some((selector) => matchesSelector(identity, selector));
      const disposition =
        included?.skipReason === "not_authored"
          ? "not-authored"
          : included?.skipReason === "not_publishable"
            ? "not-publishable"
            : included !== undefined
              ? "included"
              : excluded
                ? "excluded"
                : identity.authored
                  ? "excluded"
                  : "not-authored";
      const reason =
        disposition === "included"
          ? "selected"
          : disposition === "not-authored"
            ? "not_authored"
            : disposition === "not-publishable"
              ? "not_publishable"
              : "excluded";
      return {
        id: identity.fqn,
        ...(args.selectors.find((selector) => matchesSelector(identity, selector)) === undefined
          ? {}
          : { selector: args.selectors.find((selector) => matchesSelector(identity, selector)) }),
        target: {
          owner: identity.owner,
          type: identity.type,
          name: decodeExtensionNameSync(identity.name),
        },
        origin:
          included?.includedDependency === true
            ? "dependency-expansion"
            : args.selectors.length > 0
              ? "explicit-selector"
              : "bulk-selection",
        disposition,
        reason,
        referencedBy: included?.includedBy ?? [],
      };
    }),
    ...entries.flatMap((entry): ReadonlyArray<PublishSelectionDecision> =>
      identities.some((identity) => identity.fqn === entry.fqn)
        ? []
        : [
            {
              id: entry.fqn,
              target: {
                owner: entry.owner,
                type: entry.type,
                name: decodeExtensionNameSync(entry.name),
              },
              origin: "dependency-expansion",
              disposition: entry.skipReason === "not_authored" ? "not-authored" : "not-publishable",
              reason: entry.skipReason === "not_authored" ? "not_authored" : "not_publishable",
              referencedBy: entry.includedBy ?? [],
            },
          ],
    ),
    ...catalog.flatMap((entry, index): ReadonlyArray<PublishSelectionDecision> =>
      resolvedIdentities[index] === undefined
        ? [
            {
              id: `unmanaged:${entry.type}:${entry.name}`,
              origin: args.selectors.length > 0 ? "explicit-selector" : "bulk-selection",
              disposition: "unmanaged",
              reason: "unmanaged",
              referencedBy: [],
            },
          ]
        : [],
    ),
    ...args.selectors.flatMap((selector): ReadonlyArray<PublishSelectionDecision> =>
      identities.some((entry) => matchesSelector(entry, selector))
        ? []
        : [
            {
              id: `selector:${selector}`,
              selector,
              origin: "explicit-selector",
              disposition: "unmatched",
              reason: "unmatched_selector",
              referencedBy: [],
            },
          ],
    ),
  ];
  return {
    mode,
    decisions,
    entries: [
      ...entries.filter((entry) => entry.includedDependency === true),
      ...entries.filter((entry) => entry.includedDependency !== true),
    ],
  };
});

const resolveTargetRegistry = Effect.fn("Publish.resolveTargetRegistry")(function* (
  requested: Option.Option<string>,
  urlOverride: Option.Option<string>,
) {
  const ws = yield* WorkspaceMutations;
  if (Option.isSome(urlOverride)) {
    const url = yield* Effect.try({
      try: () => new URL(urlOverride.value).href,
      catch: (cause) =>
        makeAppError({ code: "validation", detail: "--registry-url must be a valid URL", cause }),
    });
    return {
      name: Option.getOrElse(requested, () => "override"),
      url,
    } satisfies TargetRegistry;
  }
  const registries = yield* ws.getRegistrySourceHosts();
  const [defaultRegistry] = registries;
  if (Option.isNone(requested)) {
    if (defaultRegistry === undefined) {
      return yield* makeAppError({ code: "usage", detail: "No registry sources configured" });
    }
    return {
      name: defaultRegistry.name,
      url: defaultRegistry.location.href,
    } satisfies TargetRegistry;
  }
  const source = yield* ws.getConfiguredSourceByName(requested.value);
  if (Option.isNone(source) || source.value.type !== "registry") {
    return yield* makeAppError({
      code: "not_found",
      detail: `Registry source "${requested.value}" not found`,
    });
  }
  return { name: requested.value, url: source.value.location.href } satisfies TargetRegistry;
});

const decodeCandidate = Effect.fn("Publish.decodeCandidate")(function* (
  selected: SelectedEntry,
  policy: ExistingVersionPolicy,
  registry: TargetRegistry,
  backfillRequested: boolean,
) {
  if (selected.skipReason === "not_authored" && selected.includedDependency !== true) {
    return yield* Effect.fail(
      preparationFailure(
        "not_authored",
        makeAppError({
          code: "conflict",
          detail: `${selected.fqn} is not authored by this workspace and cannot be published from mutable installed content. Run \`axm adopt ${selected.fqn}\` when this workspace should own it, or \`axm fork ${selected.fqn} <new-extension>\` for a separately authored identity.`,
          suggestions: [
            {
              description:
                "Adopt the canonical package when this workspace should own and publish it.",
              cmd: `axm adopt ${selected.fqn}`,
            },
            {
              description: "Fork the package when the published result should have a new identity.",
              cmd: `axm fork ${selected.fqn} <new-extension>`,
            },
          ],
        }),
      ),
    );
  }
  if (selected.skipReason !== undefined) return undefined;
  if (!isPublishableType(selected.type)) return undefined;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const extensionDir =
    selected.extensionDir ??
    (ws.layout.scope === "project" && selected.authored
      ? path.join(ws.layout.authoredRoot(selected.type), selected.name)
      : path.join(
          ws.layout.acquiredRoot,
          selected.owner,
          extensionTypeToPlural[selected.type],
          selected.name,
        ));
  const manifestPath = path.join(extensionDir, manifestFilename[selected.type]);
  const manifestJson = yield* fs.readFileString(manifestPath).pipe(
    Effect.flatMap((content) =>
      Effect.try({
        try: (): unknown => JSON.parse(content),
        catch: (cause) =>
          makeAppError({ code: "validation", detail: `Invalid JSON in ${manifestPath}`, cause }),
      }),
    ),
    Effect.mapError((cause) =>
      cause._tag === "AppError"
        ? cause
        : makeAppError({ code: "not_found", detail: `Missing manifest: ${manifestPath}`, cause }),
    ),
  );
  const manifest = yield* Schema.decodeUnknownEffect(CandidateManifestSchema)(manifestJson).pipe(
    Effect.mapError((cause) =>
      makeAppError({ code: "validation", detail: `Invalid manifest: ${manifestPath}`, cause }),
    ),
  );
  if (selected.type === "knowledge") {
    const knowledgeManifest = yield* Schema.decodeUnknownEffect(KnowledgeManifestSchema)(
      manifestJson,
    ).pipe(
      Effect.mapError((cause) =>
        makeAppError({ code: "validation", detail: `Invalid manifest: ${manifestPath}`, cause }),
      ),
    );
    const inspection = yield* inspectKnowledgeBundle(
      path.join(extensionDir, KNOWLEDGE_SOURCE_DIR),
    ).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "validation",
          detail: `Failed to inspect Knowledge bundle: ${selected.fqn}`,
          cause,
        }),
      ),
    );
    const blocking = inspection.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    if (blocking.length > 0) {
      return yield* makeAppError({
        code: "validation",
        detail: `Knowledge publish validation failed for ${selected.fqn}: ${blocking
          .map((diagnostic) => `${diagnostic.relativePath}: ${diagnostic.message}`)
          .join("; ")}`,
      });
    }
    // The manifest dialect selects how the registry serves the bundle, while
    // the inspector validates against the root index declaration. A mismatch
    // would validate one dialect and publish another.
    if (inspection.okfVersion !== knowledgeManifest.format.version) {
      return yield* makeAppError({
        code: "validation",
        detail: `Knowledge bundle ${selected.fqn} declares okf_version ${inspection.okfVersion} in src/index.md but format.version ${knowledgeManifest.format.version} in its manifest.`,
        suggestions: [
          {
            description: `Set both to the same OKF version (${knowledgeManifest.format.version}).`,
          },
        ],
      });
    }
  }
  if (
    manifest.owner !== selected.owner ||
    manifest.type !== selected.type ||
    manifest.name !== selected.name
  ) {
    return yield* makeAppError({
      code: "validation",
      detail: `Manifest identity does not match configured extension ${selected.fqn}`,
    });
  }
  // Total over `PublishableType`: adding a publishable type without a
  // `PublishLintArgs` arm is a compile error here, not a silently skipped gate.
  yield* runPublishLintGate({
    type: selected.type,
    extensionDir,
    manifestJson,
    platform: { fs, path },
  });
  const plannedArchive = yield* planZipArchive(
    extensionDir,
    yield* publishArchiveOptions(selected.type, manifest.publish?.ignore),
  );
  const archive = plannedArchive.archive;
  const likelyDevelopmentRoots = ["evals/", "tests/", "fixtures/", "benchmarks/"];
  const developmentRoots = likelyDevelopmentRoots.filter((root) =>
    plannedArchive.plan.included.some((file) => file.path.startsWith(root)),
  );
  const archivePlan: ArchivePlan = {
    ...plannedArchive.plan,
    warnings: [
      ...plannedArchive.plan.warnings,
      ...(manifest.publish?.ignore !== undefined || developmentRoots.length === 0
        ? []
        : [
            `Review the Registry distribution boundary: ${developmentRoots.join(", ")} ${developmentRoots.length === 1 ? "is" : "are"} included and publish.ignore has no explicit decision. Shipping these files may be intentional; AXM never excludes them automatically.`,
          ]),
    ],
  };
  // Guardrails run on the built bytes and only ever reject: rewriting the
  // archive here would change its integrity digest and break republishing an
  // already-published version under `--on-existing verify`.
  const archiveEntries = yield* validateArchive(archive).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Archive validation failed for ${selected.fqn}: ${cause.message}`,
        cause,
      }),
    ),
  );
  yield* checkForbiddenSourceEntries(archiveEntries).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Refusing to publish ${selected.fqn}: ${cause.message}`,
        suggestions: [
          {
            description: "Remove the unsafe entry from the extension directory.",
          },
        ],
        cause,
      }),
    ),
  );
  yield* Effect.fromResult(enforceArchiveSizeLimit(archive.length)).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Cannot publish ${selected.fqn}: ${cause.detail}`,
        cause,
      }),
    ),
  );
  const integrity = yield* computeIntegrity(archive);
  yield* normalizePublishInput({
    declaredIdentity: {
      owner: selected.owner,
      type: selected.type,
      name: manifest.name,
      version: manifest.version,
    },
    archive: {
      archiveBytes: archive,
      archiveContentType: "application/zip",
      clientIntegrity: integrity,
    },
  }).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "validation",
        detail: `Filtered archive validation failed for ${selected.fqn}: ${"detail" in cause ? cause.detail : cause.message}`,
        cause,
      }),
    ),
  );
  const client = yield* createRegistryClient(registry.url);
  const index = yield* client.getExtensionIndex({
    owner: selected.owner,
    type: selected.type,
    name: manifest.name,
  });
  const existing = Option.isSome(index)
    ? index.value.versions.find((entry) => entry.version === manifest.version)
    : undefined;
  let action: "publish" | "skip" = "publish";
  let backfill = false;
  if (existing !== undefined) {
    if (policy === "error") {
      return yield* alreadyPublishedVersionConflict({
        fqn: selected.fqn,
        version: manifest.version,
      }).pipe(Effect.mapError((error) => preparationFailure("version_exists", error)));
    }
    if (policy === "verify" && existing.integrity !== integrity) {
      const error = makeAppError({
        code: "conflict",
        detail: `Immutable-version integrity drift for ${selected.fqn}@${manifest.version}`,
        suggestions: [
          {
            description: "Bump the manifest version.",
            cmd: `axm version ${selected.fqn} patch`,
          },
        ],
      });
      return yield* Effect.fail(preparationFailure("integrity_drift", error));
    }
    action = "skip";
  } else if (Option.isSome(index)) {
    // The registry index is ordered by publish time, not by semver, so the
    // highest published version has to be reduced over every entry. Yanked
    // versions count: their version numbers stay burned.
    const highestPublished = index.value.versions.reduce<Version | undefined>(
      (highest, entry) =>
        highest === undefined || semver.gt(entry.version, highest) ? entry.version : highest,
      undefined,
    );
    if (highestPublished !== undefined && semver.lt(manifest.version, highestPublished)) {
      if (!backfillRequested) {
        return yield* nonMonotonicVersionConflict({
          fqn: selected.fqn,
          version: manifest.version,
          highestPublished,
        });
      }
      backfill = true;
    }
  }
  return {
    ...selected,
    type: selected.type,
    name: manifest.name,
    extensionDir,
    manifestJson,
    version: manifest.version,
    ...(manifest.packages === undefined ? {} : { packages: manifest.packages }),
    ...(manifest.dependencies === undefined ? {} : { dependencies: manifest.dependencies }),
    ...(manifest.publish?.visibility === undefined
      ? {}
      : { publishVisibility: manifest.publish.visibility }),
    archive,
    archivePlan,
    integrity,
    action,
    backfill,
    extensionExists: Option.isSome(index),
  } satisfies PublishCandidate;
});

const publishTargetKey = (target: {
  readonly owner: Handle;
  readonly type: ExtensionType;
  readonly name: ExtensionName;
  readonly version: Version;
}): string =>
  `${target.owner}/${extensionTypeToPlural[target.type]}/${target.name}@${target.version}`;

const publishItemId = (target: {
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
        Result.mapError(parseFqn(fqn), fqnInvalidErrorToAppError),
      );
      if (parsed.type === "pack" || typeof range !== "string") {
        return yield* makeAppError({
          code: "validation",
          detail: `Pack dependency ${fqn} is not a valid non-pack dependency.`,
        });
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

const publicationDescriptorForCandidate = Effect.fn("Publish.publicationDescriptor")(function* (
  candidate: PublishCandidate,
  visibility: Option.Option<ExtensionVisibility>,
  workspaceDefaultVisibility: Option.Option<ExtensionVisibility>,
) {
  const pack =
    candidate.type === "pack"
      ? {
          dependencies: yield* packDependencyDescriptors(candidate.dependencies ?? {}),
        }
      : undefined;
  const intent: VisibilityIntent | null = resolveVisibilityIntent({
    ...(candidate.publishVisibility === undefined
      ? {}
      : {
          manifest: {
            value: candidate.publishVisibility,
            material: JSON.stringify({ publish: { visibility: candidate.publishVisibility } }),
          },
        }),
    ...Option.match(workspaceDefaultVisibility, {
      onNone: () => ({}),
      onSome: (defaultVisibility) => ({
        workspace: {
          value: defaultVisibility,
          material: JSON.stringify({ publish: { defaultVisibility } }),
        },
      }),
    }),
  });
  return {
    target: {
      owner: candidate.owner,
      type: candidate.type,
      name: candidate.name,
      version: candidate.version,
    },
    participation: candidate.action === "publish" ? "publish" : "verified-existing",
    visibility: {
      intent,
      request: Option.getOrNull(visibility),
    },
    ...(candidate.action === "publish"
      ? {
          archiveSha256Hex: archiveSha256Hex(candidate.archive),
        }
      : {}),
    ...(pack === undefined ? {} : { pack }),
  } satisfies PublicationDescriptor;
});

const publicationSetForCandidates = Effect.fn("Publish.publicationSet")(function* (
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
): Effect.Effect<ResolvedPublishPreview, AppError> =>
  result.kind === "resolved" && result.visibility.resolved !== null
    ? Effect.succeed({
        visibility: result.visibility.resolved,
        visibilityInput,
        ...(result.condition === undefined ? {} : { condition: result.condition }),
        publicationSetDigest,
        publicationDescriptorDigest: result.descriptorDigest,
      })
    : makeAppError({
        code: "validation",
        detail: `The registry could not authoritatively preview ${publishTargetKey(result.target)}.`,
      });

const previewPublishCandidates = Effect.fn("Publish.previewCandidates")(function* (
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
    return yield* makeAppError({
      code: "validation",
      detail:
        packErrors[0]?.message ??
        "The registry blocked the complete publication set before any upload.",
      suggestions: packErrors.flatMap((finding) => finding.suggestions),
      cause: preview,
    });
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
      return yield* makeAppError({
        code: "internal",
        detail: "The registry returned an incompatible authoritative publish preview.",
      });
    }
    resultsByTarget.set(key, result);
  }

  const prepared: ReadonlyArray<PublishCandidate> = yield* Effect.forEach(candidates, (candidate) =>
    Effect.gen(function* () {
      const result = resultsByTarget.get(publishTargetKey(candidate));
      const visibilityInput = visibilityByTarget.get(publishTargetKey(candidate));
      if (result === undefined || visibilityInput === undefined) {
        return yield* makeAppError({
          code: "internal",
          detail: "The registry returned an incomplete authoritative publish preview.",
        });
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

const publishCandidate = (
  candidate: PublishCandidate,
  registry: TargetRegistry,
  exactCapability: PublishCapabilityResponse | undefined,
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
      return yield* makeAppError({
        code: "internal",
        detail: `Missing authoritative visibility input for ${candidate.fqn}.`,
      });
    }
    const visibilityInput = publishPreview?.visibilityInput ?? exactVisibilityInput;
    if (visibilityInput === undefined) {
      return yield* makeAppError({
        code: "internal",
        detail: `Missing exact visibility input for ${candidate.fqn}.`,
      });
    }
    const authoritativeVisibility = publishPreview?.visibility ?? exactCapability?.visibility;
    if (authoritativeVisibility === undefined) {
      return yield* makeAppError({
        code: "internal",
        detail: `Missing authoritative visibility outcome for ${candidate.fqn}.`,
      });
    }
    const uploadBinding =
      exactCapability === undefined
        ? publishPreview === undefined
          ? yield* makeAppError({
              code: "internal",
              detail: `Missing authoritative visibility input for ${candidate.fqn}.`,
            })
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
    if (settlement.status === "unknown") return settlement;
    const response = settlement.response;
    return {
      status: "published" as const,
      stepResult: {
        result: "success",
        message:
          settlement.settlement === "response"
            ? `Published ${candidate.fqn}@${candidate.version}`
            : settlement.settlement === "replay"
              ? `Published ${candidate.fqn}@${candidate.version} after one exact replay`
              : `Verified ${candidate.fqn}@${candidate.version} by Registry readback`,
        ...(response?.links === undefined ? {} : { links: response.links }),
      } satisfies JobStepResult,
      visibility: response?.visibility ?? authoritativeVisibility,
      warnings: response?.warnings ?? [],
      settlement: settlement.settlement,
    };
  });

const selectedResult = (
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
    ...(candidate.publishPreview === undefined
      ? {}
      : { visibility: candidate.publishPreview.visibility }),
  };
};

const failedSelectedResult = (
  entry: SelectedEntry,
  failure: AppError | PublishPreparationFailure,
): PublishResultItem => {
  const error = preparationError(failure);
  const reason =
    failure._tag === "PublishPreparationFailure" ? failure.reason : "candidate_invalid";
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
    message: redactSensitiveText(error.detail),
    cause: publicPublishCause(error),
  };
};

const failedCandidateResult = (
  candidate: PublishCandidate,
  error: AppError,
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
  message: redactSensitiveText(error.detail),
  cause: publicPublishCause(error),
  archive: {
    ...candidate.archivePlan,
    zipBytes: candidate.archive.length,
    integrity: candidate.integrity,
  },
});

const publicationSetResult = (options: {
  readonly candidates: ReadonlyArray<PublishCandidate>;
  readonly preview?: PreviewPublicationSetResponse;
  readonly blockedError?: AppError;
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
      options.blockedError !== undefined
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
      findings.length > 0 || options.blockedError === undefined
        ? findings
        : [
            {
              id: "authoritative-publication-set",
              severity: "error",
              reason: "authoritative_preflight_failed",
              message: redactSensitiveText(options.blockedError.detail),
              suggestions: options.blockedError.suggestions ?? [],
            },
          ],
  };
};

const runPublish = Effect.fn("Publish.run")(function* (
  args: RootPublishHandlerArgs,
  registry: TargetRegistry,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceMutations = yield* WorkspaceMutations;
  const authClient = yield* AuthClient;
  const deviceLoginInteraction = yield* DeviceLoginInteraction;
  const authLoginPresenter = yield* AuthLoginPresenter;
  const registryUrl = yield* RegistryUrl;
  const renderer = yield* CliRenderer;
  const prepared = yield* renderer.withSpinner(
    "Preparing publish candidates",
    () =>
      Effect.gen(function* () {
        const catalog = yield* catalogEntries();
        const selection = yield* selectEntries(catalog, args);
        const isRemoteRegistry =
          registry.url.startsWith("https://") || registry.url.startsWith("http://");
        if (isRemoteRegistry && selection.entries.length > 0) {
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
                resolveExistingVersionPolicy(args.onExisting, {
                  mode: selection.mode,
                  includedDependency: entry.includedDependency === true,
                }),
                registry,
                args.backfill,
              ),
            ),
          { concurrency: 4 },
        );
        return { selection, decoded };
      }),
    { successMessage: "Prepared publish candidates" },
  );
  const selection = prepared.selection;
  const selected = selection.entries;
  const decoded = prepared.decoded;
  const decodedCandidates = decoded.flatMap((result) =>
    Result.isSuccess(result) && result.success !== undefined ? [result.success] : [],
  );
  const decodedPreflightErrors = decoded.flatMap((result) =>
    Result.isFailure(result) ? [preparationError(result.failure)] : [],
  );
  const shouldCheckLocalPackConstraints = decodedCandidates.some(
    (candidate) => candidate.authored && candidate.type !== "pack",
  );
  const packDependencyReachability = shouldCheckLocalPackConstraints
    ? yield* Effect.gen(function* () {
        const lintWorkspace = yield* buildLintWorkspace({
          platform: { fs, path },
          workspaceRoot: workspaceMutations.baseDir,
          userHome: workspaceMutations.scope === "user" ? workspaceMutations.baseDir : os.homedir(),
          scope: workspaceMutations.scope,
        }).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: "Failed to build the workspace model for publish preflight",
              cause,
            }),
          ),
        );
        return yield* lintWorkspace.rule.packDependencyReachability ?? Effect.succeed([]);
      })
    : [];
  const localConstraintFacts = makeProspectiveExtensionConstraintFacts({
    candidates: decodedCandidates.filter(
      (candidate) => candidate.type === "pack" || candidate.authored,
    ),
    reachability: packDependencyReachability,
  });
  const localErrorsByMember = localPackConstraintErrors(localConstraintFacts);
  const preflightErrors = [...decodedPreflightErrors, ...localErrorsByMember.values()];
  const selectionOutput = {
    mode: selection.mode,
    scope: args.scope,
    owners: [...new Set(selected.map((entry) => entry.owner))],
    types: [...new Set(selected.map((entry) => entry.type))],
    registry: registry.name,
    decisions: selection.decisions,
  } as const;
  if (selected.length === 0) {
    yield* emitPublishResult("publish", {
      mode: args.preview ? "preview" : "apply",
      selection: selectionOutput,
      results: [],
    });
    return;
  }

  const isRemoteRegistry =
    registry.url.startsWith("https://") || registry.url.startsWith("http://");
  const storedToken = yield* resolveRequestToken(registry.url, registryUrl);
  const workspaceDefaultVisibility = yield* workspaceMutations.getPublishDefaultVisibility();
  const shouldPreviewAuthoritatively =
    preflightErrors.length === 0 &&
    decodedCandidates.length > 0 &&
    (!isRemoteRegistry || Option.isSome(storedToken));
  const authoritativePreview: Result.Result<
    {
      readonly candidates: ReadonlyArray<PublishCandidate>;
      readonly publicationSet: PreviewPublicationSetRequest;
      readonly preview?: PreviewPublicationSetResponse;
    },
    AppError
  > = shouldPreviewAuthoritatively
    ? yield* Effect.result(
        Effect.gen(function* () {
          const client = yield* createRegistryClient(registry.url);
          return yield* previewPublishCandidates(
            decodedCandidates,
            client,
            args.visibility,
            workspaceDefaultVisibility,
          );
        }),
      )
    : yield* Effect.result(
        Effect.gen(function* () {
          return {
            candidates: decodedCandidates,
            publicationSet: yield* publicationSetForCandidates(
              decodedCandidates,
              args.visibility,
              workspaceDefaultVisibility,
            ),
          };
        }),
      );
  const authoritativePreflightError = Result.isFailure(authoritativePreview)
    ? authoritativePreview.failure
    : undefined;
  const authoritativeFailurePreview =
    authoritativePreflightError === undefined
      ? undefined
      : Option.getOrUndefined(
          Schema.decodeUnknownOption(PreviewPublicationSetResponseSchema)(
            authoritativePreflightError.cause,
          ),
        );
  const candidates: ReadonlyArray<PublishCandidate> = Result.isSuccess(authoritativePreview)
    ? authoritativePreview.success.candidates
    : decodedCandidates;
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
    ...(authoritativePreflightError === undefined
      ? {}
      : { blockedError: authoritativePreflightError }),
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
      const localError = localErrorsByMember.get(candidate.fqn);
      if (localError !== undefined) return failedCandidateResult(candidate, localError);
    }
    const selected = selectedResult(
      entry,
      candidate === undefined
        ? undefined
        : (candidatesByTarget.get(publishTargetKey(candidate)) ?? candidate),
    );
    const findings =
      candidate === undefined ? undefined : packDivergenceFindings.get(candidate.fqn);
    return findings === undefined ? selected : { ...selected, findings };
  });
  const localPreflightFailureIds = initialPreflightResults
    .filter((result) => result.status === "failed")
    .map((result) => result.id);
  const preflightResults = initialPreflightResults.map((result): PublishResultItem => {
    if (preflightErrors.length > 0) {
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
    if (authoritativePreflightError === undefined || result.version === undefined) return result;
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
  const allPreflightErrors = [
    ...preflightErrors,
    ...(authoritativePreflightError === undefined ? [] : [authoritativePreflightError]),
  ];
  if (allPreflightErrors.length > 0) {
    const emitted = yield* emitPublishResult("publish", {
      mode: args.preview ? "preview" : "apply",
      selection: selectionOutput,
      publicationSet: publicationSetOutput,
      results: preflightResults,
      ...(authoritativePreflightError === undefined
        ? {}
        : {
            failure: publicPublishCause(authoritativePreflightError),
          }),
    });
    const failure = aggregatePublishFailure(allPreflightErrors.length, allPreflightErrors);
    return emitted ? yield* Effect.die(effectCliExit(exitCodeFor(failure.code))) : yield* failure;
  }

  const authenticationPreconditions = publishAuthenticationPreconditions({
    preview: args.preview,
    remoteRegistry: isRemoteRegistry,
    authenticated: Option.isSome(storedToken),
    hasPublishCandidates: candidates.some((candidate) => candidate.action === "publish"),
  });

  const uploadCandidates = candidates.filter((candidate) => candidate.action === "publish");
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
    AppError,
    AuthLoginPresenter | AuthClient | DeviceLoginInteraction
  > =
    isRemoteRegistry && Option.isNone(storedToken)
      ? Effect.gen(function* () {
          if (publicationSet === undefined) {
            return yield* makeAppError({
              code: "internal",
              detail: "The publication set was unavailable for exact authorization.",
            });
          }
          const exchange = yield* runPublishAuthorization({
            registryUrl: registry.url,
            publicationSet,
          });
          if (exchange.status === "blocked") {
            const firstFinding = exchange.preview.packs
              .flatMap((pack) => pack.findings)
              .find((finding) => finding.severity === "error");
            return yield* makeAppError({
              code: "validation",
              detail:
                firstFinding?.message ??
                "The reviewed publication set was blocked before any upload.",
              suggestions: firstFinding?.suggestions ?? [],
              cause: exchange.preview,
            });
          }
          const packDivergenceFindings = findPackPublishDivergenceFindings({
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
              return yield* makeAppError({
                code: "internal",
                detail: "The registry returned an incompatible exact publish grant bundle.",
              });
            }
            byDescriptor.set(capability.publicationDescriptorDigest, capability);
          }
          if (byDescriptor.size !== uploadCandidates.length) {
            return yield* makeAppError({
              code: "internal",
              detail: "The registry returned an incomplete exact publish grant bundle.",
            });
          }
          return {
            exactCapabilities: byDescriptor,
            issuedCapabilities: exchange.grants,
            packDivergenceFindings,
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
  const unresolvedSettlements = yield* Ref.make<ReadonlyMap<string, SettledPublish>>(new Map());
  const candidateStep = (
    candidate: PublishCandidate,
  ): PlannedJobStep<PublishPlanRequirements, PublishPlanOutput> => {
    const run = Effect.gen(function* () {
      const authorizationService = yield* PublishAuthorization;
      const authorization = yield* authorizationService.state;
      const descriptorDigest =
        candidate.publishPreview?.publicationDescriptorDigest ??
        descriptorDigestsByTarget.get(publishTargetKey(candidate));
      const exactCapability =
        descriptorDigest === undefined
          ? undefined
          : authorization.exactCapabilities.get(descriptorDigest);
      if (isRemoteRegistry && Option.isNone(storedToken) && exactCapability === undefined) {
        return yield* makeAppError({
          code: "internal",
          detail: `The exact grant bundle omitted ${candidate.fqn}@${candidate.version}.`,
        });
      }
      const published = yield* publishCandidate(
        candidate,
        registry,
        exactCapability,
        visibilityInputsByTarget.get(publishTargetKey(candidate)),
        Ref.update(dispatchedUploads, (dispatched) => new Set([...dispatched, candidate.fqn])),
      );
      if (published.status === "unknown") {
        yield* Ref.update(
          unresolvedSettlements,
          (settlements) => new Map([...settlements, [publishTargetKey(candidate), published]]),
        );
        return yield* published.error;
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

  if (uploadCandidates.length === 0) {
    yield* emitPublishResult("publish", {
      mode: args.preview ? "preview" : "apply",
      selection: selectionOutput,
      publicationSet: publicationSetOutput,
      results: preflightResults,
    });
    return;
  }

  const authorizationJobs: ReadonlyArray<Job<PublishPlanRequirements, PublishPlanOutput>> =
    isRemoteRegistry && Option.isNone(storedToken)
      ? [
          {
            concurrency: 1,
            steps: [
              {
                readiness: "ready",
                label: "Authorize exact publication set",
                run: PublishAuthorization.pipe(
                  Effect.flatMap((authorizationService) => authorizationService.state),
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
  const jobs = [...authorizationJobs, ...buildPublishJobs(uploadCandidates, candidateStep)];

  const plan: Plan<PublishPlanRequirements, PublishPlanOutput> = {
    _tag: "Plan",
    name: "Publish extensions",
    description: Option.some(
      `Publish ${uploadCandidates.length} extension${uploadCandidates.length === 1 ? "" : "s"} to registry "${registry.name}"; ${candidates.length - uploadCandidates.length} already published and integrity-verified`,
    ),
    ...(authenticationPreconditions.length === 0
      ? {}
      : { preconditions: authenticationPreconditions }),
    materialPaths: uploadCandidates.map((candidate) => candidate.extensionDir),
    executionCapabilities: { rollback: "non-rollbackable" },
    jobs,
  };
  const exactRecovery = makeExactPublishRecovery(
    args,
    candidates.map((candidate) => candidate.fqn),
  );
  const execution = yield* makePlanExecution(args, exactRecovery);
  // The journal records per-unit started and resolved facts through the plan
  // apply; with the dispatch evidence it lets an external termination
  // request resolve into a publish document of evidenced states — success
  // and failure where a response was recorded, indeterminate where the
  // registry may have committed first, pending where nothing was dispatched.
  const operationJournal = yield* makeOperationJournal;
  const resolveCandidatePlan = Effect.scoped(
    Effect.gen(function* () {
      const authorizationDeferred = yield* Deferred.make<PublishAuthorizationState, AppError>();
      const acquiredAuthorization = yield* Ref.make(Option.none<PublishAuthorizationState>());
      yield* Effect.addFinalizer(() =>
        Ref.get(acquiredAuthorization).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: releasePublishAuthorization,
            }),
          ),
        ),
      );
      const authorize = yield* Effect.cached(
        acquirePublishAuthorization.pipe(
          Effect.provideService(AuthClient, authClient),
          Effect.provideService(DeviceLoginInteraction, deviceLoginInteraction),
          Effect.provideService(AuthLoginPresenter, authLoginPresenter),
          Effect.tap((authorization) => Ref.set(acquiredAuthorization, Option.some(authorization))),
          Effect.tap((authorization) => Deferred.succeed(authorizationDeferred, authorization)),
          Effect.asVoid,
        ),
      );
      const authorization: PublishAuthorizationService = {
        authorize,
        state: Deferred.await(authorizationDeferred),
      };
      return yield* previewOrApplyPlan(plan, {
        execution,
        beforeApply: () => authorization.authorize.pipe(Effect.mapError(publishStepFailure)),
      }).pipe(Effect.provideService(PublishAuthorization, authorization));
    }),
  ).pipe(Effect.provideService(OperationJournal, operationJournal));
  const resolution = yield* Effect.uninterruptibleMask((restoreInterruptibility) =>
    restoreInterruptibility(resolveCandidatePlan).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.gen(function* () {
              const journalState = yield* getOperationJournal.pipe(
                Effect.provideService(OperationJournal, operationJournal),
              );
              const dispatched = yield* Ref.get(dispatchedUploads);
              const results = interruptedPublishResults(preflightResults, journalState, dispatched);
              const recoverySelection = publishRecoverySelection(results);
              const recoveryExecution =
                recoverySelection.remainingItems.length > 0
                  ? yield* makePlanExecution(
                      args,
                      makeExactPublishRecovery(args, recoverySelection.remainingItems),
                    )
                  : undefined;
              const recoveryCmd =
                recoveryExecution !== undefined && "approvalRecovery" in recoveryExecution
                  ? renderConfirmationRecoveryCommand(recoveryExecution.approvalRecovery)
                  : undefined;
              const signal = requestedInterruptionSignal() ?? "SIGINT";
              const exitCode = signal === "SIGTERM" ? 143 : 130;
              yield* emitPublishResult("publish", {
                mode: "apply",
                selection: selectionOutput,
                publicationSet: publicationSetOutput,
                results,
                interruption: { signal },
                ...(recoveryCmd === undefined
                  ? {}
                  : {
                      recovery: {
                        description:
                          "Verify or re-publish the items the interruption left unsettled.",
                        cmd: recoveryCmd,
                        remainingItems: recoverySelection.remainingItems,
                        blockedDependents: recoverySelection.blockedDependents,
                      },
                    }),
              });
              // Inside the mask: the completion event lands before the die
              // releases the pending interrupt.
              yield* recordCommandCompletion(exitCode);
              return yield* Effect.die(effectCliExit(exitCode));
            })
          : Effect.failCause(cause),
      ),
    ),
  );
  const planBlocking = resolution.blocking;
  const planFailed = planBlocking !== undefined || resolution.failure !== undefined;
  const staleCandidate = planBlocking?.class === "stale-candidate";
  const planFailureCode: AppErrorCode =
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
  const unresolvedOutputs = yield* Ref.get(unresolvedSettlements);
  const failedStepErrors = resolution.units.flatMap((unit) =>
    unit.state === "failed" && unit.error !== undefined ? [publishStepAppError(unit.error)] : [],
  );
  const baseResults = preflightResults;
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
        const unresolved =
          candidate === undefined ? undefined : unresolvedOutputs.get(publishTargetKey(candidate));
        if (unresolved?.status === "unknown") {
          return {
            ...result,
            phase: "upload_execution",
            reason: unresolved.reason,
            status: "unknown",
            settlement: unresolved.settlement,
            message:
              "The Registry may have committed this version, but bounded readback and one exact replay could not prove the outcome.",
          };
        }
        const unitError = unit.error === undefined ? undefined : publishStepAppError(unit.error);
        const failedResult: PublishResultItem = {
          id: result.id,
          owner: result.owner,
          type: result.type,
          name: result.name,
          ...(result.version === undefined ? {} : { version: result.version }),
          ...(result.sourceType === undefined ? {} : { sourceType: result.sourceType }),
          ...(result.authored === undefined ? {} : { authored: result.authored }),
          ...(result.archive === undefined ? {} : { archive: result.archive }),
          action: "error",
          phase: "upload_execution",
          reason:
            unitError?.metadata?.response?.problemCode === "publish/precondition-changed"
              ? "publish_precondition_changed"
              : unitError?.code === "conflict"
                ? "integrity_conflict"
                : "upload_failed",
          status: "failed",
          ...(unit.message === undefined ? {} : { message: unit.message }),
          ...(unitError === undefined ? {} : { cause: publicPublishCause(unitError) }),
        };
        return failedResult;
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
    results = baseResults.map((result) =>
      result.action === "publish" ? { ...result, status: "pending" } : result,
    );
  }
  const recoverySelection = publishRecoverySelection(results);
  const recoveryExecution =
    applyExecuted && recoverySelection.remainingItems.length > 0
      ? yield* makePlanExecution(
          args,
          makeExactPublishRecovery(args, recoverySelection.remainingItems),
        )
      : undefined;
  const partialRecovery =
    recoveryExecution !== undefined && "approvalRecovery" in recoveryExecution
      ? renderConfirmationRecoveryCommand(recoveryExecution.approvalRecovery)
      : undefined;
  const authorizedPublicationPreview = authorizationOutput?.preview;
  const finalPublicationSetOutput =
    authorizedPublicationPreview === undefined
      ? publicationSetOutput
      : publicationSetResult({
          candidates,
          preview: authorizedPublicationPreview,
          ...(authorizedPublicationPreview.status === "blocked" && planFailed
            ? {
                blockedError:
                  resolution.failure === undefined
                    ? makeAppError({
                        code: planFailureCode,
                        detail: "The reviewed publication set was blocked before upload.",
                      })
                    : publishStepAppError(resolution.failure),
              }
            : {}),
        });
  const emitted = yield* emitPublishResult(
    "publish",
    {
      mode: args.preview ? "preview" : "apply",
      ...(authenticationPreconditions.length === 0
        ? {}
        : { preconditions: authenticationPreconditions }),
      selection: selectionOutput,
      publicationSet: finalPublicationSetOutput,
      results,
      ...(partialRecovery === undefined
        ? {}
        : {
            recovery: {
              description: "Continue the failed items and their blocked dependents",
              cmd: partialRecovery,
              remainingItems: recoverySelection.remainingItems,
              blockedDependents: recoverySelection.blockedDependents,
            },
          }),
      ...(planFailed && !args.preview
        ? {
            failure:
              staleCandidate || resolution.failure === undefined
                ? publicPublishCause(
                    makeAppError({
                      code: planFailureCode,
                      detail: staleCandidate
                        ? "Workspace material changed after authorization; no upload was attempted."
                        : `Publish execution did not start: ${planFailureReason}.`,
                    }),
                  )
                : publicPublishCause(publishStepAppError(resolution.failure)),
          }
        : {}),
    },
    planFailed ? { suggestions: resolution.suggestions ?? [] } : undefined,
  );
  const failed = results.filter((result) => result.status === "failed");
  if (planFailed && !args.preview) {
    const failure = makeAppError({
      code: planFailureCode,
      detail: staleCandidate
        ? "Workspace material changed after authorization; no upload was attempted."
        : (resolution.failure?.detail ?? `Publish execution did not start: ${planFailureReason}.`),
      suggestions: resolution.suggestions ?? [],
    });
    return emitted ? yield* Effect.die(effectCliExit(exitCodeFor(failure.code))) : yield* failure;
  }
  if (failed.length > 0) {
    const failure = aggregatePublishFailure(failed.length, [
      ...preflightErrors,
      ...failedStepErrors,
    ]);
    return emitted ? yield* Effect.die(effectCliExit(exitCodeFor(failure.code))) : yield* failure;
  }
});

export const handleRootPublish = Effect.fn("Publish.handle")(function* (
  args: RootPublishHandlerArgs,
) {
  const renderer = yield* CliRenderer;
  const registry = yield* renderer.withSpinner(
    "Resolving publish registry",
    () => resolveTargetRegistry(args.registry, args.registryUrl),
    { successMessage: "Resolved publish registry" },
  );
  yield* runPublish(args, registry);
});

const publishConfig = {
  selectors: Argument.string("extension").pipe(
    Argument.withDescription("FQNs or type-qualified extension selectors"),
    Argument.atLeast(0),
  ),
  owner: Flag.string("owner").pipe(Flag.withDescription("Filter by owner"), Flag.atLeast(0)),
  type: Flag.choice("type", selectableTypes).pipe(
    Flag.withDescription("Filter by extension type"),
    Flag.atLeast(0),
  ),
  exclude: Flag.string("exclude").pipe(
    Flag.withDescription("Exclude a matching selector"),
    Flag.atLeast(0),
  ),
  registry: Flag.string("registry").pipe(
    Flag.withDescription("Target a specific named registry"),
    Flag.optional,
  ),
  registryUrl: Flag.string("registry-url").pipe(
    Flag.withDescription("Override the target registry URL for automation"),
    Flag.optional,
  ),
  onExisting: onExistingFlag,
  backfill: backfillFlag,
  visibility: Flag.choice("visibility", ["public", "private"] as const).pipe(
    Flag.withDescription("Initial visibility for every new extension in the selection"),
    Flag.optional,
  ),
  yes: yesFlag.pipe(Flag.withDescription("Publish without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Preflight without uploading")),
  includeDependencies: Flag.boolean("include-dependencies").pipe(
    Flag.withDescription("Include workspace-sourced dependencies of selected packs"),
    Flag.withDefault(false),
  ),
} as const;

export const publishCommand = Command.make("publish", publishConfig, (parsed) =>
  handleRootPublish({
    selectors: [...parsed.selectors],
    owners: [...parsed.owner],
    types: [...parsed.type],
    excludes: [...parsed.exclude],
    registry: parsed.registry,
    registryUrl: parsed.registryUrl,
    onExisting: parsed.onExisting,
    backfill: parsed.backfill,
    yes: parsed.yes,
    preview: parsed.preview,
    scope: "project",
    visibility: parsed.visibility,
    includeDependencies: parsed.includeDependencies,
  }).pipe(withWorkspace("project"), withRuntime("publish")),
).pipe(
  withArgvTracking(publishConfig),
  Command.withDescription(
    "Publish project-workspace extensions to a registry (archive policy: axm help publish)",
  ),
  Command.withExamples([
    { command: "axm publish", description: "Publish every workspace-sourced extension" },
    {
      command: "axm publish --owner @acme --on-existing verify --yes",
      description: "Idempotently publish an authored catalog",
    },
    {
      command: "axm publish @acme/skills/code-review",
      description: "Publish one workspace-authored extension explicitly",
    },
  ]),
);
