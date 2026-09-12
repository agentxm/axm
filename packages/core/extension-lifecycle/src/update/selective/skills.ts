/**
 * Advancing the skills a workspace selected.
 *
 * `skills update` re-resolves each selected, enabled skill against the source
 * the workspace declared, then advances the ones whose resolution differs
 * from what was accepted. Two constraints govern the version it lands on: the
 * range the workspace itself recorded, and the ranges every Pack that owns
 * the skill declares. Precedence, not intersection, decides between them —
 * `@agentxm/extension-resolution`'s constraint precedence owns that rule, and
 * this module supplies it the visible version list and carries its warnings
 * onto the plan. A skill that cannot be re-resolved is reported as a skipped
 * unit rather than failing the sweep, so one unreachable source does not stop
 * every other advance.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  decodeExtensionNameSync,
  parseSourceQualifiedRegistrySourcePatternParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import {
  classifyPublisherBindingTransition,
  detectHoldbackWarnings,
  isVersionEntryEligibleAt,
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  publisherTransitionWarning,
  registryBindingProposal,
  releaseAgeEvidence,
  releaseAgeHoldbackWarning,
  resolveConstrainedVersion,
  type PackConstraint,
  type PublisherBindingTransition,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeRecord,
  type UpdateConstraints,
} from "@agentxm/extension-resolution";
import { resolveSource, SourceHostProviders } from "@agentxm/extension-sources";
import { createRegistryClient } from "@agentxm/registry-client";
import {
  operationPresentation,
  prepareExecutionCandidate,
  type ConfiguredAgentOperation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
  type StepFailure,
} from "@agentxm/workspace-operations";
import {
  acceptedResolutionRef,
  configuredRowsByName,
  WorkspaceMutations,
  type SkillsLockMap,
} from "@agentxm/workspace-state";

import { ExtensionLifecycleFailed } from "../../errors.js";
import { withPublisherTrustConditions } from "../../publisher-binding.js";
import { installSkill, type InstallSkillOperation } from "../../skills/operations/install.js";
import { buildSelectiveUpdatePlan, type SelectiveUpdateUnit } from "./plan.js";
import type { SelectiveUpdateStepRequirements } from "./requirements.js";
import {
  selectUpdateTargets,
  type SelectiveUpdateEntry,
  type SelectiveUpdateSelectors,
} from "./selection.js";
import {
  ignoreVersionConstraintsCondition,
  selectiveUpdatePlanName,
  type SelectiveUpdateCandidate,
} from "./vocabulary.js";

const PLAN_NAME = selectiveUpdatePlanName("skill");
const PLAN_DESCRIPTION = "Update installed skills";
const NOTHING_INSTALLED = "No skills installed.";

/** The grammar a configured skill name must satisfy, said as recovery. */
const SKILL_NAME_RULES = "Use lowercase letters, numbers, and hyphens; up to 64 characters";

/**
 * Every selected entry failed to re-resolve. That is a source-reachability
 * problem, not a per-entry skip: nothing can be advanced and nothing can be
 * reported as unchanged.
 */
const allSkillResolutionsFailed = new ExtensionLifecycleFailed({
  category: "network",
  detail: "All matched skill source re-resolutions failed.",
  recover: "Review the registries declared under `sources` in workspace settings",
  cmd: "axm help settings",
});

/**
 * The install operation reports more than the plan vocabulary carries. Only
 * the outcome and its sentence cross into the step result; a failed step
 * carries the typed failure the boundary renders.
 */
const toJobStepResult = (result: {
  readonly result: string;
  readonly message: string;
  readonly error?: StepFailure;
}): JobStepResult =>
  result.result === "error" && result.error !== undefined
    ? { result: "error", message: result.message, error: result.error }
    : { result: "success", message: result.message };

/** Everything `skills update` needs beyond the workspace it runs in. */
export interface SelectiveSkillUpdateRequest extends SelectiveUpdateSelectors {
  readonly kind: "selective-skills";
  /** Advance outside the version ranges installed Packs declare. */
  readonly ignoreVersionConstraints: boolean;
}

type ResolveResult =
  | {
      readonly type: "match";
      readonly ref: SkillExtensionRef;
      readonly versionRange: Option.Option<string>;
      readonly warnings: ReadonlyArray<string>;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
      readonly bypasses?: ReadonlyArray<ReleaseAgeBypassRecord>;
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
      readonly bypasses?: ReadonlyArray<ReleaseAgeBypassRecord>;
    }
  | { readonly kind: "policy_held"; readonly record: ReleaseAgeRecord };

