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
import type { InstallSkillOperation, UninstallSkillOperation } from "../operations.js";
import { buildUpdatePlan } from "./build-plan.js";
import { installSkill } from "../install/install-skill.js";
import { uninstallSkill } from "../uninstall/uninstall-skill.js";

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
 * 1. Load configured skills and filter to managed + enabled
 * 2. If no eligible skills, log info and return
 * 3. Filter by source argument if provided
 * 4. Filter by --skill glob patterns
 * 5. Re-resolve each source string and discover skills
 * 6. Handle re-resolution failures (warn individual, error if all fail)
 * 7. Detect renames (skill name not found in source)
 * 8. Build operations with force flag
 * 9. Build update plan
 * 10. Resolve plan via workspace
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

    // Step 1: Load all configured skills and filter to managed + enabled
    const allSkills = yield* ws.getConfiguredSkills();
    const lockedSkills = yield* ws.getLockedSkills();

    const skillEntries: Array<[string, string]> = [];
    for (const [name, entry] of Object.entries(allSkills)) {
      if (!entry.managed) {
        yield* log.info(`Skipping ${name} (unmanaged)`);
        continue;
      }
      if (!entry.enabled) {
        yield* log.info(`Skipping ${name} (disabled)`);
        continue;
      }
      // Managed + enabled entries always have Some source
      const source = Option.getOrThrow(entry.source);
      skillEntries.push([name, source]);
    }

    if (skillEntries.length === 0) {
      yield* log.info("No skills installed. Nothing to update.");
      return;
    }

    // Step 2: Filter by source argument if provided
    const sourceValue = Option.getOrUndefined(args.source);
    const sourceFilteredEntries =
      sourceValue !== undefined
        ? yield* Effect.gen(function* () {
            const sourceArg = yield* resolveSource(sourceValue).pipe(
              Effect.mapError((error) =>
                makeCliError({
                  code: "INVALID_SOURCE",
                  what: `Invalid source: ${error.message}`,
                  details: [`Provided: ${sourceValue}`],
                  cause: error,
                }),
              ),
            );
            return yield* Effect.forEach(
              skillEntries,
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
                          return resolved.owner === sourceArg.owner &&
                            resolved.repo === sourceArg.repo
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
          })
        : skillEntries;

    // Step 3: Filter by --skill glob patterns
    const filteredEntries = (() => {
      if (args.skills.length === 0) return sourceFilteredEntries;
      const allNames = sourceFilteredEntries.map(([name]) => name);
      const matchedNames = expandGlobs(args.skills, allNames);
      const matchedSet = new Set(matchedNames);
      return sourceFilteredEntries.filter(([name]) => matchedSet.has(name));
    })();
    if (args.skills.length > 0) {
      if (filteredEntries.length === 0) {
        yield* log.warn("No installed skills match the --skill filter. Nothing to update.");
        return;
      }
    }

    // Step 4: Re-resolve each source and discover skills
    type ResolveResult =
      | { type: "match"; ref: SkillRef }
      | { type: "rename"; oldName: string; newRef: SkillRef };

    const resolveHandle = yield* spinnerSvc.start("Resolving sources...");
    const results = yield* Effect.forEach(
      filteredEntries,
      ([name, sourceStr]) =>
        Effect.gen(function* () {
          const source = yield* resolveSource(sourceStr);

          // First try with name filter (fast path)
          const namedRefs = yield* sources.resolveExtension(source, {
            names: [name],
            agents: args.agents,
            type: "skill",
          });
          const namedSkillRefs = Array.filter(namedRefs, (r): r is SkillRef => r.type === "skill");
          const skillRef = namedSkillRefs.find((r) => r.skill.name === name);

          if (skillRef) {
            // For registry sources, fetch to temp
            if (skillRef.source.type === "registry") {
              const files = yield* sources.fetch(skillRef);
              return Option.some<ResolveResult>({
                type: "match",
                ref: { ...skillRef, location: `file://${files.directory}` },
              });
            }
            return Option.some<ResolveResult>({ type: "match", ref: skillRef });
          }

          // Skill not found by name — re-resolve without name filter for rename detection
          const allRefs = yield* sources.resolveExtension(source, {
            names: [],
            agents: args.agents,
            type: "skill",
          });
          const allSkillRefs = Array.filter(allRefs, (r): r is SkillRef => r.type === "skill");

          if (allSkillRefs.length === 1) {
            // Single-skill source: treat as rename
            const newRef = allSkillRefs[0]!;
            const resolvedNewRef =
              newRef.source.type === "registry"
                ? { ...newRef, location: `file://${(yield* sources.fetch(newRef)).directory}` }
                : newRef;
            return Option.some<ResolveResult>({
              type: "rename",
              oldName: name,
              newRef: resolvedNewRef,
            });
          } else if (allSkillRefs.length > 1) {
            // Multi-skill source: ambiguous rename
            const availableNames = allSkillRefs.map((r) => r.skill.name).join(", ");
            yield* log.warn(
              `Skill "${name}" not found in source. Available skills: ${availableNames}. Use \`axm skills rename ${name} <new-name>\` to update.`,
            );
            return Option.none<ResolveResult>();
          } else {
            yield* log.warn(`Skill "${name}" not found in source ${printSourceInput(source)}`);
            return Option.none<ResolveResult>();
          }
        }).pipe(
          Effect.catchAll((error) => {
            return log
              .warn(`Failed to resolve "${name}": ${String(error)}`)
              .pipe(Effect.map(() => Option.none<ResolveResult>()));
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
    const ops: Array<InstallSkillOperation | UninstallSkillOperation> = [];

    for (const item of resolved) {
      if (item.type === "match") {
        ops.push({
          name: "install-skill",
          args: {
            agents: agentIds,
            force: args.force,
            source: item.ref.source,
            skill: item.ref.skill,
            location: item.ref.location,
            version: item.ref.version,
            gitTreeSha: item.ref.gitTreeSha,
          },
        } satisfies InstallSkillOperation);
      } else {
        // Rename: install new name + uninstall old name
        ops.push({
          name: "install-skill",
          args: {
            agents: agentIds,
            force: args.force,
            source: item.newRef.source,
            skill: item.newRef.skill,
            location: item.newRef.location,
            version: item.newRef.version,
            gitTreeSha: item.newRef.gitTreeSha,
          },
        } satisfies InstallSkillOperation);
        ops.push({
          name: "uninstall-skill",
          args: {
            skillName: item.oldName,
            agents: [],
          },
        } satisfies UninstallSkillOperation);
      }
    }

    // Step 7: Build plan
    const lockfile = { lockfileVersion: 1, skills: lockedSkills };
    const plan = buildUpdatePlan(
      ops,
      lockfile,
      "Update skill(s)",
      Option.some("Update installed skills"),
    );

    // Step 8: Resolve plan
    yield* ws.resolvePlan(plan, {
      "install-skill": installSkill,
      "uninstall-skill": uninstallSkill,
    });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("Update.handle"));
};
