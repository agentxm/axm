/**
 * Fork command handler — Effect-based orchestration for `axm skills fork`.
 *
 * Converts an unmanaged skill into a managed extension:
 * 1. Registry guard (ensure registry configured)
 * 2. Resolve input (installed skill name, source string, or glob)
 * 3. Scope resolution
 * 4. Uniqueness check
 * 5. Build plan: fork → publish (sequential)
 * 6. Execute via resolvePlan
 * 7. Post-plan: update lockfile + create agent symlinks
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import {
  parseSourceInput,
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
import { expandGlob } from "../uninstall/glob.js";
import type { PlannedJobStep } from "../../../workspace/plan.js";
import { createSymlink } from "../../../utils/create-symlink.js";
import { getAgentById } from "../../../agents/registry.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the fork command.
 */
export interface ForkHandlerArgs {
  /** Installed skill name, source string, or glob pattern. */
  readonly source: string;
  /** Skip confirmations. */
  readonly yes: boolean;
}

/** Intermediate type for resolved skills. */
interface ResolvedSkill {
  readonly name: string;
  readonly location: string;
}

type ForkOp = ForkSkillOperation | PublishSkillOperation;

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

export class ForkError extends Data.TaggedError("ForkError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const isGlobPattern = (input: string): boolean => input.includes("*");

/**
 * Get the relative path of an installed skill from its lockfile entry.
 */
const getInstalledSkillRelativePath = (
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lockfile entry shape varies by source type
  entry: any,
): string => {
  if (entry?.source === "registry") {
    return `.axm/extensions/${entry.scope}/skills/${name}`;
  }
  return `.agents/skills/${name}`;
};

const REGISTRY_EXTENSIONS_DIR = ".axm/extensions";

/**
 * Resolve source skill names from the input.
 *
 * - Glob pattern: match against installed skill names
 * - Installed skill name: look up in lockfile
 * - Source string: discover via SourceProviders
 *
 * Locations for installed skills are resolved to absolute file:// URLs.
 */
const resolveInputSkills = (input: string, base: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const ls = yield* LockfileService;
    const lockedSkills = yield* ls.getSkills();
    const installedNames = Object.keys(lockedSkills);

    // Glob pattern → match against installed skills
    if (isGlobPattern(input)) {
      const matches = expandGlob(input, installedNames);
      if (matches.length === 0) {
        return yield* new ForkError({
          message: formatError(
            "No installed skills match the pattern",
            [`Pattern: ${input}`],
            "Check installed skills with `axm skills list`.",
          ),
          cause: undefined,
        });
      }

      return matches.map((name) => ({
        name,
        location: `file://${path.resolve(base, getInstalledSkillRelativePath(name, lockedSkills[name]))}`,
      })) satisfies ReadonlyArray<ResolvedSkill>;
    }

    // Installed skill name → read from lockfile
    if (input in lockedSkills) {
      return [
        {
          name: input,
          location: `file://${path.resolve(base, getInstalledSkillRelativePath(input, lockedSkills[input]))}`,
        },
      ] satisfies ReadonlyArray<ResolvedSkill>;
    }

    // Source string → discover via SourceProviders
    const sources = yield* SourceProviders;
    const parsedSource = yield* parseSourceInput(input).pipe(
      Effect.mapError(
        (error) =>
          new ForkError({
            message: formatError(
              `Invalid source: ${error.message}`,
              [`Provided: ${input}`],
              "Valid formats: installed skill name, local path, github:owner/repo, or glob pattern",
            ),
            cause: error,
          }),
      ),
    );

    const refs = yield* sources
      .resolve(parsedSource, {
        names: [],
        agents: [],
        type: "skill",
      })
      .pipe(
        Effect.mapError(
          (error) =>
            new ForkError({
              message: formatError(
                `Failed to discover skills: ${error.message}`,
                [`Source: ${printSource(parsedSource)}`],
                "Verify the source path contains directories with SKILL.md files.",
              ),
              cause: error,
            }),
        ),
      );

    const skillRefs = Array.filter(refs, (ref) => ref.type === "skill");
    if (skillRefs.length === 0) {
      return yield* new ForkError({
        message: formatError(
          "No skills found in source",
          [`Source: ${printSource(parsedSource)}`],
          "Verify the source path contains directories with SKILL.md files.",
        ),
        cause: undefined,
      });
    }

    return skillRefs.map((ref) => ({
      name: ref.skill.name,
      location: ref.location,
    })) satisfies ReadonlyArray<ResolvedSkill>;
  });

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

    // Step 3: Resolve input skills
    const handle = yield* spinnerSvc.start("Resolving skills...");
    const resolvedSkills = yield* resolveInputSkills(args.source, base).pipe(
      Effect.tapError(() => handle.stop("Failed")),
    );
    yield* handle.stop(`Found ${resolvedSkills.length} skill(s)`);

    // Step 4: Get agents from settings
    const ss = yield* SettingsService;
    const agentIds = yield* ss.getAgents();

    // Step 5: Determine first registry source name for publishing
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

    // Step 6: Build plan — fork + publish per skill (2 sequential ops)
    const steps: ReadonlyArray<PlannedJobStep<ForkOp>> = resolvedSkills.flatMap((skill) => {
      const targetName = `${scope}/${skill.name}`;
      return [
        {
          _tag: "PlannedJobStep" as const,
          operation: {
            name: "fork-skill",
            args: {
              source: {
                source: "local",
                path: skill.location.replace("file://", ""),
              } satisfies ForkSkillOperation["args"]["source"],
              targetName,
              agents: [...agentIds],
              location: skill.location,
            },
          } satisfies ForkSkillOperation,
          expectedResult: { result: "success", message: `Forked ${skill.name} to ${targetName}` },
          label: `Fork ${skill.name}`,
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
      description: Option.some(`Fork and publish ${resolvedSkills.length} skill(s)`),
      jobs: [{ steps, concurrency: 1 as const }],
    };

    yield* ws.resolvePlan(plan, {
      "fork-skill": forkSkill,
      "publish-skill": publishSkill,
    });

    // Step 7: Post-plan — update lockfile + create agent symlinks
    // Done outside the plan because installSkill's pre-clean would delete
    // the managed extension directory that the fork step just created.
    const ls = yield* LockfileService;

    yield* Effect.forEach(
      resolvedSkills,
      (skill) =>
        Effect.gen(function* () {
          const targetName = `${scope}/${skill.name}`;
          const canonicalPath = path.join(
            base,
            REGISTRY_EXTENSIONS_DIR,
            scope,
            "skills",
            skill.name,
          );

          // Update lockfile
          yield* ls
            .updateEntry(
              skill.name,
              sourceToLockEntry({
                source: { source: "registry" },
                agents: [...agentIds],
                gitTreeSha: Option.none(),
                now: new Date(),
                registry: {
                  scope,
                  name: skill.name,
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

                const agentSkillPath = path.join(base, agent.skills.dir, skill.name);

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
