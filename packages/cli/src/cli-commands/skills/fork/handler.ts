/**
 * Fork command handler — Effect-based orchestration for `axm skills fork`.
 *
 * Converts an unmanaged skill into a managed extension:
 * 1. Parse source via resolveSource
 * 2. Profile resolution
 * 3. Discover skills via SourceHostProviders
 * 4. Filter by --skill globs (if provided)
 * 5. Build plan: fork → publish → install (sequential)
 * 6. Execute via resolvePlan
 *
 * The install step queries the registry at execution time to obtain the
 * integrity hash computed during publish, avoiding stale empty-string integrity.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { Source, SkillExtensionRef, RegistrySkillRef } from "@axm.sh/core/unstable/sources";
import { resolveSourcePattern, SourceHostProviders } from "../../../sources/index.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError, type AppError } from "@axm.sh/core/unstable/app-error";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

import { Workspace } from "../../../workspace/index.js";
import type { CopySkillOperation } from "../../../extensions/skills/operations/copy.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { PublishSkillOperation } from "../../../extensions/skills/operations/publish.js";
import { copySkill } from "../../../extensions/skills/operations/copy.js";
import { installSkill } from "../../../extensions/skills/operations/install.js";
import { publishSkill } from "../../../extensions/skills/operations/publish.js";
import { expandGlobs } from "@axm.sh/core/unstable/utils";
import { createRegistryClient } from "../../../registry/index.js";
import type { PlannedJobStep, JobStepResult } from "../../../workspace/plan.js";
import type { Plan } from "../../../workspace/plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the fork command.
 */
export interface ForkHandlerArgs {
  /** Source string or glob pattern (installed skill name, local path, github:owner/repo, etc.). */
  readonly source: string;
  /** Fork only specified skill(s) by name or glob pattern. */
  readonly skills: readonly string[];
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

// ---------------------------------------------------------------------------
// Plan step helpers
// ---------------------------------------------------------------------------

/** Convert an OperationResult to a JobStepResult. */
const toJobStepResult = (result: {
  readonly result: string;
  readonly message: string;
  readonly error?: AppError;
}): JobStepResult =>
  result.result === "error" && result.error != null
    ? { result: "error", message: result.message, error: result.error }
    : { result: "success", message: result.message };

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const filterBySkillGlobs = (
  discoveredSkills: ReadonlyArray<SkillExtensionRef>,
  skillPatterns: readonly string[],
) =>
  Effect.gen(function* () {
    if (skillPatterns.length === 0) return discoveredSkills;
    const allNames = Array.map(discoveredSkills, (r) => r.skill.name);
    const matched = expandGlobs(skillPatterns, allNames);
    if (matched.length === 0) {
      return yield* Effect.fail(
        makeAppError({
          code: "NO_SKILLS_MATCHED",
          what: "No skills matched the given patterns",
          details: [`Patterns: ${skillPatterns.join(", ")}`, `Available: ${allNames.join(", ")}`],
          howToFix: "Check skill names with `axm skills install --list <source>`.",
        }),
      );
    }
    return Array.filter(discoveredSkills, (s) => matched.includes(s.skill.name));
  });

const isAppError = (error: unknown): error is AppError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "AppError" &&
  "what" in error &&
  "code" in error;

const summarizeError = (error: unknown): string => {
  if (isAppError(error)) {
    return `${error.what} (${error.code})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isAppError(error) &&
  (error.code === "REGISTRY_REMOTE_NOT_SUPPORTED" ||
    (error.code.startsWith("REGISTRY_REMOTE_") && error.code.endsWith("_NOT_IMPLEMENTED")));

const discoverHowToFix = (source: Source, error: unknown): string => {
  if (source.type === "registry") {
    if (isRemoteReadNotImplemented(error)) {
      return "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or fork from a local/git source.";
    }
    return "Verify the configured registry is reachable and contains the requested profile/skill.";
  }
  if (source.type === "local") {
    return "Verify the source path contains directories with SKILL.md files.";
  }
  return "Verify the source is reachable and contains valid skill directories.";
};

const noSkillsFoundHowToFix = (sourceInput: string): string =>
  sourceInput.includes("@") ||
  sourceInput.startsWith("http://") ||
  sourceInput.startsWith("https://")
    ? "Verify the profile and skill name, or use --list with skills install to inspect available skills."
    : "Verify the source path contains directories with SKILL.md files.";

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills fork` command.
 */
export const handleFork = Effect.fn("Fork.handle")(function* (args: ForkHandlerArgs) {
  const ws = yield* Workspace;
  const renderer = yield* CliRenderer;

  const sources = yield* SourceHostProviders;

  yield* renderer.info("axm skills fork");

  // Step 1: Resolve profile
  const profile = yield* ws.getConfiguredProfile().pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "NAMESPACE_RESOLUTION_FAILED",
        what: `Failed to resolve profile: ${e._tag}`,
        howToFix: "Configure a profile in your settings with `axm init`.",
        cause: e,
      }),
    ),
  );

