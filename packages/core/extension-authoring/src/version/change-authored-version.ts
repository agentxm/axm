/**
 * Changing the version an authored manifest declares.
 *
 * A version is one field of one manifest the workspace authors, so this use
 * case decides three things: that the named package really is authored here,
 * what the next version is, and that nothing else in the manifest moves. The
 * write runs inside the workspace transaction like every other authoring
 * change, so an interrupted or failed bump restores the manifest rather than
 * leaving a half-written file, and the operation reports the real resolution
 * the transaction settled with.
 *
 * `prepare` reads the manifest, settles `from` and `to`, and writes nothing.
 * `previewOrApply` resolves that candidate; a bump to the version the manifest
 * already carries settles as unchanged rather than rewriting the file.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as semver from "semver";

import { manifestFilenameForType } from "@agentxm/extension-content";
import {
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
  formatFqn,
  parseFqn,
  type ExtensionType,
  type FqnInvalidError,
} from "@agentxm/extension-model/unstable/extensions";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import { VersionSchema, type Version } from "@agentxm/extension-model/unstable/version-constraints";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type CandidateFingerprintFailed,
  type ExecutionCandidate,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlanExecution,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  type ConfiguredAgentOutcomesProvider,
  type LockfileValidationError,
  type WorkspaceLockfileReadFailure,
  type WorkspaceSettingsReadFailure,
} from "@agentxm/workspace-state";
import {
  runWorkspaceTransaction,
  type WorkspaceTransactionScope,
} from "@agentxm/workspace-transactions";

import { authoredDeclaration } from "../authored-declaration.js";
import { AuthoringFailed } from "../errors.js";
import { AuthoringScopeUnsupported } from "../create/errors.js";
import { authoringStepFailure } from "../step-failure.js";
import {
  AuthoredManifestUnavailable,
  authoredManifestUnavailableCategory,
  authoredManifestUnavailableDetail,
  VersionTargetIdentityMismatch,
  VersionTargetInvalid,
  VersionTargetNotAuthored,
  type AuthoredVersionError,
} from "./errors.js";

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

/** The relative bumps a manifest version can take. */
export type VersionBumpRule = "patch" | "minor" | "major" | "prerelease";

/** How the next version is decided: by rule, or stated exactly. */
export type AuthoredVersionChange =
  | { readonly _tag: "Increment"; readonly rule: VersionBumpRule }
  | { readonly _tag: "Exact"; readonly version: string };

export interface ChangeAuthoredVersionRequest {
  /** Owner-qualified identity of the authored package, as the person typed it. */
  readonly fqn: string;
  readonly change: AuthoredVersionChange;
}

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/** What the version step requires when it runs. */
export type ChangeAuthoredVersionRequirements =
  FileSystem.FileSystem | Path.Path | WorkspaceTransactionScope;

/** A settled version change: the manifest is read, the next version decided, nothing written. */
export interface ChangeAuthoredVersionCandidate {
  readonly type: ExtensionType;
  /** Owner-qualified identity, canonically formatted. */
  readonly fqn: string;
  /** Workspace-relative path of the manifest that carries the version. */
  readonly manifestPath: string;
  readonly from: Version;
  readonly to: Version;
  /** Whether the request asks for a version the manifest already declares. */
  readonly unchanged: boolean;
  readonly execution: ExecutionCandidate<ChangeAuthoredVersionRequirements>;
}

/** Every failure settling a version change can surface before anything is written. */
export type ChangeAuthoredVersionFailure =
  | AuthoredVersionError
  | AuthoringScopeUnsupported
  | LockfileValidationError
  | WorkspaceLockfileReadFailure
  | WorkspaceSettingsReadFailure
  | CandidateFingerprintFailed
  | FqnInvalidError;

/** Everything settling a version change reads before it freezes a candidate. */
export type PrepareChangeAuthoredVersionRequirements =
  FileSystem.FileSystem | Path.Path | WorkspaceMutations | ConfiguredAgentOutcomesProvider;

// -----------------------------------------------------------------------------
// Manifest access
// -----------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodeExactVersion = (
  value: unknown,
  manifestPath: string,
): Effect.Effect<Version, AuthoredManifestUnavailable> =>
  Schema.decodeUnknownEffect(VersionSchema)(value).pipe(
    Effect.mapError(
      (cause) => new AuthoredManifestUnavailable({ manifestPath, reason: "invalid", cause }),
    ),
  );

