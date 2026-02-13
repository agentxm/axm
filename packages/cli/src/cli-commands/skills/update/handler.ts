/**
 * Update command handler - Effect-based orchestration for `axm skills update`.
 *
 * Re-resolves installed skills from their sources and updates those that have
 * changed. Uses buildUpdatePlan to diff current vs re-resolved state.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  resolveSource,
  SourceProviders,
  printSourceInput,
  type SkillRef,
} from "../../../sources/index.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeCliError } from "../../../cli-error/index.js";
import { expandGlobs } from "../../../skills/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import type { InstallSkillOperation } from "../operations.js";
import { buildUpdatePlan } from "./build-plan.js";
import { installSkill } from "../install/install-skill.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the update command.
 */
export interface UpdateHandlerArgs {
  /** Optional source to filter skills by */
  readonly source: Option.Option<string>;
  /** Use global workspace */
  readonly global: boolean;
  /** Target agent(s) */
  readonly agents: readonly string[];
  /** Specific skill(s) to update (by name/glob) */
  readonly skills: readonly string[];
  /** Skip confirmations */
  readonly yes: boolean;
  /** Overwrite regardless of version */
  readonly force: boolean;
  /** Disable prompts */
  readonly nonInteractive: Option.Option<boolean>;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills update` command.
 *
 * Flow:
 * 1. Load installed skills from settings and locked skills from lockfile
 * 2. If no skills installed, log info and return
 * 3. Filter by source argument if provided
 * 4. Filter by --skill glob patterns
 * 5. Re-resolve each source string and discover skills
 * 6. Handle re-resolution failures (warn individual, error if all fail)
 * 7. Build InstallSkillOperations with force flag
 * 8. Build update plan
 * 9. Resolve plan via workspace
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUpdate = (args: UpdateHandlerArgs) => {
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    const ws = yield* Workspace;
    const sources = yield* SourceProviders;
    const log = yield* Log;
    const spinnerSvc = yield* Spinner;

    yield* log.info(`axm skills update (${scopeLabel})`);

    // Step 1: Load installed skills (settings) and locked skills (lockfile)
    const installedSkills = yield* ws.getInstalledSkills();
    const lockedSkills = yield* ws.getLockedSkills();
    const skillEntries = Object.entries(installedSkills);

    if (skillEntries.length === 0) {
      yield* log.info("No skills installed. Nothing to update.");
      return;
    }

    // Step 2: Filter by source argument if provided
    let filteredEntries = skillEntries;
    if (Option.isSome(args.source)) {
      const sourceArg = yield* resolveSource(args.source.value).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "INVALID_SOURCE",
            what: `Invalid source: ${error.message}`,
            details: [`Provided: ${args.source.pipe(Option.getOrElse(() => "(empty)"))}`],
            cause: error,
          }),
        ),
      );
      filteredEntries = yield* Effect.forEach(
        filteredEntries,
        ([name, sourceStr]) =>
          resolveSource(sourceStr).pipe(
            Effect.map((resolved) => {
              // Compare by type + identity fields (ignoring ref/version)
              if (resolved.type !== sourceArg.type) return Option.none<[string, string]>();
              switch (resolved.type) {
                case "github":
                case "gitlab":
                case "bitbucket":
                  if (
                    sourceArg.type === resolved.type &&
                    "owner" in sourceArg &&
                    "repo" in sourceArg
                  ) {
                    return resolved.owner === sourceArg.owner && resolved.repo === sourceArg.repo
                      ? Option.some([name, sourceStr] as [string, string])
                      : Option.none<[string, string]>();
                  }
                  return Option.none<[string, string]>();
                case "local":
                  return sourceArg.type === "local" && resolved.path === sourceArg.path
                    ? Option.some([name, sourceStr] as [string, string])
                    : Option.none<[string, string]>();
                case "registry":
                  return sourceArg.type === "registry" &&
                    resolved.scope === sourceArg.scope &&
                    resolved.name === sourceArg.name
                    ? Option.some([name, sourceStr] as [string, string])
                    : Option.none<[string, string]>();
                default:
                  return Option.some([name, sourceStr] as [string, string]);
              }
            }),
            Effect.catchAll(() => Effect.succeed(Option.none<[string, string]>())),
          ),
        { concurrency: "unbounded" },
      ).pipe(Effect.map(Array.getSomes));
    }

    // Step 3: Filter by --skill glob patterns
    if (args.skills.length > 0) {
      const allNames = filteredEntries.map(([name]) => name);
      const matchedNames = expandGlobs(args.skills, allNames);
      const matchedSet = new Set(matchedNames);
      filteredEntries = filteredEntries.filter(([name]) => matchedSet.has(name));
      if (filteredEntries.length === 0) {
        yield* log.warn("No installed skills match the --skill filter. Nothing to update.");
        return;
      }
    }

    // Step 4: Re-resolve each source and discover skills
    const resolveHandle = yield* spinnerSvc.start("Resolving sources...");
    const results = yield* Effect.forEach(
      filteredEntries,
      ([name, sourceStr]) =>
        Effect.gen(function* () {
          const source = yield* resolveSource(sourceStr);
          const refs = yield* sources.resolveExtension(source, {
            names: [name],
            agents: args.agents,
            type: "skill",
          });
          // Filter to skill refs only and find matching name
          const skillRefs = Array.filter(refs, (r): r is SkillRef => r.type === "skill");
          const skillRef = skillRefs.find((r) => r.skill.name === name);
          if (!skillRef) {
            yield* log.warn(`Skill "${name}" not found in source ${printSourceInput(source)}`);
            return Option.none<SkillRef>();
          }
          // For registry sources, fetch to temp
          if (skillRef.source.type === "registry") {
            const files = yield* sources.fetch(skillRef);
            return Option.some({ ...skillRef, location: `file://${files.directory}` });
          }
          return Option.some(skillRef);
        }).pipe(
          Effect.catchAll((error) => {
            return log
              .warn(`Failed to resolve "${name}": ${String(error)}`)
              .pipe(Effect.map(() => Option.none<SkillRef>()));
          }),
        ),
      { concurrency: "unbounded" },
    );
    yield* resolveHandle.stop("Sources resolved");

    // Step 5: Collect successful resolutions
    const resolved = Array.getSomes(results);
    if (resolved.length === 0) {
      return yield* Effect.fail(
        makeCliError({
          code: "UPDATE_FAILED",
          what: "All source re-resolutions failed. Nothing to update.",
          howToFix: "Verify the original source paths are still accessible.",
        }),
      );
    }

    // Step 6: Build operations
    const agentIds = yield* ws.getConfiguredAgents();
    const ops = resolved.map(
      (ref) =>
        ({
          name: "install-skill",
          args: {
            agents: agentIds,
            force: args.force,
            source: ref.source,
            skill: ref.skill,
            location: ref.location,
            version: ref.version,
            gitTreeSha: ref.gitTreeSha,
          },
        }) satisfies InstallSkillOperation,
    );

    // Step 7: Build plan
    const lockfile = { lockfileVersion: 1, skills: lockedSkills };
    const plan = buildUpdatePlan(
      ops,
      lockfile,
      "Update skill(s)",
      Option.some("Update installed skills"),
    );

    // Step 8: Resolve plan
    yield* ws.resolvePlan(plan, { "install-skill": installSkill });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("Update.handle"));
};
