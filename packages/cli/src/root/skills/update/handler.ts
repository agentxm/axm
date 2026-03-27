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
  parseInputPattern,
  type InputPattern,
  type RegistrySource,
  type SkillExtensionRef,
} from "@axm.sh/core/unstable/sources";
import { resolveSource, SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { expandGlobs } from "@axm.sh/core/unstable/utils";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";

import { Workspace } from "@axm.sh/core/unstable/workspace";
import {
  PACK_MANIFEST_FILENAME,
  PackManifestSchema,
  REGISTRY_EXTENSIONS_DIR,
} from "@axm.sh/core/unstable/extensions";
import { createRegistryClient } from "@axm.sh/core/unstable/registry";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/extension-managers";
import type { UninstallSkillOperation } from "@axm.sh/core/unstable/extension-managers";
import { buildUpdatePlan } from "./plan.js";
import { installSkill } from "@axm.sh/core/unstable/extension-managers";
import { uninstallSkill } from "@axm.sh/core/unstable/extension-managers";
import { bridgeLegacyPlan } from "@axm.sh/core/unstable/workspace";
import { resolvePlan } from "@axm.sh/core/unstable/workspace";
import {
  detectHoldbackWarnings,
  resolveConstrainedVersion,
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
  /** Override constraints that would cause failure. */
  readonly force: boolean;
  /** Auto-accept confirmation prompts. */
  readonly yes: boolean;
  /** Display plan without applying. */
  readonly preview: boolean;
}

type RegistrySkillPattern = Extract<InputPattern, { readonly pattern: "registry-pattern-input" }>;

const toRegistrySkillPattern = (source: string): Option.Option<RegistrySkillPattern> => {
  const parsed = parseInputPattern(source);
  if (Option.isNone(parsed)) return Option.none();
  if (parsed.value.pattern.pattern !== "registry-pattern-input") return Option.none();
  if (Option.isSome(parsed.value.pattern.type) && parsed.value.pattern.type.value !== "skills") {
    return Option.none();
  }
  return Option.some(parsed.value.pattern);
};

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
  const renderer = yield* CliRenderer;

  yield* renderer.info(`axm skills update (${ws.scope})`);

  // Step 1: Load configured skills and filter to enabled
  const allSkills = yield* ws.getConfiguredSkills();
  const lockedSkills = yield* ws.getLockedSkills();

  const skillEntries = yield* Effect.forEach(Object.entries(allSkills), ([name, entry]) =>
    Effect.gen(function* () {
      if (!entry.enabled) {
        yield* renderer.info(`Skipping ${name} (disabled)`);
        return Option.none<readonly [string, string]>();
      }
      return Option.some([name, entry.source] as const);
    }),
  ).pipe(Effect.map(Array.getSomes));

  if (skillEntries.length === 0) {
    yield* renderer.info("No skills installed. Nothing to update.");
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
                    ? Option.some<readonly [string, string]>([name, sourceStr])
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
      yield* renderer.warn("No installed skills match the --skill filter. Nothing to update.");
      return;
    }
  }

  // Step 4: Collect pack constraints from installed pack manifests
  const packConstraintMap = yield* collectPackConstraints();

  // Step 5: Re-resolve each source and discover skills
  type ResolveResult =
    | {
        readonly type: "match";
        readonly ref: SkillExtensionRef;
        readonly versionConstraint: Option.Option<string>;
        readonly warnings: ReadonlyArray<string>;
      }
    | {
        readonly type: "rename";
        readonly oldName: string;
        readonly newRef: SkillExtensionRef;
        readonly versionConstraint: Option.Option<string>;
        readonly warnings: ReadonlyArray<string>;
      };

  const findSkillRefs = (
    source: RegistrySource | SkillExtensionRef["source"],
    options: {
      readonly skillNames: ReadonlyArray<string>;
      readonly profile: Option.Option<string>;
      readonly versionConstraint: Option.Option<string>;
    },
  ) =>
    sources
      .find(source, {
        skillNames: options.skillNames,
        type: "skill",
        profile: options.profile,
        versionConstraint: options.versionConstraint,
      })
      .pipe(
        Effect.map((refs) =>
          Array.filter(refs, (ref): ref is SkillExtensionRef => ref.type === "skill"),
        ),
      );

  const resolveRegistrySkillWithConstraints = ({
    source,
    profile,
    lookupName,
    userConstraint,
    packConstraints,
  }: {
    readonly source: RegistrySource;
    readonly profile: string;
    readonly lookupName: string;
    readonly userConstraint: Option.Option<string>;
    readonly packConstraints: ReadonlyArray<PackConstraint>;
  }) =>
    Effect.gen(function* () {
      const location =
        source.location.protocol === "file:" ? source.location.pathname : source.location.href;
      const client = yield* createRegistryClient(location);
      const indexOption = yield* client.getExtensionIndex({
        handle: profile,
        type: "skill",
        name: lookupName,
      });
      if (Option.isNone(indexOption)) {
        return Option.none<{
          readonly ref: Extract<SkillExtensionRef, { readonly refType: "registry" }>;
          readonly versionConstraint: Option.Option<string>;
          readonly warnings: ReadonlyArray<string>;
        }>();
      }

      const skillFqn = `${profile}/skills/${lookupName}`;
      const constraints: SkillConstraints = { userConstraint, packConstraints };
      const versions = indexOption.value.versions.map((entry) => entry.version);
      const [latestVersion] = versions;
      if (latestVersion === undefined) {
        return yield* Effect.fail(
          makeAppError({
            code: "UPDATE_SOURCE_EMPTY",
            what: `Registry skill "${skillFqn}" has no published versions`,
            details: [`Source: ${sources.origin(source)}`],
            howToFix: "Publish a version before running `axm skills update`.",
          }),
        );
      }

      const resolvedVersion = resolveConstrainedVersion(versions, constraints, skillFqn);
      if (Option.isNone(resolvedVersion)) {
        const constraintLabel = Option.match(userConstraint, {
          onNone: () => "the configured constraints",
          onSome: (constraint) => `"${constraint}"`,
        });
        return yield* Effect.fail(
          makeAppError({
            code: "UPDATE_CONSTRAINT_UNSATISFIABLE",
            what: `No published version of "${skillFqn}" satisfies ${constraintLabel}`,
            details: [`Source: ${sources.origin(source)}`],
            howToFix: "Relax the version constraint or update the dependent pack constraints.",
          }),
        );
      }

      const exactRefs = yield* findSkillRefs(source, {
        skillNames: [lookupName],
        profile: Option.some(profile),
        versionConstraint: Option.some(resolvedVersion.value.resolvedVersion),
      });
      const exactRef = exactRefs.find(
        (ref): ref is Extract<SkillExtensionRef, { readonly refType: "registry" }> =>
          ref.refType === "registry" &&
          ref.skill.name === lookupName &&
          ref.version === resolvedVersion.value.resolvedVersion,
      );
      if (exactRef === undefined) {
        return yield* Effect.fail(
          makeAppError({
            code: "UPDATE_RESOLUTION_FAILED",
            what: `Resolved version "${resolvedVersion.value.resolvedVersion}" for "${skillFqn}" could not be rediscovered`,
            details: [`Source: ${sources.origin(source)}`],
            howToFix: "Verify the registry index and package metadata are consistent.",
          }),
        );
      }

      return Option.some({
        ref: exactRef,
        versionConstraint: userConstraint,
        warnings: [
          ...resolvedVersion.value.warnings,
          ...detectHoldbackWarnings(
            latestVersion,
            resolvedVersion.value.resolvedVersion,
            constraints,
            skillFqn,
          ),
        ],
      });
    });

  const results = yield* renderer.withSpinner(
    "Resolving sources...",
    () =>
      Effect.forEach(
        filteredEntries,
        ([name, sourceStr]) =>
          Effect.gen(function* () {
            const source = yield* resolveSource(sourceStr);
            const registryPattern = toRegistrySkillPattern(sourceStr);

            if (source.type === "registry" && Option.isSome(registryPattern)) {
              const lookupName = Option.getOrElse(registryPattern.value.name, () => name);
              const registryResolved = yield* resolveRegistrySkillWithConstraints({
                source,
                profile: registryPattern.value.profile,
                lookupName,
                userConstraint: registryPattern.value.versionConstraint,
                packConstraints:
                  packConstraintMap.get(`${registryPattern.value.profile}/skills/${lookupName}`) ??
                  [],
              });
              if (Option.isSome(registryResolved)) {
                return Option.some<ResolveResult>({
                  type: "match",
                  ref: registryResolved.value.ref,
                  versionConstraint: registryResolved.value.versionConstraint,
                  warnings: registryResolved.value.warnings,
                });
              }
            }

            const requestedProfile = Option.match(registryPattern, {
              onNone: () => Option.none<string>(),
              onSome: (pattern) => Option.some(pattern.profile),
            });

            // First try with name filter (fast path)
            const namedRefs = yield* findSkillRefs(source, {
              skillNames: [name],
              profile: requestedProfile,
              versionConstraint: Option.none(),
            });
            const skillRef = namedRefs.find((r) => r.skill.name === name);

            if (skillRef) {
              return Option.some<ResolveResult>({
                type: "match",
                ref: skillRef,
                versionConstraint: Option.none(),
                warnings: [],
              });
            }

            // Skill not found by name — re-resolve without name filter for rename detection
            const allSkillRefs = yield* findSkillRefs(source, {
              skillNames: [],
              profile: requestedProfile,
              versionConstraint: Option.none(),
            });

            if (allSkillRefs.length === 1) {
              // Single-skill source: treat as rename
              const [newRef] = allSkillRefs;
              if (newRef === undefined) {
                return Option.none<ResolveResult>();
              }

              if (
                source.type === "registry" &&
                newRef.refType === "registry" &&
                Option.isSome(registryPattern)
              ) {
                const renameResolved = yield* resolveRegistrySkillWithConstraints({
                  source,
                  profile: registryPattern.value.profile,
                  lookupName: newRef.skill.name,
                  userConstraint: registryPattern.value.versionConstraint,
                  packConstraints:
                    packConstraintMap.get(
                      `${registryPattern.value.profile}/skills/${newRef.skill.name}`,
                    ) ?? [],
                });
                if (Option.isSome(renameResolved)) {
                  return Option.some<ResolveResult>({
                    type: "rename",
                    oldName: name,
                    newRef: renameResolved.value.ref,
                    versionConstraint: renameResolved.value.versionConstraint,
                    warnings: renameResolved.value.warnings,
                  });
                }
              }

              return Option.some<ResolveResult>({
                type: "rename",
                oldName: name,
                newRef,
                versionConstraint: Option.none(),
                warnings: [],
              });
            } else if (allSkillRefs.length > 1) {
              // Multi-skill source: ambiguous rename
              const availableNames = allSkillRefs.map((r) => r.skill.name).join(", ");
              yield* renderer.warn(
                `Skill "${name}" not found in source. Available skills: ${availableNames}. Use \`axm skills rename ${name} <new-name>\` to update.`,
              );
              return Option.none<ResolveResult>();
            } else {
              yield* renderer.warn(`Skill "${name}" not found in source ${sources.origin(source)}`);
              return Option.none<ResolveResult>();
            }
          }).pipe(
            Effect.catch((error) => {
              return renderer
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

  // Step 7: Emit resolution warnings
  yield* Effect.forEach(
    Array.flatMap(resolved, (item) => item.warnings),
    (warning) => renderer.warn(warning),
    { discard: true },
  );

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
            force: args.force,
            versionConstraint: item.versionConstraint,
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
          force: args.force,
          versionConstraint: item.versionConstraint,
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
  yield* resolvePlan(
    bridgeLegacyPlan(plan, {
      "install-skill": installSkill,
      "uninstall-skill": uninstallSkill,
    }),
    { yes: args.yes, force: args.force, preview: args.preview },
  );

  yield* renderer.success("Done");
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
            const parsed: unknown = JSON.parse(content);
            return Option.some(parsed);
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
