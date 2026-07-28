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
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";

import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import {
  REGISTRY_EXTENSIONS_DIR,
  decodeExtensionNameSync,
  parseRegistrySourcePatternParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "@agentxm/client-core/unstable/packs";
import {
  createRegistryClient,
  filterMatureVersions,
  parseMinimumReleaseAge,
  releaseAgeHoldbackWarning,
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
import { LOCKFILE_VERSION, type Lockfile } from "@agentxm/client-core/unstable/lockfile";
import {
  detectHoldbackWarnings,
  resolveConstrainedVersion,
  type PackConstraint,
  type SkillConstraints,
} from "./constraint-resolution.js";
import { emitPlanResolutionResult } from "../../../json-output.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
  allUpdateTargetResolutionsFailed,
  resolveUpdateTargets,
} from "../../shared/update-targets.js";
import { LIST_INSTALLED_SKILLS, SKILL_NAME_RULES } from "../../suggested-actions.js";

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
    }
  | {
      readonly type: "skip";
      readonly name: string;
      readonly source: string;
      readonly reason: string;
    };

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

  // Step 1: Load configured skills and filter to enabled
  const allSkills = yield* ws.records.getConfiguredSkills();
  const lockedSkills = yield* ws.getLockedSkills();

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
    nameFilterFlag: "--skill",
    resourceType: "skill",
    resourceLabel: "skill",
    resourceLabelPlural: "skills",
    noSourceMatchSuggestions: [LIST_INSTALLED_SKILLS],
    noNameMatchSuggestions: [
      LIST_INSTALLED_SKILLS,
      { description: "Relax the `--skill` filter and try again" },
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
    minimumAge,
    minimumReleaseAge,
  }: {
    readonly source: RegistrySource;
    readonly owner: Handle;
    readonly lookupName: ExtensionName;
    readonly userConstraint: Option.Option<string>;
    readonly packConstraints: ReadonlyArray<PackConstraint>;
    readonly minimumAge: Duration.Duration;
    readonly minimumReleaseAge: string;
  }) =>
    Effect.gen(function* () {
      const location =
        source.location.protocol === "file:" ? source.location.pathname : source.location.href;
      const client = yield* createRegistryClient(location);
      const indexOption = yield* client.getExtensionIndex({
        owner,
        type: "skill",
        name: lookupName,
      });
      if (Option.isNone(indexOption)) {
        return Option.none<{
          readonly ref: Extract<SkillExtensionRef, { readonly refType: "registry" }>;
          readonly versionRange: Option.Option<string>;
          readonly warnings: ReadonlyArray<string>;
        }>();
      }

      const skillFqn = `${owner}/skills/${lookupName}`;
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

      const matureVersions = (yield* filterMatureVersions(
        indexOption.value.versions,
        minimumAge,
      )).map((entry) => entry.version);
      if (matureVersions.length === 0) {
        return Option.none<{
          readonly ref: Extract<SkillExtensionRef, { readonly refType: "registry" }>;
          readonly versionRange: Option.Option<string>;
          readonly warnings: ReadonlyArray<string>;
        }>();
      }

      const resolvedVersion = resolveConstrainedVersion(matureVersions, constraints, skillFqn);
      if (Option.isNone(resolvedVersion)) {
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

      const exactRefs = yield* findSkillRefs(source, {
        skillNames: [lookupName],
        owner: Option.some(owner),
        versionRange: Option.some(resolvedVersion.value.resolvedVersion),
        minimumReleaseAge: Option.some(minimumAge),
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
          cmd: "axm skills install --force <source>",
        });
      }

      return Option.some({
        ref: exactRef,
        versionRange: userConstraint,
        warnings: [
          ...(resolvedVersion.value.resolvedVersion === latestVersion
            ? []
            : [
                releaseAgeHoldbackWarning({
                  fqn: skillFqn,
                  selectedVersion: resolvedVersion.value.resolvedVersion,
                  heldVersion: latestVersion,
                  minimumReleaseAge,
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
    ([name, sourceStr]) =>
      Effect.gen(function* () {
        if (isWorkspaceSourceLocator(sourceStr)) {
          return {
            type: "skip",
            name,
            source: sourceStr,
            reason: `Skill "${name}" is workspace-sourced and unchanged`,
          } satisfies ResolveResult;
        }
        const minimumReleaseAge = yield* ws.getMinimumReleaseAge();
        const minimumAge = parseMinimumReleaseAge(minimumReleaseAge);
        if (Option.isNone(minimumAge)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Invalid minimumReleaseAge "${minimumReleaseAge}"`,
            recover: "Use a duration such as 24h, 1440m, or 0s.",
          });
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
            minimumAge: minimumAge.value,
            minimumReleaseAge,
          });
          if (Option.isSome(registryResolved)) {
            return {
              type: "match",
              ref: registryResolved.value.ref,
              versionRange: registryResolved.value.versionRange,
              warnings: registryResolved.value.warnings,
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
          minimumReleaseAge: Option.some(minimumAge.value),
        });
        const skillRef = namedRefs.find((r) => r.skill.name === name);

        if (skillRef) {
          return {
            type: "match",
            ref: skillRef,
            versionRange: Option.none(),
            warnings: [],
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
          Effect.succeed({
            type: "skip",
            name,
            source: sourceStr,
            reason: `Failed to resolve "${name}": ${String(error)}`,
          } satisfies ResolveResult),
        ),
      ),
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
    skipped.every((item) => !isWorkspaceSourceLocator(item.source))
  ) {
    return yield* allUpdateTargetResolutionsFailed({
      resourceLabelPlural: "skill",
      recover: "List configured sources",
      cmd: "axm sources list",
    });
  }
  if (resolved.length === 0 && skipped.length === 0) {
    return yield* allUpdateTargetResolutionsFailed({
      resourceLabelPlural: "skill",
      recover: "List configured sources",
      cmd: "axm sources list",
    });
  }

  const warningsBySkill = new Map<string, ReadonlyArray<string>>();
  for (const item of resolved) {
    const existing = lockedSkills[item.ref.skill.name];
    const lockedEpoch = existing?.type === "registry" ? existing.publisherBindingId : undefined;
    const resolvedEpoch = item.ref.refType === "registry" ? item.ref.publisherBindingId : undefined;
    const publisherEpochChanged =
      existing?.type === "registry" &&
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
  const lockfile: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: lockedSkills };
  const rawPlan = buildUpdatePlan(
    ops,
    lockfile,
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
  const skippedSteps = [...skipped, ...disabledSkillEntries].map((item) => skippedSkillStep(item));
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
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("skills.update", resolution);
});

/**
 * Read installed pack manifests and collect per-skill constraints.
 *
 * Returns a map from skill FQN (e.g., "@acme/skills/code-review") to an array of
 * pack constraints. Silently skips packs whose manifest can't be read.
 */
const collectPackConstraints = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;

    // Read lockfile to find installed packs
    const lockedPacks = yield* ws.getLockedPacks();

    const constraintMap = new Map<string, Array<PackConstraint>>();

    // Read each pack's manifest from disk (sequential to avoid data race on constraintMap)
    yield* Effect.forEach(Object.entries(lockedPacks), ([packName, packEntry]) =>
      Effect.gen(function* () {
        const packDir = path.join(
          base,
          REGISTRY_EXTENSIONS_DIR,
          packEntry.owner,
          "packs",
          packName,
        );
        const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);

        const exists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!exists) return;

        const content = yield* fs
          .readFileString(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed("")));
        if (content === "") return;

        const json = yield* Effect.try({
          try: () => JSON.parse(content),
          catch: () => ({ _tag: "parse-failed" as const }),
        }).pipe(
          Effect.map((value): unknown => value),
          Effect.option,
        );
        if (Option.isNone(json)) return;

        const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json.value).pipe(
          Effect.option,
        );
        if (Option.isNone(manifest)) return;

        // Collect skill constraints from pack dependencies.
        for (const [fqn, constraint] of Object.entries(manifest.value.dependencies)) {
          if (!fqn.includes("/skills/")) continue;
          if (typeof constraint !== "string" || constraint === "*" || constraint === "") continue;
          const existing = constraintMap.get(fqn) ?? [];
          existing.push({ packName, constraint });
          constraintMap.set(fqn, existing);
        }
      }),
    );

    return constraintMap;
  });