/** Read one authored manifest as its raw text and its decoded object. */
const readManifest = Effect.fn("ChangeAuthoredVersion.readManifest")(function* (args: {
  readonly absolutePath: string;
  readonly manifestPath: string;
  readonly createCommand: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists(args.absolutePath).pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    return yield* new AuthoredManifestUnavailable({
      manifestPath: args.manifestPath,
      reason: "missing",
      createCommand: args.createCommand,
    });
  }
  const content = yield* fs.readFileString(args.absolutePath).pipe(
    Effect.mapError(
      (cause) =>
        new AuthoredManifestUnavailable({
          manifestPath: args.manifestPath,
          reason: "unreadable",
          cause,
        }),
    ),
  );
  const parsed = yield* Effect.try({
    try: (): unknown => JSON.parse(content),
    catch: (cause) =>
      new AuthoredManifestUnavailable({
        manifestPath: args.manifestPath,
        reason: "unparsable",
        cause,
      }),
  });
  if (!isRecord(parsed)) {
    return yield* new AuthoredManifestUnavailable({
      manifestPath: args.manifestPath,
      reason: "invalid",
    });
  }
  return { content, manifest: Object.fromEntries(Object.entries(parsed)) };
});

/**
 * The next version this request asks for.
 *
 * An exact version must itself be an exact version: a range like `^2.0.0`
 * names a set of releases, and a manifest declares one.
 */
const nextVersion = (
  from: Version,
  change: AuthoredVersionChange,
  manifestPath: string,
): Effect.Effect<Version, AuthoredManifestUnavailable | VersionTargetInvalid> => {
  if (change._tag === "Exact") {
    return Schema.decodeUnknownEffect(VersionSchema)(change.version).pipe(
      Effect.mapError(
        () =>
          new VersionTargetInvalid({
            detail: `"${change.version}" is not an exact version`,
            recover: "Pass an exact semver version, for example 1.2.3.",
          }),
      ),
    );
  }
  const incremented = semver.inc(from, change.rule);
  return incremented === null
    ? Effect.fail(
        new VersionTargetInvalid({
          detail: `Version "${from}" cannot take a ${change.rule} bump`,
        }),
      )
    : decodeExactVersion(incremented, manifestPath);
};

/**
 * Inside the transaction the manifest is re-read, so its unavailability
 * becomes an authoring failure the closure reports rather than a refusal the
 * request phase settles.
 */
const manifestUnavailableInClosure = (failure: AuthoredManifestUnavailable): AuthoringFailed =>
  new AuthoringFailed({
    category: authoredManifestUnavailableCategory(failure),
    detail: authoredManifestUnavailableDetail(failure),
    ...(failure.cause === undefined ? {} : { cause: failure.cause }),
  });

/** The plan a version change resolves. */
export const changeAuthoredVersionPlanName = "Update extension version";

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** Settle a version change without writing anything. */
export const prepareChangeAuthoredVersion: (
  request: ChangeAuthoredVersionRequest,
) => Effect.Effect<
  ChangeAuthoredVersionCandidate,
  ChangeAuthoredVersionFailure,
  PrepareChangeAuthoredVersionRequirements
