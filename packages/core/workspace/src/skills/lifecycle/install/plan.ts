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

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import { SkillManager } from "../../../materialization/index.js";
import { prepareSkillInstallation } from "../application/installation.js";
import { skillInstallationFacts } from "../adapters/installation.js";
import { buildInstallOperation } from "../../../reconciliation/index.js";
import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import {
  PackageUrlPartsSchema,
  formatPackageDisplay,
  type PackageUrlParts,
} from "@agentxm/extension-model/unstable/packaging";
import {
  parseInputPattern,
  type InputParseResult,
} from "@agentxm/extension-model/unstable/sources/parser";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import {
  SourceHostProviders,
  type SourceResolutionFailure,
} from "../../../resolution/sources/index.js";
import {
  operationPresentation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "../../../transitions/planning/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import type { RegistryLookupProbe } from "../../../lifecycle/install/registry-source-resolution.js";
import {
  installRefused,
  type InstallStepRequirements,
  type ResolveInstallRequirements,
  type SkillInstallIntent,
} from "../../../lifecycle/install/vocabulary.js";
import {
  determineSkillsToInstall,
  SkillSelectionInteraction,
  type SkillSelectionFailure,
} from "../application/index.js";
import { resolveSkillInstallSource } from "./source.js";

/** A skill source after grammar parsing, before anything is discovered. */
export interface ParsedSkillInstallRequest {
  readonly source: Source;
  readonly versionRange: Option.Option<VersionRange>;
  readonly requestedSkills: ReadonlyArray<string>;
  readonly requestedOwner: Option.Option<Handle>;
  /** Which configured registry hosts were consulted, and what each answered. */
  readonly resolutionProbes: ReadonlyArray<RegistryLookupProbe>;
  readonly all: boolean;
  readonly force: boolean;
  readonly nonInteractive: boolean;
}

const noSkillsFoundHowToFix = (source: Source): string => {
  if (source.type === "registry") {
    return "Verify the owner and skill name exist in the configured registry";
  }
  if (source.type === "local") {
    return "Verify the source path contains directories with SKILL.md files";
  }
  return "Verify the source contains skill directories with SKILL.md files";
};

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

const extractRequestedSkills = (
  argSkills: ReadonlyArray<string>,
  parsedSource: InputParseResult,
): ReadonlyArray<string> =>
  argSkills.length > 0
    ? argSkills
    : parsedSource.pattern.pattern === "name-input"
      ? [parsedSource.pattern.name]
      : parsedSource.pattern.pattern === "registry-pattern-input"
        ? Option.isSome(parsedSource.pattern.name)
          ? [parsedSource.pattern.name.value]
          : []
        : [];

const extractRequestedOwner = (
  parsedSource: InputParseResult,
  source: Source,
): Option.Option<Handle> =>
  parsedSource.pattern.pattern === "registry-pattern-input"
    ? Option.some(parsedSource.pattern.owner)
    : source.type === "registry"
      ? source.owner
      : Option.none<Handle>();

/** What a skill install command supplies before anything is parsed. */
export interface SkillInstallArgs {
  readonly source: string;
  readonly skills: ReadonlyArray<string>;
  readonly all: boolean;
  readonly force: boolean;
  readonly nonInteractive: boolean;
}

/** Read the skill source grammar and route it to the source that serves it. */
export const parseSkillInstallRequest: (
  args: SkillInstallArgs,
) => Effect.Effect<
  ParsedSkillInstallRequest,
  ExtensionLifecycleFailed | SourceResolutionFailure,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.parseSkillRequest")(function* (args: SkillInstallArgs) {
  const parsedSourceOption = parseInputPattern(args.source.trim());
  if (Option.isNone(parsedSourceOption)) {
    return yield* installRefused({
      category: "validation",
      detail: "Invalid source: Unable to parse source",
      recover:
        "Valid formats: local path, github:owner/repo, gitlab:owner/repo, or https://example.com",
    });
  }

  const parsedSource = parsedSourceOption.value;
  const versionRange =
    parsedSource.pattern.pattern === "registry-pattern-input"
      ? parsedSource.pattern.versionRange
      : Option.none<VersionRange>();

  const resolutionProbes: Array<RegistryLookupProbe> = [];
  const source = yield* resolveSkillInstallSource(parsedSource, {
    onRegistryProbe: (probe) => {
      resolutionProbes.push(probe);
    },
  });

  return {
    source,
    versionRange,
    requestedSkills: extractRequestedSkills(args.skills, parsedSource),
    requestedOwner: extractRequestedOwner(parsedSource, source),
    resolutionProbes,
    all: args.all,
    force: args.force,
    nonInteractive: args.nonInteractive,
  } satisfies ParsedSkillInstallRequest;
});

