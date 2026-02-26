/**
 * Fork command handler — Effect-based orchestration for `axm skills fork`.
 *
 * Converts an unmanaged skill into a managed extension:
 * 1. Registry guard (ensure registry configured)
 * 2. Parse source via resolveSource
 * 3. Namespace resolution
 * 4. Discover skills via SourceHostProviders
 * 5. Filter by --skill globs (if provided)
 * 6. Build plan: fork → publish → install (sequential)
 * 7. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  resolveSourcePattern,
  SourceHostProviders,
  registryGuard,
  type Source,
} from "../../../sources/index.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError, type CliError } from "../../../cli-error/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { CopySkillOperation } from "../../../extensions/skills/operations/copy.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { PublishSkillOperation } from "../../../extensions/skills/operations/publish.js";
import { copySkill } from "../../../extensions/skills/operations/copy.js";
import { installSkill } from "../../../extensions/skills/operations/install.js";
import { publishSkill } from "../../../extensions/skills/operations/publish.js";
import { expandGlobs } from "../../../skills/index.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import type { SkillExtensionRef, RegistrySkillRef } from "../../../sources/index.js";

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
  /** Skip confirmations. */
  readonly yes: boolean;
}

type ForkOp = CopySkillOperation | PublishSkillOperation | InstallSkillOperation;

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
        makeCliError({
          code: "NO_SKILLS_MATCHED",
          what: "No skills matched the given patterns",
          details: [`Patterns: ${skillPatterns.join(", ")}`, `Available: ${allNames.join(", ")}`],
          howToFix: "Check skill names with `axm skills install --list <source>`.",
        }),
      );
    }
    return Array.filter(discoveredSkills, (s) => matched.includes(s.skill.name));
  });

const isCliError = (error: unknown): error is CliError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  error._tag === "CliError" &&
  "what" in error &&
  "code" in error;