const skippedSkillStep = (
  outcome: Extract<ResolveResult, { readonly type: "skip" }>,
): PlannedJobStep<SelectiveUpdateStepRequirements> => ({
  readiness: "ready",
  label: `Skip ${outcome.name}`,
  run: Effect.succeed({
    result: "success",
    disposition: "skipped",
    message: outcome.reason,
  } satisfies JobStepResult),
});

const warningMessage = (warnings: ReadonlyArray<string>): string | undefined =>
  warnings.length === 0 ? undefined : warnings.join("; ");

const appendWarningsToResult =
  (warnings: ReadonlyArray<string>) =>
  (result: JobStepResult): JobStepResult => {
    const message = warningMessage(warnings);
    if (message === undefined || result.result === "error") return result;
    return {
      ...result,
      message: result.message.length === 0 ? message : `${result.message}; ${message}`,
    };
  };

const toRegistrySkillPattern = (source: string) => {
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(source);
  if (parsed === undefined) return Option.none();
  if (parsed.type !== undefined && parsed.type !== "skills") return Option.none();
  return Option.some(parsed);
};

/**
 * Per-skill constraints declared by the authoritative desired Pack graph. An
 * incomplete graph is refused rather than guessed at: a missing Pack member
 * would silently drop the constraint it declares.
 */
const collectPackConstraints = Effect.fn("SelectiveSkillUpdate.packConstraints")(function* () {
  const ws = yield* WorkspaceMutations;
  const graph = yield* ws.getDesiredStateGraph();
  if (!graph.complete) {
    return yield* new ExtensionLifecycleFailed({
      category: "validation",
      detail: "Cannot update skills while the desired pack graph is incomplete",
    });
  }
  const constraintMap = new Map<string, Array<PackConstraint>>();
  for (const node of graph.nodes) {
    if (node.type !== "skill") continue;
    for (const origin of node.origins) {
      if (origin.type !== "pack" || origin.constraint === "*" || origin.constraint === "") continue;
      const existing = constraintMap.get(node.identity) ?? [];
      existing.push({ packName: origin.pack, constraint: origin.constraint });
      constraintMap.set(node.identity, existing);
    }
  }
  return constraintMap;
});

