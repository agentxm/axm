/** Cross-authority install classification and preview evidence. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { manifestFilenameForType } from "@agentxm/extension-content";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  acceptedCanonicalObservation,
  acceptedResolutionRef,
  computeMaterializedTreeIntegrity,
  WorkspaceLocation,
} from "../desired-state/index.js";
import { isArchivePathIncluded } from "../publishing/index.js";
import { SourceHostProviders } from "../resolution/sources/index.js";
import type {
  JobStepArtifact,
  Plan,
  PlanRiskCondition,
  PlannedJobStep,
  SourceSwitchEndpoint,
  SourceSwitchEvidence,
  SourceSwitchFamily,
} from "../transitions/planning/index.js";
import type { ExtensionLifecycleFailed } from "./errors.js";
import { installRefused, type PrepareInstallRequirements } from "./install/vocabulary.js";

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

const sourceLocator = (ref: ExtensionRef): string => {
  switch (ref.refType) {
    case "registry":
      return publicUrl(ref.source.location);
    case "git-hosted":
      return `${publicUrl(ref.source.url)}${ref.sourcePath === undefined ? "" : `//${ref.sourcePath}`}`;
    case "local":
      return `${ref.source.path}${ref.sourcePath === undefined ? "" : `//${ref.sourcePath}`}`;
    case "workspace":
      throw new TypeError("Workspace refs do not participate in acquired source switches");
  }
};

const sourceResolution = (ref: ExtensionRef, treeIntegrity: string): string => {
  switch (ref.refType) {
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

const parsePublishIgnore = (raw: string): ReadonlyArray<string> => {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !("publish" in parsed)) return [];
  const publish = parsed.publish;
  if (typeof publish !== "object" || publish === null || !("ignore" in publish)) return [];
  return Array.isArray(publish.ignore) && publish.ignore.every((value) => typeof value === "string")
    ? publish.ignore
    : [];
};

const comparableTreeIntegrity = (
  directory: string,
  ref: ExtensionRef,
  compareWithRegistry: boolean,
): Effect.Effect<string, ExtensionLifecycleFailed, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ignore =
      compareWithRegistry && ref.refType !== "registry"
        ? yield* fs.readFileString(path.join(directory, manifestFilenameForType(ref.type))).pipe(
            Effect.mapError((cause) =>
              installRefused({
                category: "validation",
                detail: `The target manifest for ${sourceIdentity(ref)} could not be read for switch preview`,
                cause,
              }),
            ),
            Effect.flatMap((raw) =>
              Effect.try({
                try: () => parsePublishIgnore(raw),
                catch: (cause) =>
                  installRefused({
                    category: "validation",
                    detail: `The target manifest for ${sourceIdentity(ref)} could not be read for switch preview`,
                    cause,
                  }),
              }),
            ),
          )
        : [];
    return yield* computeMaterializedTreeIntegrity(directory, {
      includeFile: (relativePath) => isArchivePathIncluded(relativePath, ignore),
    }).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "validation",
          detail: `The target tree for ${sourceIdentity(ref)} could not be compared`,
          cause,
        }),
      ),
    );
  });

const proposedTreeIntegrity = (
  ref: ExtensionRef,
  compareWithRegistry: boolean,
): Effect.Effect<string, ExtensionLifecycleFailed, PrepareInstallRequirements> =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const files = yield* providers.fetch(ref).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "network",
          detail: `The target source for ${sourceIdentity(ref)} could not be read for switch preview`,
          cause,
        }),
      ),
    );
    return yield* comparableTreeIntegrity(files.directory, ref, compareWithRegistry);
  });

const endpoint = (ref: ExtensionRef, treeIntegrity: string): SourceSwitchEndpoint => ({
  family: sourceFamily(ref),
  locator: sourceLocator(ref),
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
      // A Pack and all of its member steps form one semantic switch closure;
      // pack-specific classification owns that closure rather than treating
      // its members as unrelated leaf switches.
      if (job.steps.some((step) => step.sourceBinding?.extensionType === "pack")) {
        jobs.push(job);
        continue;
      }
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
          sourceLocator(previous.value) === sourceLocator(proposal.ref)
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
        const beforeTree =
          compareWithRegistry && previous.value.refType !== "registry"
            ? yield* comparableTreeIntegrity(acceptedPath, previous.value, true)
            : current.value.accepted.treeIntegrity;
        const afterTree = yield* proposedTreeIntegrity(proposal.ref, compareWithRegistry);
        const beforeGuarantees: ReadonlyArray<string> =
          sourceFamily(previous.value) === "registry" ? REGISTRY_GUARANTEES : [];
        const afterGuarantees: ReadonlyArray<string> =
          sourceFamily(proposal.ref) === "registry" ? REGISTRY_GUARANTEES : [];
        const evidence: SourceSwitchEvidence = {
          before: endpoint(previous.value, beforeTree),
          after: endpoint(proposal.ref, afterTree),
          content: beforeTree === afterTree ? "equivalent" : "changed",
          dependencies: { effect: "not-applicable", added: [], removed: [], changed: [] },
          projections: {
            effect: "reconcile",
            detail: "Reconcile the extension's configured-agent projections from the target source",
          },
          guarantees: {
            gained: afterGuarantees.filter((value) => !beforeGuarantees.includes(value)),
            lost: beforeGuarantees.filter((value) => !afterGuarantees.includes(value)),
          },
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
