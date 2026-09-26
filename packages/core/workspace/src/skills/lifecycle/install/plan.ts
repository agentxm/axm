/**
 * Installing skills.
 *
 * A skill is acquired once into the canonical tree and then projected into
 * every configured agent's skills directory, so this decides which source
 * supplies it, which of that source's skills the request wants, what each
 * projection target's change will be before anything is written, and whether
 * a version this new deserves a release-age warning.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { RegistryClientFactory } from "@agentxm/registry-client";

import { SkillManager } from "../../../materialization/index.js";
import { prepareSkillInstallation } from "../application/installation.js";
import { skillInstallationFacts } from "../adapters/installation.js";
import { buildInstallOperation } from "../../../reconciliation/index.js";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  PackageUrlPartsSchema,
  formatPackageDisplay,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import {
  operationPresentation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "../../../transitions/planning/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import {
  type InstallStepRequirements,
  type SkillInstallIntent,
} from "../../../lifecycle/install/vocabulary.js";

const decodePackageUrlParts = Schema.decodeUnknownResult(Schema.toType(PackageUrlPartsSchema));

const appendWarningToResult =
  (warning: string) =>
  (result: JobStepResult): JobStepResult => {
    if (result.result === "error") return result;
    return {
      ...result,
      warnings: [...(result.warnings ?? []), warning],
      message: result.message.length === 0 ? warning : `${result.message}; ${warning}`,
    };
  };

const withPlanWarning = (
  step: PlannedJobStep<InstallStepRequirements>,
  warning: Option.Option<string>,
): PlannedJobStep<InstallStepRequirements> => {
  if (Option.isNone(warning) || step.readiness === "error") return step;
  if (step.readiness === "warn") {
    return { ...step, run: step.run.pipe(Effect.map(appendWarningToResult(warning.value))) };
  }
  return {
    ...step,
    message: warning.value,
    run: step.run.pipe(Effect.map(appendWarningToResult(warning.value))),
  };
};

/**
 * The packages a skill declares itself compatible with. Registry refs carry
 * them as a typed field; a local or git-hosted skill may declare them in its
 * generic metadata bag, where an invalid entry is skipped rather than
 * failing the whole install.
 */
export const getCompanionPackages = (ref: SkillExtensionRef): ReadonlyArray<PackageUrlParts> => {
  if (ref.refType === "registry") return ref.packages ?? [];
  return Option.match(ref.skill.metadata, {
    onNone: (): ReadonlyArray<PackageUrlParts> => [],
    onSome: (metadata) => {
      const raw = metadata["packages"];
      if (!globalThis.Array.isArray(raw)) return [];
      return raw.flatMap((entry: unknown) => {
        const decoded = decodePackageUrlParts(entry);
        return Result.isSuccess(decoded) ? [decoded.success] : [];
      });
    },
  });
};

/** Companion-package orientation the application renders beside the preview. */
export interface CompanionPackagesSection {
  readonly title: string;
  readonly items: ReadonlyArray<string>;
}

/** The deduplicated compatible-package list a set of skill refs declares. */
export const buildCompanionPackagesSection = (
  refs: ReadonlyArray<SkillExtensionRef>,
): CompanionPackagesSection | undefined => {
  const allPackages = refs.flatMap((ref) => getCompanionPackages(ref));
  if (allPackages.length === 0) return undefined;
  const seen = new Set<string>();
  const items: Array<string> = [];
  for (const pkg of allPackages) {
    const formatted = formatPackageDisplay(pkg);
    if (!seen.has(formatted)) {
      seen.add(formatted);
      items.push(formatted);
    }
  }
  return { title: "Compatible packages", items };
};

/**
 * One skill the planner realizes: the ref, the range its declaration keeps,
 * and whether already acquired content is reacquired. Installing declares the
 * intent; an update through the configured sweep re-declares the intent the
 * workspace already recorded, so both are one step shape.
 */
export interface SkillInstallationStepInput {
  readonly ref: SkillExtensionRef;
  readonly versionRange: Option.Option<VersionRange>;
  readonly force: boolean;
}

/** One skill-owned application step, shared by every install and update route. */
export const planSkillInstallationStep = (
  input: SkillInstallationStepInput,
): Effect.Effect<
  PlannedJobStep<InstallStepRequirements>,
  ExtensionLifecycleFailed | Config.ConfigError,
  InstallStepRequirements | SkillManager | FileSystem.FileSystem | Path.Path | RegistryClientFactory
> =>
  Effect.gen(function* () {
    const skillManager = yield* SkillManager;
    const prepared = yield* prepareSkillInstallation<
      ExtensionLifecycleFailed | Config.ConfigError,
      InstallStepRequirements | SkillManager,
      InstallStepRequirements
    >(skillInstallationFacts, input);
    let step = buildInstallOperation(skillManager, {
      toStepFailure: lifecycleStepFailure,
      ref: input.ref,
      declaration: { name: input.ref.skill.name, versionRange: input.versionRange },
      force: input.force,
      buildArtifact: prepared.buildArtifact,
    });
    for (const warning of prepared.warnings) step = withPlanWarning(step, Option.some(warning));
    return step;
  }).pipe(Effect.withSpan("SkillInstallation.planStep"));

/** The closures a settled skill intent becomes. */
export const planSkillInstall: (
  intent: SkillInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed | Config.ConfigError,
  InstallStepRequirements | SkillManager | FileSystem.FileSystem | Path.Path | RegistryClientFactory
> = Effect.fn("InstallExtensions.planSkills")(function* (intent: SkillInstallIntent) {
  const steps = yield* Effect.forEach(
    intent.skillsToInstall,
    (entry) => planSkillInstallationStep({ ...entry, force: intent.force === true }),
    { concurrency: 1 },
  );

  return {
    _tag: "Plan",
    name:
      intent.skillsToInstall.length === 0
        ? "Install skills"
        : intent.skillsToInstall.length === 1
          ? "Install skill"
          : `Install ${intent.skillsToInstall.length} skills`,
    description: Option.none(),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "skill",
    ),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});
