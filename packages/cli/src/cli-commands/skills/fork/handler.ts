/**
 * Fork command handler — Effect-based orchestration for `axm skills fork`.
 *
 * Converts an unmanaged skill into a managed extension:
 * 1. Registry guard (ensure registry configured)
 * 2. Parse source via resolveSource
 * 3. Scope resolution
 * 4. Discover skills via SourceProviders
 * 5. Filter by --skill globs (if provided)
 * 6. Build plan: fork → publish → install (sequential)
 * 7. Execute via resolvePlan
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import {
  resolveSource,
  printSourceInput,
  SourceProviders,
  registryGuard,
} from "../../../sources/index.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log, Spinner } from "../../../tui/index.js";
import { formatError } from "../../../utils/errors.js";
import { Workspace as Workspace } from "../../../workspace/index.js";
import type {
  CopySkillOperation,
  InstallSkillOperation,
  InstallSkillOperationArgs,
  PublishSkillOperation,
} from "../operations.js";
import { copySkill } from "../copy-skill.js";
import { installSkill } from "../install/install-skill.js";
import { publishSkill } from "../publish-skill.js";
import { expandGlobs } from "../../../skills/index.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import type { SkillRef } from "../../../sources/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the fork command.
 */
export interface ForkHandlerArgs {
  /** Source string (installed skill name, local path, github:owner/repo, etc.). */
  readonly source: string;
  /** Fork only specified skill(s) by name or glob pattern. */
  readonly skills: readonly string[];
  /** Skip confirmations. */
  readonly yes: boolean;
}

type ForkOp = CopySkillOperation | PublishSkillOperation | InstallSkillOperation;

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ForkError extends Data.TaggedError("ForkError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills fork` command.
 */
export const handleFork = (args: ForkHandlerArgs) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const path = yield* Path.Path;
    const log = yield* Log;
    const spinnerSvc = yield* Spinner;
    const sources = yield* SourceProviders;
    const base = path.dirname(ws.path);

    yield* log.info("axm skills fork");

    // Step 1: Registry guard
    yield* registryGuard;

    // Step 2: Resolve scope
    const scope = yield* ws.getConfiguredScope().pipe(
      Effect.mapError(
        (e) =>
          new ForkError({
            message: `Failed to resolve scope: ${e._tag}`,
            cause: e,
          }),
      ),
    );

    // Step 3: Parse source and discover skills
    const handle = yield* spinnerSvc.start("Resolving skills...");

    const source = yield* resolveSource(args.source).pipe(
      Effect.mapError(
        (error) =>
          new ForkError({
            message: formatError(
              `Invalid source: ${error.message}`,
              [`Provided: ${args.source}`],
              "Valid formats: installed skill name, local path, github:owner/repo",
            ),
            cause: error,
          }),
      ),
      Effect.tapError(() => handle.stop("Failed")),
    );

    const allRefs = yield* sources
      .resolveExtension(source, { names: [], agents: [], type: "skill" })
      .pipe(
        Effect.mapError(
          (error) =>
            new ForkError({
              message: formatError(
                `Failed to discover skills: ${error.message}`,
                [`Source: ${printSourceInput(source)}`],
                "Verify the source path contains directories with SKILL.md files.",
              ),
              cause: error,
            }),
        ),
        Effect.tapError(() => handle.stop("Failed")),
      );

    const discoveredSkills = Array.filter(allRefs, (ref): ref is SkillRef => ref.type === "skill");
    if (discoveredSkills.length === 0) {
      yield* handle.stop("No skills found");
      return yield* new ForkError({
        message: formatError(
          "No skills found in source",
          [`Source: ${printSourceInput(source)}`],
          "Verify the source path contains directories with SKILL.md files.",
        ),
        cause: undefined,
      });
    }

    // Step 4: Filter by --skill globs (if provided)
    const filtered: ReadonlyArray<SkillRef> =
      args.skills.length > 0
        ? (() => {
            const allNames = Array.map(discoveredSkills, (r) => r.skill.name);
            const matched = expandGlobs(args.skills, allNames);
            if (matched.length === 0) {
              // Yield an error — cannot be done inside the IIFE, so return empty and check below
              return [];
            }
            return Array.filter(discoveredSkills, (s) => matched.includes(s.skill.name));
          })()
        : discoveredSkills;

    if (args.skills.length > 0 && filtered.length === 0) {
      yield* handle.stop("No matches");
      const allNames = Array.map(discoveredSkills, (r) => r.skill.name);
      return yield* new ForkError({
        message: formatError(
          "No skills matched the given patterns",
          [`Patterns: ${args.skills.join(", ")}`, `Available: ${allNames.join(", ")}`],
          "Check skill names with `axm skills install --list <source>`.",
        ),
        cause: undefined,
      });
    }

    yield* handle.stop(`Found ${filtered.length} skill(s)`);

    // Step 5: Get agents from workspace
    const agentIds = yield* ws.getConfiguredAgents();

    // Step 6: Determine first registry source name for publishing
    const registrySources = yield* ws.getConfiguredRegistrySources(Option.none()).pipe(
      Effect.mapError(
        (e) =>
          new ForkError({
            message: `Failed to get registry sources: ${e._tag}`,
            cause: e,
          }),
      ),
    );
    if (registrySources.length === 0) {
      return yield* new ForkError({
        message: "No registry sources configured. Run the registry guard first.",
        cause: undefined,
      });
    }
    const registryName = registrySources[0]!.name;

    // Step 7: Build plan — fork + publish + install per skill (3 sequential ops)
    const steps: ReadonlyArray<PlannedJobStep<ForkOp>> = Array.flatMap(filtered, (ref) => {
      const targetName = `${scope}/${ref.skill.name}`;
      const installArgs: InstallSkillOperationArgs = {
        source: { type: "registry", scope, name: ref.skill.name },
        agents: [...agentIds],
        force: true,
        skill: {
          name: ref.skill.name,
          description: ref.skill.description,
          metadata: ref.skill.metadata,
        },
        location:
          "file://" + path.join(base, ".axm/extensions", scope, "skills", ref.skill.name, "src"),
        version: Option.some("0.1.0"),
        gitTreeSha: Option.none(),
      };
      return [
        {
          _tag: "PlannedJobStep" as const,
          operation: {
            name: "copy-skill",
            args: {
              source: {
                type: "local",
                path: ref.location.replace("file://", ""),
              } satisfies CopySkillOperation["args"]["source"],
              targetName,
              location: ref.location,
            },
          } satisfies CopySkillOperation,
          expectedResult: {
            result: "success",
            message: `Copied ${ref.skill.name} to ${targetName}`,
          },
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
          expectedResult: { result: "success", message: `Published ${targetName}` },
          label: `Publish ${targetName}`,
        },
        {
          _tag: "PlannedJobStep" as const,
          operation: {
            name: "install-skill",
            args: installArgs,
          } satisfies InstallSkillOperation,
          expectedResult: { result: "success", message: `Installed ${ref.skill.name}` },
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