> = Effect.fn("ChangeAuthoredVersion.prepare")(function* (request) {
  const ws = yield* WorkspaceMutations;
  const path = yield* Path.Path;

  const parsed = yield* Effect.fromResult(parseFqn(request.fqn));
  if (ws.layout.scope !== "project") {
    return yield* new AuthoringScopeUnsupported({ subject: "version", scope: ws.layout.scope });
  }
  const fqn = formatFqn(parsed);
  const subject = extensionTypeSentenceLabels[parsed.type];

  // Only a package this workspace declares as its own may have its manifest
  // version changed; an acquired package's version is the publisher's.
  const declaration = authoredDeclaration(ws, parsed.type, parsed.name);
  const configuredSource = yield* declaration.read.pipe(Effect.map((current) => current.source));
  if (Option.isNone(configuredSource) || !isWorkspaceSourceLocator(configuredSource.value)) {
    return yield* new VersionTargetNotAuthored({
      fqn,
      subject,
      ...(Option.isNone(configuredSource) ? {} : { configuredSource: configuredSource.value }),
    });
  }

  const absolutePath = path.join(
    ws.layout.authoredRoot(parsed.type),
    parsed.name,
    manifestFilenameForType(parsed.type),
  );
  const manifestPath = path.relative(ws.baseDir, absolutePath);
  const createCommand = `axm ${extensionTypeToPlural[parsed.type]} new`;
  const { manifest } = yield* readManifest({ absolutePath, manifestPath, createCommand });

  if (
    manifest["owner"] !== parsed.owner ||
    manifest["type"] !== parsed.type ||
    manifest["name"] !== parsed.name
  ) {
    return yield* new VersionTargetIdentityMismatch({ fqn, manifestPath });
  }

  const from = yield* decodeExactVersion(manifest["version"], manifestPath);
  const to = yield* nextVersion(from, request.change, manifestPath);
  const unchanged = from === to;

  const artifact: JobStepArtifact = {
    path: manifestPath,
    scope: ws.scope,
    version: to,
    previousVersion: from,
    change: unchanged ? "unchanged" : "updated",
    ...(unchanged ? {} : { fileCount: 1 }),
  };

  const step: PlannedJobStep<ChangeAuthoredVersionRequirements> = {
    readiness: "ready",
    label: fqn,
    message: `${from} -> ${to}`,
    artifact,
    run: runWorkspaceTransaction({
      targets: [absolutePath],
      transition: Effect.gen(function* () {
        if (unchanged) return;
        const fs = yield* FileSystem.FileSystem;
        // The candidate was settled against the manifest as it was read; a
        // manifest that moved since then is a different decision, so the
        // transaction refuses rather than overwriting the newer content.
        const current = yield* readManifest({ absolutePath, manifestPath, createCommand }).pipe(
          Effect.mapError(manifestUnavailableInClosure),
        );
        const currentVersion = yield* decodeExactVersion(
          current.manifest["version"],
          manifestPath,
        ).pipe(Effect.mapError(manifestUnavailableInClosure));
        if (currentVersion !== from) {
          return yield* new AuthoringFailed({
            category: "conflict",
            detail: `Manifest version changed to ${currentVersion} before the bump could be applied: ${manifestPath}`,
          });
        }
        const newline = current.content.endsWith("\n") ? "\n" : "";
        yield* fs
          .writeFileString(
            absolutePath,
            `${JSON.stringify({ ...current.manifest, version: to }, null, 2)}${newline}`,
          )
          .pipe(
            Effect.mapError(
              (cause) =>
                new AuthoringFailed({
                  category: "internal",
                  detail: `Failed to write manifest: ${manifestPath}`,
                  cause,
                }),
            ),
          );
      }),
      validate: () =>
        Effect.gen(function* () {
          const current = yield* readManifest({ absolutePath, manifestPath, createCommand }).pipe(
            Effect.mapError(manifestUnavailableInClosure),
          );
          const currentVersion = yield* decodeExactVersion(
            current.manifest["version"],
            manifestPath,
          ).pipe(Effect.mapError(manifestUnavailableInClosure));
          if (currentVersion !== to) {
            return yield* new AuthoringFailed({
              category: "internal",
              detail: `Manifest ${manifestPath} declares ${currentVersion} after the bump to ${to}`,
            });
          }
        }),
    }).pipe(
      Effect.mapError(authoringStepFailure),
      Effect.as({
        result: "success",
        message: `Updated ${subject} ${fqn} ${from} -> ${to}`,
        ...(unchanged ? { disposition: "unchanged" } : {}),
        artifact,
      } satisfies JobStepResult),
    ),
  };

  const plan: Plan<ChangeAuthoredVersionRequirements> = {
    _tag: "Plan",
    name: changeAuthoredVersionPlanName,
    description: Option.some(`Set ${fqn} to ${to}`),
    presentation: operationPresentation(
      { imperative: "update", past: "Updated", gerund: "Updating" },
      parsed.type,
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  };

  return {
    type: parsed.type,
    fqn,
    manifestPath,
    from,
    to,
    unchanged,
    execution: yield* prepareExecutionCandidate(plan),
  } satisfies ChangeAuthoredVersionCandidate;
});

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled version change, resolving to one operation outcome. */
export const previewOrApplyChangeAuthoredVersion = (
  candidate: ChangeAuthoredVersionCandidate,
  execution: PlanExecution,
) => resolveExecutionCandidate(candidate.execution, execution);

/** The version-change use case: settle a request, then preview or apply it. */
export const ChangeAuthoredVersion = {
  prepare: prepareChangeAuthoredVersion,
  previewOrApply: previewOrApplyChangeAuthoredVersion,
} as const;