/** Discover the skills the parsed source offers, or refuse when it has none. */
export const discoverSkillRefs: (
  request: ParsedSkillInstallRequest,
) => Effect.Effect<
  ReadonlyArray<SkillExtensionRef>,
  ExtensionLifecycleFailed,
  ResolveInstallRequirements
> = Effect.fn("InstallExtensions.discoverSkills")(function* (request: ParsedSkillInstallRequest) {
  const sources = yield* SourceHostProviders;
  const discovered = yield* sources
    .find(request.source, {
      names: request.source.type === "registry" ? request.requestedSkills : [],
      type: "skill" as const,
      owner: request.requestedOwner,
      versionRange: request.versionRange,
    })
    .pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "network",
          detail: "Skills could not be discovered from the source",
          cause,
        }),
      ),
      Effect.map(Array.filter((ref): ref is SkillExtensionRef => ref.type === "skill")),
    );
  if (Array.isReadonlyArrayEmpty(discovered)) {
    return yield* installRefused({
      category: "not_found",
      detail: "No skills found in source",
      recover: noSkillsFoundHowToFix(request.source),
    });
  }
  return discovered;
});

/** Settle which of the discovered skills this request installs. */
export const finalizeSkillInstallIntent: (
  request: ParsedSkillInstallRequest,
  discovered: ReadonlyArray<SkillExtensionRef>,
) => Effect.Effect<
  SkillInstallIntent,
  ExtensionLifecycleFailed | SkillSelectionFailure,
  SkillSelectionInteraction
> = Effect.fn("InstallExtensions.finalizeSkillIntent")(function* (
  request: ParsedSkillInstallRequest,
  discovered: ReadonlyArray<SkillExtensionRef>,
) {
  const [first, ...rest] = discovered;
  if (first === undefined) {
    return yield* installRefused({ category: "not_found", detail: "No skills found in source" });
  }
  const candidates: Array.NonEmptyReadonlyArray<SkillExtensionRef> = [first, ...rest];
  const selected = yield* determineSkillsToInstall(candidates, {
    requestedSkills: request.requestedSkills,
    all: request.all,
    nonInteractive: request.nonInteractive,
  });

  if (Array.isReadonlyArrayEmpty(selected)) {
    return { skillsToInstall: [] } satisfies SkillInstallIntent;
  }

  return {
    skillsToInstall: selected.map((ref) => ({
      ref,
      versionRange: ref.refType === "registry" ? request.versionRange : Option.none<VersionRange>(),
    })),
    force: request.force,
  } satisfies SkillInstallIntent;
});

/**
 * Warn when a registry version this install accepts is younger than the
 * workspace's minimum release age. The version was requested explicitly, so
 * the policy does not hold it back — it only says so.
 */
/** Installing declares intent; an update advances the resolution of existing intent. */
export type SkillInstallationStepInput = {
  readonly ref: SkillExtensionRef;
  readonly force: boolean;
} & (
  | { readonly operation: "install"; readonly versionRange: Option.Option<VersionRange> }
  | { readonly operation: "update" }
);

/** One skill-owned application step, shared by install and selective update. */
export const planSkillInstallationStep = (
  input: SkillInstallationStepInput,
): Effect.Effect<
  PlannedJobStep<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | SkillManager | FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const skillManager = yield* SkillManager;
    const prepared = yield* prepareSkillInstallation(skillInstallationFacts, input);
    let step = buildInstallOperation(skillManager, {
      toStepFailure: lifecycleStepFailure,
      ref: input.ref,
      ...(input.operation === "install"
        ? { declaration: { name: input.ref.skill.name, versionRange: input.versionRange } }
        : {}),
      force: input.force,
      installedBefore: Effect.succeed(prepared.installedBefore),
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
  ExtensionLifecycleFailed,
  InstallStepRequirements | SkillManager | FileSystem.FileSystem | Path.Path | HttpClient.HttpClient
> = Effect.fn("InstallExtensions.planSkills")(function* (intent: SkillInstallIntent) {
  const steps = yield* Effect.forEach(
    intent.skillsToInstall,
    (entry) =>
      planSkillInstallationStep({ ...entry, operation: "install", force: intent.force === true }),
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
