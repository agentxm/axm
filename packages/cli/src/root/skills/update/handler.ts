import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import {
  isWorkspaceSourceLocator,
  type RegistrySource,
} from "@agentxm/client-core/unstable/sources";
import {
  resolveSource,
  SourceHostProviders,
} from "@agentxm/client-core/unstable/source-resolution";
import * as Array from "effect/Array";
import type * as Duration from "effect/Duration";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
} from "@agentxm/client-core/unstable/cli-runtime";

import { WorkspaceMutations, configuredRowsByName } from "@agentxm/client-core/unstable/workspace";
import {
  decodeExtensionNameSync,
  parseRegistrySourcePatternParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import {
  createRegistryClient,
  isVersionEntryEligibleAt,
  normalizeReleaseAgeRecords,
  parseMinimumReleaseAge,
  releaseAgeEvidence,
  releaseAgeHoldbackWarning,
  type ReleaseAgeEvaluation,
  type ReleaseAgeRecord,
} from "@agentxm/client-core/unstable/registry";
import type { InstallSkillOperation } from "@agentxm/client-core/unstable/skills";
import { buildUpdatePlan } from "./plan.js";
import { installSkill } from "@agentxm/client-core/unstable/skills";
import {
  previewOrApplyPlan,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { trustRecordKey } from "@agentxm/client-core/unstable/trust";
import type { SkillsLockMap } from "@agentxm/client-core/unstable/lockfile";
import {
  detectHoldbackWarnings,
  resolveConstrainedVersion,
  type PackConstraint,
  type SkillConstraints,
} from "./constraint-resolution.js";
import { emitPlanResolutionResult } from "../../../json-output.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import { makeConfirmationRecovery, makePlanExecution } from "../../shared/confirmation-recovery.js";
import {
  UPDATE_NAME_FILTER_FLAG,
  allUpdateTargetResolutionsFailed,
  resolveUpdateTargets,
} from "../../shared/update-targets.js";
import {
  LIST_INSTALLED_SKILLS,
  REVIEW_REGISTRY_SOURCES,
  SKILL_NAME_RULES,
} from "../../suggested-actions.js";

export interface UpdateHandlerArgs {
  readonly source: Option.Option<string>;
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly force: boolean;
  readonly yes: boolean;
  readonly preview: boolean;
}

type ResolveResult =
  | {
      readonly type: "match";
      readonly ref: SkillExtensionRef;
      readonly versionRange: Option.Option<string>;
      readonly warnings: ReadonlyArray<string>;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
    }
  | {
      readonly type: "skip";
      readonly name: string;
      readonly source: string;
      readonly reason: string;
      readonly holdback?: ReleaseAgeRecord;
    };

type RegistrySkillConstraintResolution =
  | {
      readonly kind: "selected";
      readonly ref: Extract<SkillExtensionRef, { readonly refType: "registry" }>;
      readonly versionRange: Option.Option<string>;
      readonly warnings: ReadonlyArray<string>;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
    }
  | { readonly kind: "policy_held"; readonly record: ReleaseAgeRecord };

const skippedSkillStep = (
  outcome: Extract<ResolveResult, { readonly type: "skip" }>,
): PlannedJobStep => ({
  readiness: "ready",
  label: `Skip ${outcome.name}`,
  run: Effect.succeed({
    result: "success",
    message: outcome.reason,
  } satisfies JobStepResult),
});

const warningMessage = (warnings: ReadonlyArray<string>): string | undefined =>
  warnings.length === 0 ? undefined : warnings.join("; ");

const appendWarningsToResult =
  (warnings: ReadonlyArray<string>) =>
  (result: JobStepResult): JobStepResult => {
    const message = warningMessage(warnings);
    if (message === undefined || result.result === "error") {
      return result;
    }
    return {
      ...result,
      message: result.message.length === 0 ? message : `${result.message}; ${message}`,
    };
  };

const toRegistrySkillPattern = (source: string) => {
  const parsed = parseRegistrySourcePatternParts(source);
  if (parsed === undefined) return Option.none();
  if (parsed.type !== undefined && parsed.type !== "skills") {
    return Option.none();
  }
  return Option.some(parsed);
};

export const handleUpdate = Effect.fn("Update.handle")(function* (args: UpdateHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const sources = yield* SourceHostProviders;
  const renderer = yield* CliRenderer;
  const minimumReleaseAgeText = yield* ws.getMinimumReleaseAge();
  const minimumReleaseAge = parseMinimumReleaseAge(minimumReleaseAgeText);
  if (Option.isNone(minimumReleaseAge)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Invalid minimumReleaseAge "${minimumReleaseAgeText}"`,
      recover: "Use a duration such as 24h, 1440m, or 0s.",
    });
  }
  const releaseAgeEvaluation = {
    minimumReleaseAge: minimumReleaseAge.value,
    evaluatedAt: yield* DateTime.now,
    mode: "enforce",
  } satisfies ReleaseAgeEvaluation;

  // Step 1: Load configured skills and filter to enabled
  const allSkills = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));
  const lockedSkills = yield* ws
    .getLockedSkills()
    .pipe(Effect.catch(() => Effect.succeed<SkillsLockMap>({})));
  const trustState = yield* ws.getTrustState();

  const disabledSkillEntries: ReadonlyArray<Extract<ResolveResult, { readonly type: "skip" }>> =
    Object.entries(allSkills).flatMap(([name, entry]) =>
      entry.enabled === false
        ? [
            {
              type: "skip",
              name,
              source: entry.source,
              reason: `Skipping ${name}: disabled`,
            } satisfies Extract<ResolveResult, { readonly type: "skip" }>,
          ]
        : [],
    );
  const skillEntries: ReadonlyArray<readonly [string, string]> = Object.entries(allSkills).flatMap(
    ([name, entry]) => (entry.enabled ? [[name, entry.source]] : []),
  );

  if (skillEntries.length === 0) {
    yield* emitNoOpOutcome("skills.update", {
      planName: "Update skills",
      planDescription: "Update installed skills",
      message: "No skills installed.",
      suggestions: [LIST_INSTALLED_SKILLS],
    });
    return;
  }

  const targetResolution = yield* resolveUpdateTargets({
    command: "skills.update",
    planName: "Update skills",
    planDescription: "Update installed skills",
    entries: skillEntries,
    source: args.source,
    nameFilters: args.skills,
    nameFilterFlag: UPDATE_NAME_FILTER_FLAG,
    resourceType: "skill",
    resourceLabel: "skill",
    resourceLabelPlural: "skills",
    noSourceMatchSuggestions: [LIST_INSTALLED_SKILLS],
    noNameMatchSuggestions: [
      LIST_INSTALLED_SKILLS,
      { description: "Relax the `--name` filter and try again" },
    ],
  });
  if (targetResolution.type === "no-op") {
    return;
  }
  const filteredEntries = targetResolution.entries;

  // Step 4: Collect pack constraints from installed pack manifests
  const packConstraintMap = yield* collectPackConstraints();

  // Step 5: Re-resolve each source and discover skills

  const findSkillRefs = (
    source: RegistrySource | SkillExtensionRef["source"],
    options: {
      readonly skillNames: ReadonlyArray<string>;
      readonly owner: Option.Option<Handle>;
      readonly versionRange: Option.Option<string>;
      readonly minimumReleaseAge?: Option.Option<Duration.Duration>;
    },
  ) =>
    sources
      .find(source, {
        names: options.skillNames,
        type: "skill",
        owner: options.owner,
        versionRange: options.versionRange,
        ...(options.minimumReleaseAge === undefined
          ? {}
          : { minimumReleaseAge: options.minimumReleaseAge }),
      })
      .pipe(
        Effect.map((refs) =>
          Array.filter(refs, (ref): ref is SkillExtensionRef => ref.type === "skill"),
        ),
      );

  const resolveRegistrySkillWithConstraints = ({
    source,
    owner,
    lookupName,
    userConstraint,
    packConstraints,
    evaluation,
  }: {
    readonly source: RegistrySource;
    readonly owner: Handle;
    readonly lookupName: ExtensionName;
    readonly userConstraint: Option.Option<string>;
    readonly packConstraints: ReadonlyArray<PackConstraint>;
    readonly evaluation: ReleaseAgeEvaluation;
  }) =>
    Effect.gen(function* () {
      const skillFqn = `${owner}/skills/${lookupName}`;
      if (skillFqn === "@agentxm/skills/axm" && packConstraints.length === 0) {
        const compatible = yield* sources.resolveNamedRegistry(source, {
          owner,
          type: "skill",
          name: lookupName,
          versionRange: userConstraint,
          releaseAgeEvaluation: evaluation,
        });
        if (compatible.kind === "not_found") {
          return yield* makeAppError({
            code: "not_found",
            detail: `No compatible Registry release of "${skillFqn}" is available`,
            recover: "Recover with the bundled AXM skill",
            cmd: "axm skills install @agentxm/skills/axm --bundled",
          });
        }
        if (compatible.kind === "version_unsatisfied") {
          return yield* makeAppError({
            code: "conflict",
            detail: `No visible release of "${skillFqn}" satisfies ${compatible.requestedRange}`,
          });
        }
        if (compatible.kind === "policy_held") {
          return Option.some<RegistrySkillConstraintResolution>({
            kind: "policy_held",
            record: {
              reason: "minimum-release-age",
              target: skillFqn,
              dependencyPath: [skillFqn],
              ...(Option.isSome(userConstraint) ? { requestedRange: userConstraint.value } : {}),
              candidateVersion: compatible.candidate.version,
              publishedAt: compatible.candidate.publishedAt,
              eligibleAt: compatible.candidate.eligibleAt,
              minimumReleaseAgeSeconds: compatible.candidate.minimumReleaseAgeSeconds,
            },
          });
        }
        if (compatible.ref.type !== "skill") {
          return yield* makeAppError({
            code: "internal",
            detail: `Registry resolved "${skillFqn}" as a non-skill extension`,
          });
        }
        const holdbacks =
          compatible.newerHeld === undefined
            ? []
            : [
                {
                  reason: "minimum-release-age" as const,
                  target: skillFqn,
                  dependencyPath: [skillFqn],
                  ...(Option.isSome(userConstraint)
                    ? { requestedRange: userConstraint.value }
                    : {}),
                  selectedVersion: compatible.ref.version,
                  candidateVersion: compatible.newerHeld.version,
                  publishedAt: compatible.newerHeld.publishedAt,
                  eligibleAt: compatible.newerHeld.eligibleAt,
                  minimumReleaseAgeSeconds: compatible.newerHeld.minimumReleaseAgeSeconds,
                },
              ];
        return Option.some<RegistrySkillConstraintResolution>({
          kind: "selected",
          ref: compatible.ref,
          versionRange: userConstraint,
          holdbacks,
          warnings:
            compatible.newerHeld === undefined
              ? []
              : [
                  releaseAgeHoldbackWarning({
                    fqn: skillFqn,
                    selectedVersion: compatible.ref.version,
                    heldVersion: compatible.newerHeld.version,
                    minimumReleaseAge: minimumReleaseAgeText,
                  }),
                ],
        });
      }

      const location =
        source.location.protocol === "file:" ? source.location.pathname : source.location.href;
      const client = yield* createRegistryClient(location);
      const indexOption = yield* client.getExtensionIndex({
        owner,
        type: "skill",
        name: lookupName,
      });
      if (Option.isNone(indexOption)) {
        return Option.none<RegistrySkillConstraintResolution>();
      }

      const constraints: SkillConstraints = { userConstraint, packConstraints };
      const [latestEntry] = indexOption.value.versions;
      const latestVersion = latestEntry?.version;
      if (latestVersion === undefined) {
        return yield* makeAppError({
          code: "internal",
          detail: `Registry skill "${skillFqn}" has no published versions`,
          recover: "Publish a skill version first.",
          cmd: "axm skills publish",
        });
      }

      const desiredVersion = resolveConstrainedVersion(
        indexOption.value.versions.map((entry) => entry.version),
        constraints,
        skillFqn,
      );
      if (Option.isNone(desiredVersion)) {
        const constraintLabel = Option.match(userConstraint, {
          onNone: () => "the configured constraints",
          onSome: (constraint) => `"${constraint}"`,
        });
        return yield* makeAppError({
          code: "internal",
          detail: `No published version of "${skillFqn}" satisfies ${constraintLabel}`,
          recover: "Relax the version constraint or update the dependent pack constraints",
        });
      }
      const desiredEntry = indexOption.value.versions.find(
        (entry) => entry.version === desiredVersion.value.resolvedVersion,
      );
      if (desiredEntry === undefined) {
        return yield* makeAppError({
          code: "internal",
          detail: `Resolved version "${desiredVersion.value.resolvedVersion}" for "${skillFqn}" is missing from its Registry index`,
        });
      }
      const matureVersions = indexOption.value.versions
        .filter((entry) => isVersionEntryEligibleAt(entry, evaluation))
        .map((entry) => entry.version);
      const resolvedVersion = resolveConstrainedVersion(matureVersions, constraints, skillFqn);
      if (Option.isNone(resolvedVersion)) {
        const evidence = releaseAgeEvidence(desiredEntry, evaluation);
        return Option.some<RegistrySkillConstraintResolution>({
          kind: "policy_held" as const,
          record: {
            reason: "minimum-release-age" as const,
            target: skillFqn,
            dependencyPath: [skillFqn],
            ...(Option.isSome(userConstraint) ? { requestedRange: userConstraint.value } : {}),
            candidateVersion: evidence.version,
            publishedAt: evidence.publishedAt,
            eligibleAt: evidence.eligibleAt,
            minimumReleaseAgeSeconds: evidence.minimumReleaseAgeSeconds,
          },
        });
      }

      const exactRefs = yield* findSkillRefs(source, {
        skillNames: [lookupName],
        owner: Option.some(owner),
        versionRange: Option.some(resolvedVersion.value.resolvedVersion),
        minimumReleaseAge: Option.some(evaluation.minimumReleaseAge),
      });
      const exactRef = exactRefs.find(
        (ref): ref is Extract<SkillExtensionRef, { readonly refType: "registry" }> =>
          ref.refType === "registry" &&
          ref.skill.name === lookupName &&
          ref.version === resolvedVersion.value.resolvedVersion,
      );
      if (exactRef === undefined) {
        return yield* makeAppError({
          code: "internal",
          detail: `Resolved version "${resolvedVersion.value.resolvedVersion}" for "${skillFqn}" could not be rediscovered`,
          recover: "Re-fetch the skill source.",
          cmd: "axm skills install --reinstall <source>",
        });
      }

      const newerHeld =
        desiredEntry.version === resolvedVersion.value.resolvedVersion ||
        isVersionEntryEligibleAt(desiredEntry, evaluation)
          ? []
          : (() => {
              const evidence = releaseAgeEvidence(desiredEntry, evaluation);
              return [
                {
                  reason: "minimum-release-age" as const,
                  target: skillFqn,
                  dependencyPath: [skillFqn],
                  ...(Option.isSome(userConstraint)
                    ? { requestedRange: userConstraint.value }
                    : {}),
                  selectedVersion: resolvedVersion.value.resolvedVersion,
                  candidateVersion: evidence.version,
                  publishedAt: evidence.publishedAt,
                  eligibleAt: evidence.eligibleAt,
                  minimumReleaseAgeSeconds: evidence.minimumReleaseAgeSeconds,
                },
              ];
            })();
      return Option.some<RegistrySkillConstraintResolution>({
        kind: "selected" as const,
        ref: exactRef,
        versionRange: userConstraint,
        holdbacks: newerHeld,
        warnings: [
          ...(newerHeld.length === 0
            ? []
            : [
                releaseAgeHoldbackWarning({
                  fqn: skillFqn,
                  selectedVersion: resolvedVersion.value.resolvedVersion,
                  heldVersion: desiredEntry.version,
                  minimumReleaseAge: minimumReleaseAgeText,
                }),
              ]),
          ...resolvedVersion.value.warnings,
          ...detectHoldbackWarnings(
            latestVersion,
            resolvedVersion.value.resolvedVersion,
            constraints,
            skillFqn,
          ),
        ],
      });
    });

  const decodeConfiguredSkillName = (name: string, _sourceStr: string) =>
    Effect.try({
      try: () => decodeExtensionNameSync(name),
      catch: () =>
        makeAppError({
          code: "validation",
          detail: `Configured skill name "${name}" is invalid`,
          recover: SKILL_NAME_RULES,
        }),
    });

  const results: ReadonlyArray<ResolveResult> = yield* Effect.forEach(
    filteredEntries,
    ([name, sourceStr]) => {
      const configuredRegistryPattern = toRegistrySkillPattern(sourceStr);
      const isOfficialAxmSource = Option.exists(
        configuredRegistryPattern,
        (pattern) => pattern.owner === "@agentxm" && pattern.name === "axm",
      );
      return Effect.gen(function* () {
        if (isWorkspaceSourceLocator(sourceStr)) {
          return {
            type: "skip",
            name,
            source: sourceStr,
            reason: `Skill "${name}" is workspace-sourced and unchanged`,
          } satisfies ResolveResult;
        }
        const source = yield* resolveSource(sourceStr);
        const registryPattern = toRegistrySkillPattern(sourceStr);

        if (source.type === "registry" && Option.isSome(registryPattern)) {
          const lookupName =
            registryPattern.value.name ?? (yield* decodeConfiguredSkillName(name, sourceStr));
          const registryResolved = yield* resolveRegistrySkillWithConstraints({
            source,
            owner: registryPattern.value.owner,
            lookupName,
            userConstraint:
              registryPattern.value.versionRange === undefined
                ? Option.none()
                : Option.some(registryPattern.value.versionRange),
            packConstraints:
              packConstraintMap.get(`${registryPattern.value.owner}/skills/${lookupName}`) ?? [],
            evaluation: releaseAgeEvaluation,
          });
          if (Option.isSome(registryResolved)) {
            if (registryResolved.value.kind === "policy_held") {
              return {
                type: "skip",
                name,
                source: sourceStr,
                reason: `Skill "${name}" is held by minimumReleaseAge until ${registryResolved.value.record.eligibleAt}`,
                holdback: registryResolved.value.record,
              } satisfies ResolveResult;
            }
            return {
              type: "match",
              ref: registryResolved.value.ref,
              versionRange: registryResolved.value.versionRange,
              warnings: registryResolved.value.warnings,
              holdbacks: registryResolved.value.holdbacks,
            } satisfies ResolveResult;
          }
        }

        const requestedOwner = Option.match(registryPattern, {
          onNone: () => Option.none<Handle>(),
          onSome: (pattern) => Option.some(pattern.owner),
        });

        const namedRefs = yield* findSkillRefs(source, {
          skillNames: [name],
          owner: requestedOwner,
          versionRange: Option.none(),
          minimumReleaseAge: Option.some(releaseAgeEvaluation.minimumReleaseAge),
        });
        const skillRef = namedRefs.find((r) => r.skill.name === name);

        if (skillRef) {
          return {
            type: "match",
            ref: skillRef,
            versionRange: Option.none(),
            warnings: [],
            holdbacks: [],
          } satisfies ResolveResult;
        }

        return {
          type: "skip",
          name,
          source: sourceStr,
          reason: `Skill "${name}" not found in source ${sources.origin(source)}`,
        } satisfies ResolveResult;
      }).pipe(
        Effect.catch((error) =>
          isOfficialAxmSource
            ? Effect.fail(error)
            : Effect.succeed({
                type: "skip",
                name,
                source: sourceStr,
                reason: `Failed to resolve "${name}": ${String(error)}`,
              } satisfies ResolveResult),
        ),
      );
    },
    { concurrency: "unbounded" },
  );

  // Step 6: Collect successful resolutions
  const resolved = results.filter(
    (result): result is Extract<ResolveResult, { readonly type: "match" }> =>
      result.type === "match",
  );
  const skipped = results.filter(
    (result): result is Extract<ResolveResult, { readonly type: "skip" }> => result.type === "skip",
  );
  if (
    resolved.length === 0 &&
    Option.isSome(args.source) &&
    skipped.length > 0 &&
    skipped.every((item) => !isWorkspaceSourceLocator(item.source) && item.holdback === undefined)
  ) {
    return yield* allUpdateTargetResolutionsFailed({
      resourceLabelPlural: "skill",
      recover: REVIEW_REGISTRY_SOURCES.description,
      cmd: REVIEW_REGISTRY_SOURCES.cmd,
    });
  }
  if (resolved.length === 0 && skipped.length === 0) {
    return yield* allUpdateTargetResolutionsFailed({
      resourceLabelPlural: "skill",
      recover: REVIEW_REGISTRY_SOURCES.description,
      cmd: REVIEW_REGISTRY_SOURCES.cmd,
    });
  }

  const warningsBySkill = new Map<string, ReadonlyArray<string>>();
  for (const item of resolved) {
    const trusted = trustState.records[trustRecordKey("skill", item.ref.skill.name)];
    const lockedEpoch = trusted?.authority === "registry" ? trusted.publisherBindingId : undefined;
    const resolvedEpoch = item.ref.refType === "registry" ? item.ref.publisherBindingId : undefined;
    const publisherEpochChanged =
      trusted?.authority === "registry" &&
      item.ref.refType === "registry" &&
      lockedEpoch !== resolvedEpoch;
    if (publisherEpochChanged && args.yes) {
      return yield* makeAppError({
        code: "validation",
        detail: `Unattended update refused for ${item.ref.owner}/skills/${item.ref.name}: publisher epoch changed from ${lockedEpoch} to ${resolvedEpoch}`,
        recover: "Run the update interactively, verify the publisher change, and confirm the plan.",
      });
    }

    const warnings = publisherEpochChanged
      ? [
          `Publisher identity changed (${lockedEpoch} → ${resolvedEpoch}); confirm only if you trust the current publisher`,
          ...item.warnings,
        ]
      : item.warnings;
    if (warnings.length > 0) {
      warningsBySkill.set(item.ref.skill.name, warnings);
    }
  }

  // Step 8: Build operations
  const ops = resolved.map((item) => {
    const existingLock = lockedSkills[item.ref.skill.name];
    const existingInstalledAt = Option.fromUndefinedOr(existingLock?.installedAt);
    return {
      name: "install-skill",
      args: {
        ref: item.ref,
        force: args.force,
        versionRange: item.versionRange,
        skipSettings: Option.none(),
        strictUnknownAgents: Option.none(),
        existingInstalledAt,
        sourceName: Option.none(),
      },
    } satisfies InstallSkillOperation;
  });

  // Step 9: Capture services for run closures
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;

  const toJobStepResult = (result: {
    readonly result: string;
    readonly message: string;
    readonly error?: import("@agentxm/client-core/unstable/app-error").AppError;
  }): import("@agentxm/client-core/unstable/plan").JobStepResult =>
    result.result === "error" && result.error != null
      ? { result: "error", message: result.message, error: result.error }
      : { result: "success", message: result.message };

  const makeRunClosure: import("./plan.js").MakeRunClosure = (op) =>
    installSkill(op).pipe(
      Effect.map(toJobStepResult),
      Effect.map(appendWarningsToResult(warningsBySkill.get(op.args.ref.skill.name) ?? [])),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(CliRenderer, renderer),
      Effect.provideService(SourceHostProviders, sources),
      Effect.provideService(CodingAgentRepository, agentRepo),
    );

  // Step 10: Build plan
  const rawPlan = buildUpdatePlan(
    ops,
    trustState,
    "Update skills",
    Option.some("Update installed skills"),
    makeRunClosure,
  );
  const basePlan =
    warningsBySkill.size === 0
      ? rawPlan
      : {
          ...rawPlan,
          sections: [
            ...(rawPlan.sections ?? []),
            {
              title: "Publisher ownership changes",
              items: [...warningsBySkill.entries()].flatMap(([name, warnings]) =>
                warnings
                  .filter((warning) => warning.startsWith("Publisher identity changed"))
                  .map((warning) => `${name}: ${warning}`),
              ),
            },
          ],
        };
  const basePlanWithWarnings: Plan = {
    ...basePlan,
    releaseAge: {
      evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
      holdbacks: normalizeReleaseAgeRecords([
        ...resolved.flatMap((item) => item.holdbacks),
        ...skipped.flatMap((item) => (item.holdback === undefined ? [] : [item.holdback])),
      ]),
      bypasses: [],
    },
    jobs: basePlan.jobs.map((job) => ({
      ...job,
      steps: job.steps.map((step) => {
        if (step.readiness !== "ready") {
          return step;
        }
        const message = warningMessage(warningsBySkill.get(step.label) ?? []);
        return message === undefined ? step : { ...step, message };
      }),
    })),
  };
  const skippedSteps = [
    ...skipped.filter((item) => item.holdback === undefined),
    ...disabledSkillEntries,
  ].map((item) => skippedSkillStep(item));
  const [firstJob, ...restJobs] = basePlanWithWarnings.jobs;
  const plan: Plan =
    skippedSteps.length === 0
      ? basePlanWithWarnings
      : firstJob === undefined
        ? { ...basePlanWithWarnings, jobs: [{ concurrency: 1, steps: skippedSteps }] }
        : {
            ...basePlanWithWarnings,
            jobs: [{ ...firstJob, steps: [...firstJob.steps, ...skippedSteps] }, ...restJobs],
          };

  // Step 11: Resolve plan
  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["skills", "update"],
      [
        recoverySwitch("--ignore-version-constraints", args.force),
        ...args.agents.map((agent) => recoveryOption("--agent", publicRecoveryValue(agent))),
        ...args.skills.map((skill) => recoveryOption("--name", publicRecoveryValue(skill))),
        ...Option.match(args.source, {
          onNone: () => [],
          onSome: (source) => [recoveryPositional(credentialFreeLocatorRecoveryValue(source))],
        }),
      ],
    ),
    args.force ? ["ignore-version-constraints"] : [],
  );
  const publisherOwnershipChanged = [...warningsBySkill.values()].some((warnings) =>
    warnings.some((warning) => warning.startsWith("Publisher identity changed")),
  );
  const executionPlan: Plan = {
    ...plan,
    riskConditions: [
      ...(plan.riskConditions ?? []),
      ...(publisherOwnershipChanged
        ? [
            {
              level: "confirmable" as const,
              id: "publisher-ownership-change",
              detail: "One or more skills changed publisher identity.",
            },
          ]
        : []),
      ...(args.force
        ? ([
            {
              level: "override-required",
              id: "ignore-pack-version-constraints",
              policy: "ignore-version-constraints",
              requiredFlag: "--ignore-version-constraints",
              detail: "Allow updates outside version constraints declared by installed packs.",
            },
          ] as const)
        : []),
    ],
  };
  const resolution = yield* previewOrApplyPlan(executionPlan, { execution });
  yield* emitPlanResolutionResult("skills.update", resolution);
});

/** Collect per-skill constraints from the authoritative desired pack graph. */
const collectPackConstraints = () =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const graph = yield* ws.getDesiredStateGraph();
    if (!graph.complete) {
      return yield* makeAppError({
        code: "validation",
        detail: "Cannot update skills while the desired pack graph is incomplete",
      });
    }
    const constraintMap = new Map<string, Array<PackConstraint>>();

    for (const node of graph.nodes) {
      if (node.type !== "skill") continue;
      for (const origin of node.origins) {
        if (origin.type !== "pack" || origin.constraint === "*" || origin.constraint === "") {
          continue;
        }
        const existing = constraintMap.get(node.identity) ?? [];
        existing.push({ packName: origin.pack, constraint: origin.constraint });
        constraintMap.set(node.identity, existing);
      }
    }

    return constraintMap;
  });