/** Settle a `skills update` request: decide everything, write nothing. */
export const prepareSelectiveSkillUpdate = Effect.fn("SelectiveSkillUpdate.prepare")(function* (
  request: SelectiveSkillUpdateRequest,
) {
  const ws = yield* WorkspaceMutations;
  const sources = yield* SourceHostProviders;
  const minimumReleaseAgeText = yield* ws.getMinimumReleaseAge();
  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();

  const allSkills = yield* ws.records.rows("skill").pipe(Effect.map(configuredRowsByName));
  const lockedSkills = yield* ws
    .getLockedSkills()
    .pipe(Effect.catch(() => Effect.succeed<SkillsLockMap>({})));

  const disabledSkillEntries: ReadonlyArray<Extract<ResolveResult, { readonly type: "skip" }>> =
    Object.entries(allSkills).flatMap(([name, entry]) =>
      entry.enabled === false && entry.source !== undefined
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
  const skillEntries: ReadonlyArray<SelectiveUpdateEntry> = Object.entries(allSkills).flatMap(
    ([name, entry]) => (entry.enabled && entry.source !== undefined ? [[name, entry.source]] : []),
  );

  if (skillEntries.length === 0) {
    return {
      outcome: "nothing",
      reason: "none-installed",
      message: NOTHING_INSTALLED,
      subjectType: "skill",
      planName: PLAN_NAME,
      planDescription: PLAN_DESCRIPTION,
    } satisfies SelectiveUpdateCandidate;
  }

  const selection = yield* selectUpdateTargets({
    entries: skillEntries,
    source: request.source,
    nameFilters: request.nameFilters,
    nameFilterFlag: request.nameFilterFlag,
    resourceType: "skill",
    resourceLabel: "skill",
    resourceLabelPlural: "skills",
  });
  if (selection.kind === "nothing") {
    return {
      outcome: "nothing",
      reason: selection.reason,
      message: selection.message,
      subjectType: "skill",
      planName: PLAN_NAME,
      planDescription: PLAN_DESCRIPTION,
    } satisfies SelectiveUpdateCandidate;
  }
  const filteredEntries = selection.entries;

  const packConstraintMap = yield* collectPackConstraints();

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
          return yield* new ExtensionLifecycleFailed({
            category: "not_found",
            detail: `No compatible Registry release of "${skillFqn}" is available`,
            recover: "Recover with the bundled AXM skill",
            cmd: "axm skills install @agentxm/skills/axm --bundled",
          });
        }
        if (compatible.kind === "version_unsatisfied") {
          return yield* new ExtensionLifecycleFailed({
            category: "conflict",
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
          return yield* new ExtensionLifecycleFailed({
            category: "internal",
            detail: `Registry resolved "${skillFqn}" as a non-skill extension`,
          });
        }
        const holdbacks =
          compatible.kind === "exempted" || compatible.newerHeld === undefined
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
        const bypasses: ReadonlyArray<ReleaseAgeBypassRecord> =
          compatible.kind === "selected"
            ? []
            : [
                {
                  reason: "minimum-release-age",
                  target: skillFqn,
                  dependencyPath: [skillFqn],
                  ...(Option.isSome(userConstraint)
                    ? { requestedRange: userConstraint.value }
                    : {}),
                  selectedVersion: compatible.ref.version,
                  candidateVersion: compatible.bypassed.version,
                  publishedAt: compatible.bypassed.publishedAt,
                  eligibleAt: compatible.bypassed.eligibleAt,
                  minimumReleaseAgeSeconds: compatible.bypassed.minimumReleaseAgeSeconds,
                  ...compatible.exemption,
                },
              ];
        return Option.some<RegistrySkillConstraintResolution>({
          kind: "selected",
          ref: compatible.ref,
          versionRange: userConstraint,
          holdbacks,
          bypasses,
          warnings:
            compatible.kind === "exempted" || compatible.newerHeld === undefined
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

      const constraints: UpdateConstraints = { userConstraint, packConstraints };
      const [latestEntry] = indexOption.value.versions;
      const latestVersion = latestEntry?.version;
      if (latestVersion === undefined) {
        return yield* new ExtensionLifecycleFailed({
          category: "conflict",
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
        return yield* new ExtensionLifecycleFailed({
          category: "internal",
          detail: `No published version of "${skillFqn}" satisfies ${constraintLabel}`,
          recover: "Relax the version constraint or update the dependent pack constraints",
        });
      }
      const desiredEntry = indexOption.value.versions.find(
        (entry) => entry.version === desiredVersion.value.resolvedVersion,
      );
      if (desiredEntry === undefined) {
        return yield* new ExtensionLifecycleFailed({
          category: "internal",
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
        return yield* new ExtensionLifecycleFailed({
          category: "internal",
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

  const decodeConfiguredSkillName = (name: string) =>
    Effect.try({
      try: () => decodeExtensionNameSync(name),
      catch: () =>
        new ExtensionLifecycleFailed({
          category: "validation",
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
          const lookupName = registryPattern.value.name ?? (yield* decodeConfiguredSkillName(name));
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
                reason: `Skill "${name}" is held by the minimum release age until ${registryResolved.value.record.eligibleAt}`,
                holdback: registryResolved.value.record,
              } satisfies ResolveResult;
            }
            return {
              type: "match",
              ref: registryResolved.value.ref,
              versionRange: registryResolved.value.versionRange,
              warnings: registryResolved.value.warnings,
              holdbacks: registryResolved.value.holdbacks,
              ...(registryResolved.value.bypasses === undefined
                ? {}
                : { bypasses: registryResolved.value.bypasses }),
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

  const resolved = results.filter(
    (result): result is Extract<ResolveResult, { readonly type: "match" }> =>
      result.type === "match",
  );
  const skipped = results.filter(
    (result): result is Extract<ResolveResult, { readonly type: "skip" }> => result.type === "skip",
  );
  if (
    resolved.length === 0 &&
    Option.isSome(request.source) &&
    skipped.length > 0 &&
    skipped.every((item) => !isWorkspaceSourceLocator(item.source) && item.holdback === undefined)
  ) {
    return yield* Effect.fail(allSkillResolutionsFailed);
  }
  if (resolved.length === 0 && skipped.length === 0) {
    return yield* Effect.fail(allSkillResolutionsFailed);
  }

  // Classify every proposed Registry acceptance against the accepted
  // resolution. A replaced publisher binding is a trust decision a person
  // makes at a prompt; the plan carries it as an interactive-only condition.
  const warningsBySkill = new Map<string, ReadonlyArray<string>>();
  const publisherTransitions: Array<PublisherBindingTransition> = [];
  for (const item of resolved) {
    const proposed = registryBindingProposal(item.ref);
    const accepted = lockedSkills[item.ref.skill.name];
    const transition =
      proposed === undefined || accepted?.type !== "registry"
        ? Option.none<PublisherBindingTransition>()
        : classifyPublisherBindingTransition({
            accepted: yield* acceptedResolutionRef({
              workspace: ws,
              type: "skill",
              name: proposed.target,
            }).pipe(
              Effect.mapError(
                (cause) =>
                  new ExtensionLifecycleFailed({
                    category: "conflict",
                    detail: `The accepted resolution for skill "${proposed.target}" could not be read, so the proposed publisher binding cannot be checked`,
                    cause,
                  }),
              ),
            ),
            proposed,
          });
    if (Option.isSome(transition)) publisherTransitions.push(transition.value);
    const warnings = Option.isSome(transition)
      ? [publisherTransitionWarning(transition.value), ...item.warnings]
      : item.warnings;
    if (warnings.length > 0) warningsBySkill.set(item.ref.skill.name, warnings);
  }

  const units: ReadonlyArray<SelectiveUpdateUnit<InstallSkillOperation>> = resolved.map((item) => ({
    name: item.ref.skill.name,
    ref: item.ref,
    force: request.ignoreVersionConstraints || item.ref.refType !== "registry",
    operation: {
      name: "install-skill",
      args: {
        ref: item.ref,
        force: request.ignoreVersionConstraints || item.ref.refType !== "registry",
        versionRange: item.versionRange,

        strictUnknownAgents: Option.none(),
        sourceName: Option.none(),
      },
    } satisfies InstallSkillOperation,
  }));

  const makeRunClosure = (
    operation: InstallSkillOperation,
  ): Effect.Effect<JobStepResult, StepFailure, SelectiveUpdateStepRequirements> =>
    installSkill(operation).pipe(
      Effect.map(toJobStepResult),
      Effect.map(appendWarningsToResult(warningsBySkill.get(operation.args.ref.skill.name) ?? [])),
    );

  const rawPlan = buildSelectiveUpdatePlan(
    units,
    lockedSkills,
    PLAN_NAME,
    Option.some(PLAN_DESCRIPTION),
    makeRunClosure,
  );
  const basePlanWithWarnings: Plan<SelectiveUpdateStepRequirements> = {
    ...rawPlan,
    presentation: operationPresentation(
      { imperative: "update", past: "Updated", gerund: "Updating" },
      "skill",
    ),
    releaseAge: {
      evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
      holdbacks: normalizeReleaseAgeRecords([
        ...resolved.flatMap((item) => item.holdbacks),
        ...skipped.flatMap((item) => (item.holdback === undefined ? [] : [item.holdback])),
      ]),
      bypasses: normalizeReleaseAgeRecords(resolved.flatMap((item) => item.bypasses ?? [])),
    },
    jobs: rawPlan.jobs.map((job) => ({
      ...job,
      steps: job.steps.map((step) => {
        if (step.readiness !== "ready") return step;
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
  const plan: Plan<SelectiveUpdateStepRequirements> =
    skippedSteps.length === 0
      ? basePlanWithWarnings
      : firstJob === undefined
        ? { ...basePlanWithWarnings, jobs: [{ concurrency: 1, steps: skippedSteps }] }
        : {
            ...basePlanWithWarnings,
            jobs: [{ ...firstJob, steps: [...firstJob.steps, ...skippedSteps] }, ...restJobs],
          };

  const configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation> = [
    ...new Set(
      request.nameFilters.length > 0
        ? request.nameFilters
        : plan.jobs.flatMap((job) =>
            job.steps.map((step) => step.label.replace(/^(?:Skip|Update)\s+/u, "")),
          ),
    ),
  ].map((name) => ({ extensionType: "skill", name, plannedState: "enabled" as const }));

  const executionPlan: Plan<SelectiveUpdateStepRequirements> = withPublisherTrustConditions(
    {
      ...plan,
      riskConditions: [
        ...(plan.riskConditions ?? []),
        ...(request.ignoreVersionConstraints ? [ignoreVersionConstraintsCondition] : []),
      ],
    },
    publisherTransitions,
  );

  return {
    outcome: "planned",
    subjectType: "skill",
    planName: PLAN_NAME,
    execution: yield* prepareExecutionCandidate(executionPlan, { configuredAgentOperations }),
  } satisfies SelectiveUpdateCandidate;
});
