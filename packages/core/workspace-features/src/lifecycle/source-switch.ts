/** Cross-authority install classification and preview evidence. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { manifestFilenameForType } from "@agentxm/extension-content";
import {
  PublishOptionsSchema,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions/common";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  acceptedCanonicalObservation,
  acceptedResolutionRef,
  computeMaterializedTreeIntegrity,
  WorkspaceLocation,
} from "@agentxm/workspace-kernel/workspace-state";
import { SourceHostProviders, observeGitIgnoreInputs } from "@agentxm/workspace-kernel/sources";
import {
  type JobStepArtifact,
  type PackMemberSourceSwitchEndpoint,
  type PackMemberSourceSwitchEvidence,
  type Plan,
  type PlanRiskCondition,
  type PlannedJobStep,
  type SourceSwitchEndpoint,
  type SourceSwitchEvidence,
  type SourceSwitchFamily,
  type ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import type { PrepareInstallRequirements } from "./install/vocabulary.js";
import { sourceResolutionRefused } from "@agentxm/workspace-kernel/reconciliation";
import {
  computeDistributionTreeIntegrity,
  resolveFileSelection,
} from "@agentxm/workspace-kernel/acquisition";

export const SOURCE_SWITCH_CONDITION_ID = "source-authority-change";
const SOURCE_SWITCH_STATE_CONDITION_ID = "source-switch-current-state";

const REGISTRY_GUARANTEES = [
  "publisher epoch",
  "yank filtering",
  "minimum-release-age holds",
  "deprecation notices",
  "purge enforcement",
] as const;

const sourceFamily = (ref: ExtensionRef): SourceSwitchFamily => {
  switch (ref.refType) {
    case "http":
      return "http";
    case "registry":
      return "registry";
    case "git-hosted":
      return "git";
    case "local":
      return "path";
    case "workspace":
      throw new TypeError("Workspace refs do not participate in acquired source switches");
  }
};

const publicUrl = (value: URL): string => {
  const url = new URL(value.href);
  url.username = "";
  url.password = "";
  for (const key of url.searchParams.keys()) {
    if (/(?:auth|key|password|secret|signature|token)/iu.test(key)) {
      url.searchParams.set(key, "[REDACTED]");
    }
  }
  return url.href;
};

const sourceLocator = (ref: ExtensionRef, path: Path.Path, baseDir: string): string => {
  switch (ref.refType) {
    case "http":
      return `${publicUrl(ref.source.url)}#skill=${encodeURIComponent(ref.source.entry ?? ref.sourcePath)}`;
    case "registry":
      return publicUrl(ref.source.location);
    case "git-hosted": {
      const selectedPath = ref.sourcePath ?? ".";
      return `${publicUrl(ref.source.url)}${selectedPath === "." ? "" : `//${selectedPath}`}`;
    }
    case "local":
      return path.resolve(baseDir, ref.sourcePath ?? ref.source.path);
    case "workspace":
      throw new TypeError("Workspace refs do not participate in acquired source switches");
  }
};

const sourceResolution = (ref: ExtensionRef, treeIntegrity: string): string => {
  switch (ref.refType) {
    case "http":
      return ref.snapshot.format === "files"
        ? `files ${ref.snapshot.files.map((file) => `${file.path} ${file.digest}`).join("; ")}`
        : ref.snapshot.digest;
    case "registry":
      return `version ${ref.version}`;
    case "git-hosted":
      return `commit ${ref.gitCommitSha}; tree ${ref.gitTreeSha}`;
    case "local":
      return `tree ${treeIntegrity}`;
    case "workspace":
      throw new TypeError("Workspace refs do not participate in acquired source switches");
  }
};

const sourceIdentity = (ref: ExtensionRef): string =>
  `${ref.owner ?? "@portable"}/${toExtensionTypePlural(ref.type)}/${ref.name}`;

const packMemberEndpoint = (
  ref: ExtensionRef,
  path: Path.Path,
  baseDir: string,
): PackMemberSourceSwitchEndpoint => {
  switch (ref.refType) {
    case "http":
      return {
        family: "http",
        locator: sourceLocator(ref, path, baseDir),
        resolution: sourceResolution(ref, ""),
      };
    case "registry":
      return {
        family: "registry",
        locator: publicUrl(ref.source.location),
        resolution: `version ${ref.version}`,
      };
    case "git-hosted":
      return {
        family: "git",
        locator: sourceLocator(ref, path, baseDir),
        resolution: `commit ${ref.gitCommitSha}; tree ${ref.gitTreeSha}`,
      };
    case "local":
      return {
        family: "path",
        locator: sourceLocator(ref, path, baseDir),
        resolution: `path ${sourceLocator(ref, path, baseDir)}`,
      };
    case "workspace":
      return {
        family: "workspace",
        locator: `workspace:${ref.scope}`,
        resolution: `version ${ref.version}; tree ${ref.sourceHash}`,
      };
  }
};

const classifyPackMembers = (
  previousPack: ExtensionRef,
  currentMembers: ReadonlyArray<{ readonly ref: ExtensionRef; readonly retained: boolean }>,
  targetMembers: ReadonlyArray<ExtensionRef>,
): Effect.Effect<
  ReadonlyArray<PackMemberSourceSwitchEvidence>,
  ExtensionLifecycleFailed,
  PrepareInstallRequirements
> =>
  Effect.gen(function* () {
    if (previousPack.type !== "pack") {
      return yield* installRefused({
        category: "internal",
        detail: `${sourceIdentity(previousPack)} is not a Pack source-switch root`,
      });
    }
    const path = yield* Path.Path;
    const location = yield* WorkspaceLocation;
    const identities = [
      ...new Set([
        ...currentMembers.map(({ ref }) => sourceIdentity(ref)),
        ...targetMembers.map(sourceIdentity),
      ]),
    ].sort();

    return identities.map((member): PackMemberSourceSwitchEvidence => {
      const current = currentMembers.find(({ ref }) => sourceIdentity(ref) === member);
      const target = targetMembers.find((ref) => sourceIdentity(ref) === member);
      const before =
        current === undefined ? undefined : packMemberEndpoint(current.ref, path, location.baseDir);
      const after =
        target === undefined ? undefined : packMemberEndpoint(target, path, location.baseDir);
      if (current === undefined && after !== undefined) {
        return { member, disposition: "added", after };
      }
      if (target === undefined && before !== undefined) {
        return current?.retained === true
          ? { member, disposition: "retained", before, after: before }
          : { member, disposition: "removed", before };
      }
      if (before === undefined || after === undefined) {
        throw new TypeError(`Pack member ${member} did not have a classifiable source transition`);
      }
      if (before.family !== after.family || before.locator !== after.locator) {
        return { member, disposition: "source-changed", before, after };
      }
      if (before.resolution !== after.resolution) {
        return { member, disposition: "version-changed", before, after };
      }
      return { member, disposition: "unchanged", before, after };
    });
  });

const ComparableManifestSchema = Schema.Struct({ publish: Schema.optional(Schema.Unknown) });

const comparableTreeIntegrity = (
  directory: string,
  ref: ExtensionRef,
  compareWithRegistry: boolean,
  originalFiles?: { readonly directory: string; readonly publicationBoundaryRoot?: string },
): Effect.Effect<string, ExtensionLifecycleFailed, PrepareInstallRequirements> =>
  Effect.gen(function* () {
    if (!compareWithRegistry) {
      return yield* computeMaterializedTreeIntegrity(directory).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "validation",
            detail: `The target tree for ${sourceIdentity(ref)} could not be compared`,
            cause,
          }),
        ),
      );
    }
    if (ref.refType === "registry") {
      return yield* computeDistributionTreeIntegrity(directory).pipe(
        Effect.mapError((cause) =>
          installRefused({ category: "validation", detail: cause.detail, cause }),
        ),
      );
    }
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const raw = yield* fs
      .readFileString(path.join(directory, manifestFilenameForType(ref.type)))
      .pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "validation",
            detail: "Cannot read distribution manifest for source switch.",
            cause,
          }),
        ),
      );
    const manifest = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ComparableManifestSchema),
    )(raw).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "validation",
          detail: "Invalid distribution manifest for source switch.",
          cause,
        }),
      ),
    );
    const options =
      manifest.publish === undefined
        ? undefined
        : yield* Schema.decodeUnknownEffect(PublishOptionsSchema, { onExcessProperty: "error" })(
            manifest.publish,
          ).pipe(
            Effect.mapError((cause) =>
              installRefused({
                category: "validation",
                detail: "Invalid publication policy for source switch.",
                cause,
              }),
            ),
          );
    const context =
      options?.include === undefined
        ? yield* Effect.gen(function* () {
            const providers = yield* SourceHostProviders;
            const files =
              originalFiles ??
              (yield* providers.fetch(ref).pipe(Effect.mapError(sourceResolutionRefused)));
            if (files.publicationBoundaryRoot === undefined) {
              return yield* installRefused({
                category: "validation",
                detail:
                  "Distribution context unavailable: the original source's ancestor ignore policy was not retained; content equivalence cannot be established.",
              });
            }
            return yield* observeGitIgnoreInputs({
              packageRoot: files.directory,
              boundaryRoot: files.publicationBoundaryRoot,
            }).pipe(
              Effect.mapError((cause) =>
                installRefused({ category: "validation", detail: cause.detail, cause }),
              ),
            );
          })
        : undefined;
    const selection = resolveFileSelection({
      packageDirectory: context?.packageDirectory ?? "",
      gitignore: context?.rules ?? [],
      ...(options?.include === undefined ? {} : { include: options.include }),
      ...(options?.exclude === undefined ? {} : { exclude: options.exclude }),
      manifest: manifestFilenameForType(ref.type),
    });
    if (!selection.evaluate({ path: manifestFilenameForType(ref.type), kind: "file" }).included)
      return yield* installRefused({
        category: "validation",
        detail: "The distribution excludes its required manifest.",
      });
    return yield* computeDistributionTreeIntegrity(directory, selection).pipe(
      Effect.mapError((cause) =>
        installRefused({ category: "validation", detail: cause.detail, cause }),
      ),
    );
  });

const proposedTreeIntegrity = (
  ref: ExtensionRef,
  compareWithRegistry: boolean,
): Effect.Effect<string, ExtensionLifecycleFailed, PrepareInstallRequirements> =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const files = yield* providers
      .fetch(ref)
      .pipe(Effect.mapError((cause) => sourceResolutionRefused(cause)));
    return yield* comparableTreeIntegrity(files.directory, ref, compareWithRegistry, files);
  });

const endpoint = (
  ref: ExtensionRef,
  treeIntegrity: string,
  path: Path.Path,
  baseDir: string,
): SourceSwitchEndpoint => ({
  family: sourceFamily(ref),
  locator: sourceLocator(ref, path, baseDir),
  resolution: sourceResolution(ref, treeIntegrity),
  treeIntegrity,
});

const switchArtifact = (
  artifact: JobStepArtifact | undefined,
  fallback: JobStepArtifact,
  evidence: SourceSwitchEvidence,
): JobStepArtifact => ({ ...(artifact ?? fallback), sourceSwitch: evidence });

const attachEvidence = <R, O>(
  step: Exclude<PlannedJobStep<R, O>, { readonly readiness: "error" }>,
  fallbackArtifact: JobStepArtifact,
  evidence: SourceSwitchEvidence,
): PlannedJobStep<R, O> => {
  const artifact = switchArtifact(step.artifact, fallbackArtifact, evidence);
  const warning = `Source authority changes from ${evidence.before.family} to ${evidence.after.family}`;
  const run = step.run.pipe(
    Effect.map((result) =>
      result.result === "error"
        ? result
        : {
            ...result,
            artifact: switchArtifact(result.artifact, fallbackArtifact, evidence),
          },
    ),
  );
  return step.readiness === "warn"
    ? { ...step, artifact, warnMessage: `${step.warnMessage}; ${warning}`, run }
    : { ...step, readiness: "warn", artifact, warnMessage: warning, run };
};

const blockedStep = <R, O>(
  step: PlannedJobStep<R, O>,
  artifact: JobStepArtifact,
  detail: string,
): PlannedJobStep<R, O> => ({
  ...(step.key === undefined ? {} : { key: step.key }),
  ...(step.dependsOn === undefined ? {} : { dependsOn: step.dependsOn }),
  ...(step.materialPaths === undefined ? {} : { materialPaths: step.materialPaths }),
  readiness: "error",
  label: step.label,
  errorMessage: detail,
  artifact,
  ...(step.agentOutcomes === undefined ? {} : { agentOutcomes: step.agentOutcomes }),
  ...(step.registryLifecycle === undefined ? {} : { registryLifecycle: step.registryLifecycle }),
  ...(step.registryBinding === undefined ? {} : { registryBinding: step.registryBinding }),
  ...(step.sourceBinding === undefined ? {} : { sourceBinding: step.sourceBinding }),
  blockingConditionIds: [SOURCE_SWITCH_STATE_CONDITION_ID],
});

/** Classify every acquired install proposal against the accepted source authority. */
export const withSourceSwitches = <R, O>(
  plan: Plan<R, O>,
): Effect.Effect<Plan<R, O>, ExtensionLifecycleFailed, PrepareInstallRequirements | R> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const conditions: Array<PlanRiskCondition> = [];
    const jobs: Array<Plan<R, O>["jobs"][number]> = [];

    for (const job of plan.jobs) {
      const steps: Array<PlannedJobStep<R, O>> = [];
      for (const step of job.steps) {
        const proposal = step.sourceBinding;
        if (proposal === undefined || proposal.ref.refType === "workspace") {
          steps.push(step);
          continue;
        }
        const current = yield* acceptedCanonicalObservation({
          type: proposal.extensionType,
          name: proposal.target,
        }).pipe(
          Effect.mapError((cause) =>
            installRefused({
              category: "internal",
              detail: `The accepted source for ${proposal.target} could not be inspected`,
              cause,
            }),
          ),
        );
        const previous = yield* acceptedResolutionRef({
          type: proposal.extensionType,
          name: proposal.target,
        }).pipe(
          Effect.mapError((cause) =>
            installRefused({
              category: "internal",
              detail: `The accepted source for ${proposal.target} could not be reconstructed`,
              cause,
            }),
          ),
        );
        if (
          Option.isNone(current) ||
          current.value.accepted === undefined ||
          Option.isNone(previous) ||
          sourceLocator(previous.value, path, location.baseDir) ===
            sourceLocator(proposal.ref, path, location.baseDir)
        ) {
          steps.push(step);
          continue;
        }

        const existingArtifact: JobStepArtifact = {
          path:
            current.value.observation.path === undefined
              ? proposal.target
              : path.relative(location.baseDir, current.value.observation.path),
          scope: location.scope,
          change: "updated",
        };
        const identityChanged = sourceIdentity(previous.value) !== sourceIdentity(proposal.ref);
        const acceptedPath = current.value.observation.path;
        const unusable =
          current.value.observation.status !== "usable" || acceptedPath === undefined;
        if (identityChanged || unusable || acceptedPath === undefined) {
          const detail = identityChanged
            ? `Source switch refused because ${sourceIdentity(previous.value)} and ${sourceIdentity(proposal.ref)} are different extension identities`
            : `Source switch refused because the accepted ${sourceFamily(previous.value)} content is ${current.value.observation.status}; repair or restore it before replacement`;
          conditions.push({
            level: "blocked",
            id: SOURCE_SWITCH_STATE_CONDITION_ID,
            detail,
            errorCode: "conflict",
          });
          steps.push(blockedStep(step, existingArtifact, detail));
          continue;
        }

        const compareWithRegistry =
          sourceFamily(previous.value) === "registry" || sourceFamily(proposal.ref) === "registry";
        const beforeTree = compareWithRegistry
          ? yield* comparableTreeIntegrity(acceptedPath, previous.value, true)
          : current.value.accepted.treeIntegrity;
        const afterTree = yield* proposedTreeIntegrity(proposal.ref, compareWithRegistry);
        const beforeGuarantees: ReadonlyArray<string> =
          sourceFamily(previous.value) === "registry" ? REGISTRY_GUARANTEES : [];
        const afterGuarantees: ReadonlyArray<string> =
          sourceFamily(proposal.ref) === "registry" ? REGISTRY_GUARANTEES : [];
        const packMembers =
          proposal.extensionType === "pack" &&
          proposal.members !== undefined &&
          proposal.previousMembers !== undefined
            ? yield* classifyPackMembers(previous.value, proposal.previousMembers, proposal.members)
            : undefined;
        const added = packMembers?.flatMap((member) =>
          member.disposition === "added" ? [member.member] : [],
        );
        const removed = packMembers?.flatMap((member) =>
          member.disposition === "removed" ? [member.member] : [],
        );
        const changed = packMembers?.flatMap((member) =>
          member.disposition === "source-changed" || member.disposition === "version-changed"
            ? [member.member]
            : [],
        );
        const evidence: SourceSwitchEvidence = {
          before: endpoint(previous.value, beforeTree, path, location.baseDir),
          after: endpoint(proposal.ref, afterTree, path, location.baseDir),
          content: beforeTree === afterTree ? "equivalent" : "changed",
          dependencies:
            packMembers === undefined
              ? { effect: "not-applicable", added: [], removed: [], changed: [] }
              : {
                  effect:
                    (added?.length ?? 0) + (removed?.length ?? 0) + (changed?.length ?? 0) === 0
                      ? "unchanged"
                      : "changed",
                  added: added ?? [],
                  removed: removed ?? [],
                  changed: changed ?? [],
                },
          projections: {
            effect: "reconcile",
            detail: "Reconcile the extension's configured-agent projections from the target source",
          },
          guarantees: {
            gained: afterGuarantees.filter((value) => !beforeGuarantees.includes(value)),
            lost: beforeGuarantees.filter((value) => !afterGuarantees.includes(value)),
          },
          ...(packMembers === undefined ? {} : { packMembers }),
        };
        conditions.push({
          level: "confirmable",
          consent: "interactive-only",
          id: SOURCE_SWITCH_CONDITION_ID,
          detail: `Source authority changes for ${sourceIdentity(proposal.ref)} from ${evidence.before.family} (${evidence.before.locator}) to ${evidence.after.family} (${evidence.after.locator}); content is ${evidence.content}, guarantees gained: ${evidence.guarantees.gained.join(", ") || "none"}, guarantees lost: ${evidence.guarantees.lost.join(", ") || "none"}.`,
        });
        steps.push(
          step.readiness === "error" ? step : attachEvidence(step, existingArtifact, evidence),
        );
      }
      jobs.push({ ...job, steps });
    }

    return conditions.length === 0
      ? plan
      : {
          ...plan,
          jobs,
          riskConditions: [...(plan.riskConditions ?? []), ...conditions],
        };
  });