const summarizeError = (error: unknown): string => {
  if (isCliError(error)) {
    return `${error.what} (${error.code})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const isRemoteReadNotImplemented = (error: unknown): boolean =>
  isCliError(error) &&
  (error.code === "REGISTRY_REMOTE_NOT_SUPPORTED" ||
    (error.code.startsWith("REGISTRY_REMOTE_") && error.code.endsWith("_NOT_IMPLEMENTED")));

const discoverHowToFix = (source: Source, error: unknown): string => {
  if (source.type === "registry") {
    if (isRemoteReadNotImplemented(error)) {
      return "Remote registry discovery is not yet supported for HTTP(S) sources. Use a file:// registry source, or fork from a local/git source.";
    }
    return "Verify the configured registry is reachable and contains the requested namespace/skill.";
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
    ? "Verify the namespace and skill name, or use --list with skills install to inspect available skills."
    : "Verify the source path contains directories with SKILL.md files.";

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills fork` command.
 */
export const handleFork = Effect.fn("Fork.handle")(function* (args: ForkHandlerArgs) {
  const ws = yield* Workspace;
  const log = yield* Log;
  const spinnerSvc = yield* Spinner;
  const sources = yield* SourceHostProviders;

  yield* log.info("axm skills fork");

  // Step 1: Registry guard
  yield* registryGuard;

  // Step 2: Resolve namespace
  const namespace = yield* ws.getConfiguredNamespace().pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "NAMESPACE_RESOLUTION_FAILED",
        what: `Failed to resolve namespace: ${e._tag}`,
        howToFix: "Configure a namespace in your settings with `axm init`.",
        cause: e,
      }),
    ),
  );

  // Step 3: Parse source and discover skills
  const handle = yield* spinnerSvc.start("Resolving skills...");

  const resolvedSources = yield* resolveSourcePattern(args.source).pipe(
    Effect.catchTag("CliError", (error) =>
      error.code === "SOURCE_PARSE_FAILED"
        ? (() => {
            const reason = summarizeError(error);
            return Effect.fail(
              makeCliError({
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
    Effect.tapError(() => handle.stop("Failed")),
  );

  const allRefs = yield* Effect.forEach(
    resolvedSources,
    (source) =>
      sources.find(source, {
        skillNames: [],
        type: "skill",
        namespace: Option.none(),
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
      return makeCliError({
        code: "DISCOVER_FAILED",
        what: "Failed to discover skills from source",
        details: [`Source: ${sourceLabel}`, `Reason: ${reason}`],
        howToFix,
        cause: error,
      });
    }),
    Effect.tapError(() => handle.stop("Failed")),
  );

  const discoveredSkills = Array.filter(
    allRefs,
    (ref): ref is SkillExtensionRef => ref.type === "skill",
  );

  if (discoveredSkills.length === 0) {
    yield* handle.stop("No skills found");
    return yield* Effect.fail(
      makeCliError({
        code: "NO_SKILLS_FOUND",
        what: "No skills found in source",
        details: [`Source: ${args.source}`],
        howToFix: noSkillsFoundHowToFix(args.source),
      }),
    );
  }

  // Step 4: Filter by --skill globs (if provided)
  const filtered = yield* filterBySkillGlobs(discoveredSkills, args.skills).pipe(
    Effect.tapError(() => handle.stop("No matches")),
  );

  yield* handle.stop(`Found ${filtered.length} skill(s)`);

  // Step 5: Determine first registry source name for publishing
  const registrySources = yield* ws.getRegistrySourceHosts().pipe(
    Effect.mapError((e) =>
      makeCliError({
        code: "REGISTRY_SOURCES_FAILED",
        what: `Failed to get registry sources: ${e._tag}`,
        cause: e,
      }),
    ),
  );
  if (registrySources.length === 0) {
    return yield* Effect.fail(
      makeCliError({
        code: "NO_REGISTRY_CONFIGURED",
        what: "No registry sources configured",
        howToFix: "Run the registry guard first.",
      }),
    );
  }
  const registrySource = registrySources[0]!;
  const registryName = registrySource.name;

  // Step 6: Build plan — fork + publish + install per skill (3 sequential ops)
  const steps: ReadonlyArray<PlannedJobStep<ForkOp>> = Array.flatMap(filtered, (ref) => {
    const targetName = `${namespace}/skills/${ref.skill.name}`;
    const extensionRef = ref;
    // After fork + publish, the skill lives in the registry extensions dir.
    // Build a registry SkillExtensionRef for the install step.
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
        namespace: Option.none(),
      },
      namespace,
      name: ref.skill.name,
      version: "0.1.0",
      integrity: "",
    };
    return [
      {
        _tag: "PlannedJobStep" as const,
        operation: {
          name: "copy-skill",
          args: {
            ref: extensionRef,
            targetName,
          },
        } satisfies CopySkillOperation,
        readiness: { status: "ready", message: Option.none() },
        label: `Fork ${ref.skill.name}`,
      },
      {
        _tag: "PlannedJobStep" as const,
        operation: {
          name: "publish-skill",
          args: {
            name: targetName,
            registryName,
          },
        } satisfies PublishSkillOperation,
        readiness: { status: "ready", message: Option.none() },
        label: `Publish ${targetName}`,
      },
      {
        _tag: "PlannedJobStep" as const,
        operation: {
          name: "install-skill",
          args: {
            ref: registryRef,
            force: true,
            versionConstraint: Option.none(),
            skipSettings: Option.none(),
          },
        } satisfies InstallSkillOperation,
        readiness: { status: "ready", message: Option.none() },
        label: `Install ${ref.skill.name}`,
      },
    ];
  });

  const plan = {
    name: "Fork skill(s)",
    description: Option.some(`Fork and publish ${filtered.length} skill(s)`),
    jobs: [{ steps, concurrency: 1 as const }],
  };

  yield* ws.resolvePlan(plan, {
    "copy-skill": copySkill,
    "publish-skill": publishSkill,
    "install-skill": installSkill,
  });

  yield* log.success("Done");
});
