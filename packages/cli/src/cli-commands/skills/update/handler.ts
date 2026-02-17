/**
 * Update command handler - Effect-based orchestration for `axm skills update`.
 *
 * Re-resolves installed skills from their sources and updates those that have
 * changed. Uses buildUpdatePlan to diff current vs re-resolved state.
 * Applies version constraint priority (user explicit > pack constraints).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import {
  resolveSource,
  SourceHostProviders,
  type SkillExtensionRef,
} from "../../../sources/index.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeCliError } from "../../../cli-error/index.js";
import { expandGlobs } from "../../../skills/index.js";
import { Log, Spinner } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import { PackManifestSchema } from "../../../extensions/packs/manifest-schema.js";
import { parseVersionConstraint } from "../../../version-constraints/index.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../../extensions/constants.js";
import { PACK_MANIFEST_FILENAME } from "../../packs/constants.js";
import type { InstallSkillOperation, UninstallSkillOperation } from "../operations.js";
import { buildUpdatePlan } from "./build-plan.js";
import { installSkill } from "../install/install-skill.js";
import { uninstallSkill } from "../uninstall/uninstall-skill.js";
import {
  detectHoldbackWarnings,
  type PackConstraint,
  type SkillConstraints,
} from "./constraint-resolution.js";

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
 * 5. Collect version constraints (user + pack manifests)
 * 6. Re-resolve each source string and discover skills
 * 7. Handle re-resolution failures (warn individual, error if all fail)
 * 8. Detect renames (skill name not found in source)
 * 9. Emit holdback warnings
 * 10. Build operations with force flag
 * 11. Build update plan
 * 12. Resolve plan via workspace
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUpdate = (args: UpdateHandlerArgs) => {
  const scopeLabel = args.global ? "global" : "project";

  return Effect.gen(function* () {
    const ws = yield* Workspace;
    const sources = yield* SourceHostProviders;
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
            // Compare sources by identity using canonical origin string
            const sourceArgOrigin = sources.origin(sourceArg);
            return yield* Effect.forEach(
              skillEntries,
              ([name, sourceStr]) =>
                resolveSource(sourceStr).pipe(
                  Effect.map((resolved) =>
                    sources.origin(resolved) === sourceArgOrigin
                      ? Option.some([name, sourceStr] as [string, string])
                      : Option.none<[string, string]>(),
                  ),
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

    // Step 4: Collect pack constraints from installed pack manifests
    const packConstraintMap = yield* collectPackConstraints(ws.path);

    // Step 5: Re-resolve each source and discover skills
    type ResolveResult =
      | { type: "match"; ref: SkillExtensionRef; fetchedLocation?: string }
      | { type: "rename"; oldName: string; newRef: SkillExtensionRef; fetchedLocation?: string };

    const resolveHandle = yield* spinnerSvc.start("Resolving sources...");
    const results = yield* Effect.forEach(
      filteredEntries,
      ([name, sourceStr]) =>
        Effect.gen(function* () {
          const source = yield* resolveSource(sourceStr);

          // First try with name filter (fast path)
          const namedRefs = yield* sources.find(source, {
            names: [name],
            agents: args.agents,
            type: "skill",
          });
          const namedSkillRefs = Array.filter(
            namedRefs,
            (r): r is SkillExtensionRef => r.type === "skill",
          );
          const skillRef = namedSkillRefs.find((r) => r.skill.name === name);

          if (skillRef) {
            // For registry sources, fetch to temp
            if (skillRef.source.type === "registry") {
              const files = yield* sources.fetch(skillRef);
              return Option.some<ResolveResult>({
                type: "match",
                ref: skillRef,
                fetchedLocation: `file://${files.directory}`,
              });
            }
            return Option.some<ResolveResult>({ type: "match", ref: skillRef });
          }

          // Skill not found by name — re-resolve without name filter for rename detection
          const allRefs = yield* sources.find(source, {
            names: [],
            agents: args.agents,
            type: "skill",
          });
          const allSkillRefs = Array.filter(
            allRefs,
            (r): r is SkillExtensionRef => r.type === "skill",
          );

          if (allSkillRefs.length === 1) {
            // Single-skill source: treat as rename
            const newRef = allSkillRefs[0]!;
            const base: ResolveResult = { type: "rename", oldName: name, newRef };
            if (newRef.source.type === "registry") {
              const fetched = yield* sources.fetch(newRef);
              return Option.some<ResolveResult>({
                ...base,
                fetchedLocation: `file://${fetched.directory}`,
              });
            }
            return Option.some<ResolveResult>(base);
          } else if (allSkillRefs.length > 1) {
            // Multi-skill source: ambiguous rename
            const availableNames = allSkillRefs.map((r) => r.skill.name).join(", ");
            yield* log.warn(
              `Skill "${name}" not found in source. Available skills: ${availableNames}. Use \`axm skills rename ${name} <new-name>\` to update.`,
            );
            return Option.none<ResolveResult>();
          } else {
            yield* log.warn(`Skill "${name}" not found in source ${sources.origin(source)}`);
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

    // Step 6: Collect successful resolutions
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

    // Step 7: Emit holdback warnings for registry skills held back by pack constraints
    for (const item of resolved) {
      if (item.type !== "match") continue;
      if (item.ref.source.type !== "registry") continue;
      if (!("version" in item.ref)) continue;
      const skillFqn = `${item.ref.source.scope}/${item.ref.skill.name}`;
      const packConstraints = packConstraintMap.get(skillFqn) ?? [];
      if (packConstraints.length === 0) continue;

      // Get user constraint from the settings source string
      const settingsEntry = filteredEntries.find(([name]) => name === item.ref.skill.name);
      const userConstraint =
        settingsEntry !== undefined ? parseVersionConstraint(settingsEntry[1]) : Option.none();

      const constraints: SkillConstraints = { userConstraint, packConstraints };
      const warnings = detectHoldbackWarnings(
        item.ref.version,
        item.ref.version,
        constraints,
        skillFqn,
      );
      for (const warning of warnings) {
        yield* log.warn(warning);
      }
    }

    // Step 8: Build operations
    const agentIds = yield* ws.getConfiguredAgents();
    const ops = Array.flatMap(resolved, (item) =>
      item.type === "match"
        ? [
            {
              name: "install-skill",
              args: {
                ref: item.ref,
                agents: agentIds,
                force: args.force,
                fetchedLocation: item.fetchedLocation,
              },
            } satisfies InstallSkillOperation,
          ]
        : [
            // Rename: install new name + uninstall old name
            {
              name: "install-skill",
              args: {
                ref: item.newRef,
                agents: agentIds,
                force: args.force,
                fetchedLocation: item.fetchedLocation,
              },
            } satisfies InstallSkillOperation,
            {
              name: "uninstall-skill",
              args: {
                skillName: item.oldName,
                agents: [],
              },
            } satisfies UninstallSkillOperation,
          ],
    );

    // Step 9: Build plan
    const lockfile = { lockfileVersion: 1, skills: lockedSkills };
    const plan = buildUpdatePlan(
      ops,
      lockfile,
      "Update skill(s)",
      Option.some("Update installed skills"),
    );

    // Step 10: Resolve plan
    yield* ws.resolvePlan(plan, {
      "install-skill": installSkill,
      "uninstall-skill": uninstallSkill,
    });

    yield* log.success("Done");
  }).pipe(Effect.withSpan("Update.handle"));
};

// -----------------------------------------------------------------------------
// Pack Constraint Collection
// -----------------------------------------------------------------------------

/**
 * Read installed pack manifests and collect per-skill constraints.
 *
 * Returns a map from skill FQN (e.g., "@acme/code-review") to an array of
 * pack constraints. Silently skips packs whose manifest can't be read.
 */
