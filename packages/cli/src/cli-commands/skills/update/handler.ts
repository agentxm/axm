/**
 * Update command handler - Effect-based orchestration for `axm skills update`.
 *
 * Re-resolves installed skills from their sources and updates those that have
 * changed. Uses buildUpdatePlan to diff current vs re-resolved state.
 * Applies version constraint priority (user explicit > pack constraints).
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  resolveSource,
  SourceHostProviders,
  type SkillExtensionRef,
} from "../../../sources/index.js";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../../../app-error/index.js";
import { CliFlags } from "../../../cli-flags/index.js";
import { expandGlobs } from "../../../skills/index.js";
import { Output } from "../../../output/index.js";
import { Activity } from "../../../activity/index.js";
import { Workspace } from "../../../workspace/index.js";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
  REGISTRY_EXTENSIONS_DIR,
} from "../../../extensions/index.js";
import { parseVersionConstraint } from "../../../version-constraints/index.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";
import { buildUpdatePlan } from "./plan.js";
import { installSkill } from "../../../extensions/skills/operations/install.js";
import { uninstallSkill } from "../../../extensions/skills/operations/uninstall.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";
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
  /** Target agent(s) */
  readonly agents: readonly string[];
  /** Specific skill(s) to update (by name/glob) */
  readonly skills: readonly string[];
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm skills update` command.
 *
 * Flow:
 * 1. Load configured skills and filter to enabled
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
export const handleUpdate = Effect.fn("Update.handle")(function* (args: UpdateHandlerArgs) {
  const ws = yield* Workspace;
  const sources = yield* SourceHostProviders;
  const output = yield* Output;
  const activity = yield* Activity;
  const flags = yield* CliFlags;

  yield* output.info(`axm skills update (${ws.scope})`);

  // Step 1: Load configured skills and filter to enabled
  const allSkills = yield* ws.getConfiguredSkills();
  const lockedSkills = yield* ws.getLockedSkills();

  const skillEntries = yield* Effect.forEach(Object.entries(allSkills), ([name, entry]) =>
    Effect.gen(function* () {
      if (!entry.enabled) {
        yield* output.info(`Skipping ${name} (disabled)`);
        return Option.none<readonly [string, string]>();
      }
      return Option.some([name, entry.source] as const);
    }),
  ).pipe(Effect.map(Array.getSomes));

  if (skillEntries.length === 0) {
    yield* output.info("No skills installed. Nothing to update.");
    return;
  }

  // Step 2: Filter by source argument if provided
  const sourceValue = Option.getOrUndefined(args.source);
  const sourceFilteredEntries =
    sourceValue !== undefined
      ? yield* Effect.gen(function* () {
          const sourceArg = yield* resolveSource(sourceValue).pipe(
            Effect.mapError((error) =>
              makeAppError({
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
                Effect.catch(() => Effect.succeed(Option.none<[string, string]>())),
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
      yield* output.warn("No installed skills match the --skill filter. Nothing to update.");
      return;
    }
  }

  // Step 4: Collect pack constraints from installed pack manifests
  const packConstraintMap = yield* collectPackConstraints();

  // Step 5: Re-resolve each source and discover skills
  type ResolveResult =
    | { type: "match"; ref: SkillExtensionRef }
    | { type: "rename"; oldName: string; newRef: SkillExtensionRef };

  const results = yield* activity.withSpinner(
    "Resolving sources...",
    () =>
      Effect.forEach(
        filteredEntries,
        ([name, sourceStr]) =>
          Effect.gen(function* () {
            const source = yield* resolveSource(sourceStr);

            // First try with name filter (fast path)
            const namedRefs = yield* sources.find(source, {
              skillNames: [name],
              type: "skill",
              profile: Option.none(),
              versionConstraint: Option.none(),
            });
            const namedSkillRefs = Array.filter(
              namedRefs,
              (r): r is SkillExtensionRef => r.type === "skill",
            );
            const skillRef = namedSkillRefs.find((r) => r.skill.name === name);

            if (skillRef) {
              return Option.some<ResolveResult>({ type: "match", ref: skillRef });
            }

            // Skill not found by name — re-resolve without name filter for rename detection
            const allRefs = yield* sources.find(source, {
              skillNames: [],
              type: "skill",
              profile: Option.none(),
              versionConstraint: Option.none(),
            });
            const allSkillRefs = Array.filter(
              allRefs,
              (r): r is SkillExtensionRef => r.type === "skill",
            );

            if (allSkillRefs.length === 1) {
              // Single-skill source: treat as rename
              const newRef = allSkillRefs[0]!;
              return Option.some<ResolveResult>({ type: "rename", oldName: name, newRef });
            } else if (allSkillRefs.length > 1) {
              // Multi-skill source: ambiguous rename
              const availableNames = allSkillRefs.map((r) => r.skill.name).join(", ");
              yield* output.warn(
                `Skill "${name}" not found in source. Available skills: ${availableNames}. Use \`axm skills rename ${name} <new-name>\` to update.`,
              );
              return Option.none<ResolveResult>();
            } else {
              yield* output.warn(`Skill "${name}" not found in source ${sources.origin(source)}`);
              return Option.none<ResolveResult>();
            }
          }).pipe(
            Effect.catch((error) => {
              return output
                .warn(`Failed to resolve "${name}": ${String(error)}`)
                .pipe(Effect.map(() => Option.none<ResolveResult>()));
            }),
          ),
        { concurrency: "unbounded" },
      ),
    { successMessage: "Sources resolved" },
  );

  // Step 6: Collect successful resolutions
  const resolved = Array.getSomes(results);
  if (resolved.length === 0) {
    return yield* Effect.fail(
      makeAppError({
        code: "UPDATE_FAILED",
        what: "All source re-resolutions failed. Nothing to update.",
        howToFix: "Verify the original source paths are still accessible.",
      }),
    );
  }

  // Step 7: Emit holdback warnings for registry skills held back by pack constraints
  const holdbackWarnings = Array.flatMap(
    resolved.filter(
      (item): item is typeof item & { type: "match" } =>
        item.type === "match" && item.ref.type === "skill" && item.ref.refType === "registry",
    ),
    (item) => {
      const registryRef = item.ref as {
        readonly profile: string;
        readonly skill: { readonly name: string };
        readonly version: string;
      };
      const skillFqn = `${registryRef.profile}/skills/${registryRef.skill.name}`;
      const packConstraints = packConstraintMap.get(skillFqn) ?? [];
      if (packConstraints.length === 0) return [];

      const settingsEntry = filteredEntries.find(([name]) => name === registryRef.skill.name);
      const userConstraint =
        settingsEntry !== undefined ? parseVersionConstraint(settingsEntry[1]) : Option.none();

      const constraints: SkillConstraints = { userConstraint, packConstraints };
      // TODO: Bug — registryRef.version is the already-resolved version, not the latest available.
      // detectHoldbackWarnings compares latestVersion vs resolvedVersion to detect when a pack
      // constraint holds back a skill. Passing the same value for both means warnings are never
      // emitted. To fix properly, we need a separate registry query for the latest version
      // (without constraints), which is not available in the current resolution flow.
      return detectHoldbackWarnings(
        registryRef.version,
        registryRef.version,
        constraints,
        skillFqn,
      );
    },
  );
  yield* Effect.forEach(holdbackWarnings, (w) => output.warn(w), { discard: true });

  // Step 8: Build operations
  const ops = Array.flatMap(resolved, (item) => {
    if (item.type === "match") {
      const existingLock = lockedSkills[item.ref.skill.name];
      const existingInstalledAt = Option.fromUndefinedOr(existingLock?.installedAt);
      return [
        {
          name: "install-skill",
          args: {
            ref: item.ref,
            force: flags.force,
            versionConstraint: Option.none(),
            skipSettings: Option.none(),
            existingInstalledAt,
            sourceName: Option.none(),
          },
        } satisfies InstallSkillOperation,
      ];
    }
    // Rename: install new name + uninstall old name — preserve original installedAt
    const existingLock = lockedSkills[item.oldName];
    const existingInstalledAt = Option.fromUndefinedOr(existingLock?.installedAt);
    return [
      {
        name: "install-skill",
        args: {
          ref: item.newRef,
          force: flags.force,
          versionConstraint: Option.none(),
          skipSettings: Option.none(),
          existingInstalledAt,
          sourceName: Option.none(),
        },
      } satisfies InstallSkillOperation,
      {
        name: "uninstall-skill",
        args: {
          skillName: item.oldName,
          agents: [],
        },
      } satisfies UninstallSkillOperation,
    ];
  });

  // Step 9: Build plan
  const lockfile = { lockfileVersion: 1, skills: lockedSkills };
  const plan = buildUpdatePlan(
    ops,
    lockfile,
    "Update skill(s)",
    Option.some("Update installed skills"),
  );

  // Step 10: Resolve plan
  yield* ws.resolvePlan(
    bridgeLegacyPlan(plan, {
      "install-skill": installSkill,
      "uninstall-skill": uninstallSkill,
    }),
  );

  yield* output.success("Done");
});

