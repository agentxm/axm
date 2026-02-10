/**
 * Fork command handler — Effect-based orchestration for `axm skills fork`.
 *
 * Converts an unmanaged skill into a managed extension:
 * 1. Registry guard (ensure registry configured)
 * 2. Parse source via determineSourceInput
 * 3. Scope resolution
 * 4. Discover skills via SourceProviders
 * 5. Filter by --skill globs (if provided)
 * 6. Build plan: fork → publish (sequential)
 * 7. Execute via resolvePlan
 * 8. Post-plan: update lockfile + create agent symlinks
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import {
  determineSourceInput,
  printSource,
  SourceProviders,
  registryGuard,
} from "../../../sources/index.js";
import * as Array from "effect/Array";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log, Spinner } from "../../../tui/index.js";
import { LockfileService } from "../../../lockfile/index.js";
import { SettingsService } from "../../../settings/index.js";
import { formatError } from "../../../utils/errors.js";
import { WorkspaceContextTag as Workspace } from "../../../workspace/index.js";
import type { ForkSkillOperation, PublishSkillOperation } from "../operations.js";
import { forkSkill } from "../fork-skill.js";
import { publishSkill } from "../publish-skill.js";
import { sourceToLockEntry } from "../source-to-lock-entry.js";
import { expandGlobs } from "../../../skills/index.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { getAgentById } from "../../../agents/registry.js";
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

type ForkOp = ForkSkillOperation | PublishSkillOperation;

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ForkError extends Data.TaggedError("ForkError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const REGISTRY_EXTENSIONS_DIR = ".axm/extensions";

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
    const scope = yield* ws.getScope().pipe(
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

    const source = yield* determineSourceInput(args.source).pipe(
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

    const allRefs = yield* sources.resolve(source, { names: [], agents: [], type: "skill" }).pipe(
      Effect.mapError(
        (error) =>
          new ForkError({
            message: formatError(
              `Failed to discover skills: ${error.message}`,
              [`Source: ${printSource(source)}`],
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
          [`Source: ${printSource(source)}`],
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

    // Step 5: Get agents from settings
    const ss = yield* SettingsService;
    const agentIds = yield* ss.getAgents();

    // Step 6: Determine first registry source name for publishing
    const registrySources = yield* ws.getRegistrySources(Option.none()).pipe(
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

    // Step 7: Build plan — fork + publish per skill (2 sequential ops)
    const steps: ReadonlyArray<PlannedJobStep<ForkOp>> = Array.flatMap(filtered, (ref) => {
      const targetName = `${scope}/${ref.skill.name}`;
      return [
        {
          _tag: "PlannedJobStep" as const,
          operation: {
            name: "fork-skill",
            args: {
              source: {
                source: "local",
                path: ref.location.replace("file://", ""),
              } satisfies ForkSkillOperation["args"]["source"],
              targetName,
              agents: [...agentIds],
              location: ref.location,
            },
          } satisfies ForkSkillOperation,
          expectedResult: {
            result: "success",
            message: `Forked ${ref.skill.name} to ${targetName}`,
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
      ];
    });

    const plan = {
      name: "Fork skill(s)",
      description: Option.some(`Fork and publish ${filtered.length} skill(s)`),
      jobs: [{ steps, concurrency: 1 as const }],
    };

    yield* ws.resolvePlan(plan, {
      "fork-skill": forkSkill,
      "publish-skill": publishSkill,
    });

    // Step 8: Post-plan — update lockfile + create agent symlinks
    // Done outside the plan because installSkill's pre-clean would delete
    // the managed extension directory that the fork step just created.
    const ls = yield* LockfileService;

    yield* Effect.forEach(
      filtered,
      (ref) =>
        Effect.gen(function* () {
          const targetName = `${scope}/${ref.skill.name}`;
          const canonicalPath = path.join(
            base,
            REGISTRY_EXTENSIONS_DIR,
            scope,
            "skills",
            ref.skill.name,
          );

          // Update lockfile
          yield* ls
            .updateEntry(
              ref.skill.name,
              sourceToLockEntry({
                source: { source: "registry" },
                agents: [...agentIds],
                gitTreeSha: Option.none(),
                now: new Date(),
                registry: {
                  scope,
                  name: ref.skill.name,
                  resolvedVersion: "0.1.0",
                  checksum: "",
                  sourceName: registryName,
                },
              }),
            )
            .pipe(Effect.catchAll(() => Effect.void));

          // Create agent symlinks
          yield* Effect.forEach(
            agentIds,
            (agentId) =>
              Effect.gen(function* () {
                const maybeAgent = getAgentById(agentId);
                if (Option.isNone(maybeAgent)) return;
                const agent = maybeAgent.value;

                const agentSkillPath = path.join(base, agent.skills.dir, ref.skill.name);

                // Self-reference: agent's skills.dir resolves to canonical location → skip symlink
                const agentSkillsDir = path.resolve(base, agent.skills.dir);
                const canonicalSkillsDir = path.resolve(base, ".agents/skills");
                if (agentSkillsDir === canonicalSkillsDir) return;

                yield* createSymlink({ target: canonicalPath, link: agentSkillPath }).pipe(
                  Effect.catchAll(() => Effect.void),
                );
              }),
            { concurrency: "unbounded" },
          );

          yield* log.info(`Installed ${targetName}`);
        }),
      { concurrency: 1 },
    );

    yield* log.success("Done");
  });