  // Step 2: Parse source and discover skills
  const filtered = yield* renderer.withSpinner(
    "Resolving skills...",
    () =>
      Effect.gen(function* () {
        const resolvedSources = yield* resolveSourcePattern(args.source).pipe(
          Effect.catchTag("AppError", (error) =>
            error.code === "SOURCE_PARSE_FAILED"
              ? (() => {
                  const reason = summarizeError(error);
                  return Effect.fail(
                    makeAppError({
                      code: "INVALID_SOURCE",
                      what: "Invalid source",
                      details: [`Provided: ${args.source}`, `Reason: ${reason}`],
                      howToFix:
                        "Valid formats: installed skill name, local path, github:owner/repo, or glob pattern",
                      cause: error,
                    }),
                  );
                })()
              : Effect.fail(error),
          ),
        );

        const allRefs = yield* Effect.forEach(
          resolvedSources,
          (source) =>
            sources.find(source, {
              skillNames: [],
              type: "skill",
              profile: Option.none(),
              versionConstraint: Option.none(),
            }),
          { concurrency: "unbounded" },
        ).pipe(
          Effect.map(Array.flatten),
          Effect.mapError((error) => {
            const reason = summarizeError(error);
            const firstResolved = resolvedSources[0];
            const sourceLabel = firstResolved ? sources.origin(firstResolved) : args.source;
            const howToFix = firstResolved
              ? discoverHowToFix(firstResolved, error)
              : noSkillsFoundHowToFix(args.source);
            return makeAppError({
              code: "DISCOVER_FAILED",
              what: "Failed to discover skills from source",
              details: [`Source: ${sourceLabel}`, `Reason: ${reason}`],
              howToFix,
              cause: error,
            });
          }),
        );

        const discoveredSkills = Array.filter(
          allRefs,
          (ref): ref is SkillExtensionRef => ref.type === "skill",
        );

        if (discoveredSkills.length === 0) {
          return yield* Effect.fail(
            makeAppError({
              code: "NO_SKILLS_FOUND",
              what: "No skills found in source",
              details: [`Source: ${args.source}`],
              howToFix: noSkillsFoundHowToFix(args.source),
            }),
          );
        }

        // Step 3: Filter by --skill globs (if provided)
        return yield* filterBySkillGlobs(discoveredSkills, args.skills);
      }),
    {
      successMessage: (matches) => `Found ${matches.length} skill(s)`,
      failureMessage: "Failed",
    },
  );

  // Step 4: Determine first registry source name for publishing
  const registrySources = yield* ws.getRegistrySourceHosts().pipe(
    Effect.mapError((e) =>
      makeAppError({
        code: "REGISTRY_SOURCES_FAILED",
        what: `Failed to get registry sources: ${e._tag}`,
        cause: e,
      }),
    ),
  );
  if (registrySources.length === 0) {
    return yield* Effect.fail(
      makeAppError({
        code: "NO_REGISTRY_CONFIGURED",
        what: "No registry sources configured",
        howToFix: "Run the registry guard first.",
      }),
    );
  }
  const registrySource = registrySources[0]!;
  const registryName = registrySource.name;

  // Step 5: Build plan — fork + publish + install per skill (3 sequential ops)
  // Steps use inline run closures so the install step can query the registry
  // at execution time for the integrity hash computed during publish.
  const registryLocationStr =
    registrySource.location.protocol === "file:"
      ? registrySource.location.pathname
      : registrySource.location.href;

  const steps: ReadonlyArray<PlannedJobStep> = Array.flatMap(filtered, (ref) => {
    const targetName = `${profile}/skills/${ref.skill.name}`;
    const extensionRef = ref;

    // Cast run closures to Effect<JobStepResult, AppError, never>: services are
    // provided in the ambient fiber context when applyPlan executes the closures.
    // This mirrors the same cast used by bridgeLegacyPlan.
    const copyStep: PlannedJobStep = {
      readiness: "ready",
      label: `Fork ${ref.skill.name}`,
      run: copySkill({
        name: "copy-skill",
        args: { ref: extensionRef, targetName },
      } satisfies CopySkillOperation).pipe(Effect.map(toJobStepResult)) as Effect.Effect<
        JobStepResult,
        AppError,
        never
      >,
    };

    const publishStep: PlannedJobStep = {
      readiness: "ready",
      label: `Publish ${targetName}`,
      run: publishSkill({
        name: "publish-skill",
        args: { name: targetName, registryName },
      } satisfies PublishSkillOperation).pipe(Effect.map(toJobStepResult)) as Effect.Effect<
        JobStepResult,
        AppError,
        never
      >,
    };

    // Install step queries the registry at execution time to obtain the
    // integrity hash that publish computed, rather than using a stale value.
    const installStep: PlannedJobStep = {
      readiness: "ready",
      label: `Install ${ref.skill.name}`,
      run: Effect.gen(function* () {
        const client = yield* createRegistryClient(registryLocationStr);
        const response = yield* client.getExtensionsByScope({
          handle: profile,
          names: [ref.skill.name],
          types: ["skill"],
          limit: Option.some(1),
          offset: 0,
        });

        const published = response.extensions[0];
        const integrity = published != null ? published.integrity : "";

        const registryRef: RegistrySkillRef = {
          type: "skill" as const,
          refType: "registry" as const,
          skill: {
            name: ref.skill.name,
            description: ref.skill.description,
            metadata: ref.skill.metadata,
          },
          source: {
            type: "registry" as const,
            location: registrySource.location,
            profile: Option.none(),
          },
          profile,
          name: ref.skill.name,
          version: published != null ? published.version : "0.1.0",
          integrity,
        };

        return yield* installSkill({
          name: "install-skill",
          args: {
            ref: registryRef,
            force: true,
            versionConstraint: Option.none(),
            skipSettings: Option.none(),
            sourceName: Option.some(registryName),
          },
        } satisfies InstallSkillOperation).pipe(Effect.map(toJobStepResult));
      }) as Effect.Effect<JobStepResult, AppError, never>,
    };

    return [copyStep, publishStep, installStep];
  });

  const plan: Plan = {
    _tag: "Plan",
    name: "Fork skill(s)",
    description: Option.some(`Fork and publish ${filtered.length} skill(s)`),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  yield* ws.resolvePlan(plan, { yes: args.yes, force: args.force, preview: args.preview });

  yield* renderer.success("Done");
});