// -----------------------------------------------------------------------------
// Pack Constraint Collection
// -----------------------------------------------------------------------------

/**
 * Read installed pack manifests and collect per-skill constraints.
 *
 * Returns a map from skill FQN (e.g., "@acme/skills/code-review") to an array of
 * pack constraints. Silently skips packs whose manifest can't be read.
 */
const collectPackConstraints = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    // Read lockfile to find installed packs
    const lockedPacks = yield* ws.getLockedPacks();

    const constraintMap = new Map<string, Array<PackConstraint>>();

    // Read each pack's manifest from disk (sequential to avoid data race on constraintMap)
    yield* Effect.forEach(Object.entries(lockedPacks), ([packName, packEntry]) =>
      Effect.gen(function* () {
        // Skip builtin packs — they don't have on-disk manifests
        if (packEntry.type === "builtin") return;

        const packDir = path.join(
          base,
          REGISTRY_EXTENSIONS_DIR,
          packEntry.profile,
          "packs",
          packName,
        );
        const manifestPath = path.join(packDir, PACK_MANIFEST_FILENAME);

        const exists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!exists) return;

        const content = yield* fs
          .readFileString(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed("")));
        if (content === "") return;

        const json = yield* Effect.sync(() => {
          try {
            return Option.some(JSON.parse(content) as unknown);
          } catch {
            return Option.none<unknown>();
          }
        });
        if (Option.isNone(json)) return;

        const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json.value).pipe(
          Effect.option,
        );
        if (Option.isNone(manifest)) return;

        // Collect skill constraints from manifest
        const skills = manifest.value.skills;
        if (skills === null || skills === undefined || typeof skills !== "object") {
          return;
        }
        for (const [fqn, constraint] of Object.entries(skills)) {
          if (typeof constraint !== "string" || constraint === "*" || constraint === "") continue;
          const existing = constraintMap.get(fqn) ?? [];
          existing.push({ packName, constraint });
          constraintMap.set(fqn, existing);
        }
      }),
    );

    return constraintMap;
  });