const collectPackConstraints = (axmDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const base = path.dirname(axmDir);

    // Read lockfile to find installed packs
    const ws = yield* Workspace;
    const lockedPacks = yield* ws.getLockedPacks();

    const constraintMap = new Map<string, Array<PackConstraint>>();

    // Read each pack's manifest from disk
    yield* Effect.forEach(
      Object.entries(lockedPacks),
      ([packName, packEntry]) =>
        Effect.gen(function* () {
          // Skip builtin packs — they don't have on-disk manifests
          if (packEntry.type === "builtin") return;

          const packDir = path.join(
            base,
            REGISTRY_EXTENSIONS_DIR,
            packEntry.scope,
            "packs",
            packName,
          );
          const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);

          const exists = yield* fs
            .exists(manifestPath)
            .pipe(Effect.catchAll(() => Effect.succeed(false)));
          if (!exists) return;

          const content = yield* fs
            .readFileString(manifestPath)
            .pipe(Effect.catchAll(() => Effect.succeed("")));
          if (content === "") return;

          const json = yield* Effect.try({
            try: () => JSON.parse(content) as unknown,
            catch: () => undefined,
          }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
          if (json === undefined) return;

          const manifest = yield* Schema.decodeUnknown(PackManifestSchema)(json).pipe(
            Effect.catchAll(() => Effect.succeed(undefined)),
          );
          if (manifest === undefined) return;

          // Collect skill constraints from manifest
          const skills = manifest.skills ?? {};
          for (const [fqn, constraint] of Object.entries(skills)) {
            if (constraint === "*" || constraint === "") continue;
            const existing = constraintMap.get(fqn) ?? [];
            existing.push({ packName, constraint });
            constraintMap.set(fqn, existing);
          }
        }),
      { concurrency: "unbounded" },
    );

    return constraintMap;
  });
