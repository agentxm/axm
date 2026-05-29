/**
 * Pack expansion helpers for cross-type dependency expansion.
 *
 * - expandPackInstallRefs: Expands a pack ref into install refs (pack + dependencies)
 * - expandPackUninstallTargets: Computes removable uninstall targets (pack + orphaned deps)
 * - resolveSkillUninstallTargetsFromLockfile: Resolves skill names to targets via lockfile
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  decodeExtensionNameSync,
  parseExtensionFqnParts,
  type ExtensionName,
  type ExtensionType,
} from "../extensions/index.js";
import type { ExtensionRef } from "../extensions/index.js";
import type { PackRef } from "./refs.js";
import type {
  ExtensionTarget,
  PackExtensionTarget,
  SkillExtensionTarget,
} from "../workspace/service-interface.js";
import type { Lockfile } from "../lockfile/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import { resolvePackDependencies } from "./dependency-resolution.js";

// -----------------------------------------------------------------------------
// expandPackInstallRefs
// -----------------------------------------------------------------------------

const nameFromFqn = (fqn: string): ExtensionName => {
  return parseExtensionFqnParts(fqn)?.name ?? decodeExtensionNameSync(fqn);
};

/**
 * Expand a pack ref into its cross-type dependency refs.
 *
 * Returns the pack ref first, followed by dependency refs (skill, command,
 * mcp-server) in declaration order. Only dependency types listed in
 * `supportedDependencyTypes` are included.
 *
 * Dependency refs use the pack's registry source and empty integrity
 * (integrity is resolved during materialization, not at expansion time).
 */
export const expandPackInstallRefs = (args: {
  readonly pack: PackRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly sources: SourceHostProvidersService;
}): Effect.Effect<ReadonlyArray<ExtensionRef>, AppError> =>
  Effect.gen(function* () {
    const { pack, supportedDependencyTypes, sources } = args;
    const resolved = yield* resolvePackDependencies(pack, sources);

    const deps = resolved.dependencyRefs.filter((ref) =>
      supportedDependencyTypes.includes(ref.type),
    );

    const packRef: ExtensionRef = pack;
    return [packRef, ...deps];
  });

// -----------------------------------------------------------------------------
// expandPackUninstallTargets
// -----------------------------------------------------------------------------

/** Settings shape needed for directly-configured extension checks. */
export interface UninstallSettingsContext {
  readonly skills: Readonly<Record<string, string>>;
  readonly commands: Readonly<Record<string, string>>;
  readonly mcpServers: Readonly<Record<string, string>>;
  readonly subagents: Readonly<Record<string, string>>;
  readonly docs?: Readonly<Record<string, string>> | undefined;
}

/**
 * Compute removable uninstall targets for a pack.
 *
 * Returns the pack target first, followed by orphaned dependency targets.
 * Orphaned = pack dependency candidates minus:
 *   - dependencies still referenced by remaining installed packs
 *   - dependencies directly configured in settings
 *
 * Only dependency types listed in `supportedDependencyTypes` are considered.
 */
export const expandPackUninstallTargets = (args: {
  readonly pack: PackExtensionTarget;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
  readonly lockfile: Lockfile;
  readonly settings: UninstallSettingsContext;
}): Effect.Effect<ReadonlyArray<ExtensionTarget>, AppError> => {
  const { pack, supportedDependencyTypes, lockfile, settings } = args;
  const packs = lockfile.packs ?? {};
  const packEntry = packs[pack.name];

  // If pack is not in lockfile, just return the pack target
  if (!packEntry) {
    return Effect.succeed([pack]);
  }

  // Collect all dependency FQNs from the pack being uninstalled
  const candidateSkills = supportedDependencyTypes.includes("skill")
    ? Object.keys(packEntry.resolvedSkills)
    : [];
  const candidateCommands = supportedDependencyTypes.includes("command")
    ? Object.keys(packEntry.resolvedCommands)
    : [];
  const candidateMcpServers = supportedDependencyTypes.includes("mcp-server")
    ? Object.keys(packEntry.resolvedMcpServers)
    : [];
  const candidateSubagents = supportedDependencyTypes.includes("subagent")
    ? Object.keys(packEntry.resolvedSubagents)
    : [];
  const candidateContext = supportedDependencyTypes.includes("docs")
    ? Object.keys(packEntry.resolvedDocs ?? {})
    : [];

  // Collect dependencies still referenced by OTHER installed packs
  const retainedByOtherPacks = new Set<string>();
  for (const [packName, entry] of Object.entries(packs)) {
    if (packName === pack.name) continue;
    for (const fqn of Object.keys(entry.resolvedSkills)) {
      retainedByOtherPacks.add(fqn);
    }
    for (const fqn of Object.keys(entry.resolvedCommands)) {
      retainedByOtherPacks.add(fqn);
    }
    for (const fqn of Object.keys(entry.resolvedMcpServers)) {
      retainedByOtherPacks.add(fqn);
    }
    for (const fqn of Object.keys(entry.resolvedSubagents)) {
      retainedByOtherPacks.add(fqn);
    }
    for (const fqn of Object.keys(entry.resolvedDocs ?? {})) {
      retainedByOtherPacks.add(fqn);
    }
  }

  // Collect directly-configured extensions from settings
  const directlyConfigured = new Set<string>();
  for (const name of Object.keys(settings.skills)) {
    directlyConfigured.add(name);
  }
  for (const name of Object.keys(settings.commands)) {
    directlyConfigured.add(name);
  }
  for (const name of Object.keys(settings.mcpServers)) {
    directlyConfigured.add(name);
  }
  for (const name of Object.keys(settings.subagents)) {
    directlyConfigured.add(name);
  }
  for (const name of Object.keys(settings.docs ?? {})) {
    directlyConfigured.add(name);
  }

  // Filter to orphaned targets
  const orphanedTargets: ExtensionTarget[] = [];

  for (const fqn of candidateSkills) {
    const name = nameFromFqn(fqn);
    if (!retainedByOtherPacks.has(fqn) && !directlyConfigured.has(name)) {
      orphanedTargets.push({ type: "skill", name });
    }
  }

  for (const fqn of candidateCommands) {
    const name = nameFromFqn(fqn);
    if (!retainedByOtherPacks.has(fqn) && !directlyConfigured.has(name)) {
      orphanedTargets.push({ type: "command", name });
    }
  }

  for (const fqn of candidateMcpServers) {
    const name = nameFromFqn(fqn);
    if (!retainedByOtherPacks.has(fqn) && !directlyConfigured.has(name)) {
      orphanedTargets.push({ type: "mcp-server", name });
    }
  }

  for (const fqn of candidateSubagents) {
    const name = nameFromFqn(fqn);
    if (!retainedByOtherPacks.has(fqn) && !directlyConfigured.has(name)) {
      orphanedTargets.push({ type: "subagent", name });
    }
  }

  for (const fqn of candidateContext) {
    const name = nameFromFqn(fqn);
    if (!retainedByOtherPacks.has(fqn) && !directlyConfigured.has(name)) {
      orphanedTargets.push({ type: "docs", name });
    }
  }

  return Effect.succeed([pack, ...orphanedTargets]);
};

// -----------------------------------------------------------------------------
// resolveSkillUninstallTargetsFromLockfile
// -----------------------------------------------------------------------------

/**
 * Resolve skill names to lockfile-backed uninstall targets.
 *
 * Fails with AppError if any skill name is not found in the lockfile.
 */
export const resolveSkillUninstallTargetsFromLockfile = (
  skills: ReadonlyArray<{ readonly skillName: ExtensionName }>,
  lockfile: Lockfile,
): Effect.Effect<ReadonlyArray<SkillExtensionTarget>, AppError> =>
  Effect.forEach(skills, (entry) => {
    if (!(entry.skillName in lockfile.skills)) {
      return Effect.fail(
        makeAppError({
          code: "not_found",
          detail: `Skill "${entry.skillName}" is not installed`,
          suggestions: [{ description: "Check the skill name and try again" }],
        }),
      );
    }
    return Effect.succeed({
      type: "skill" as const,
      name: entry.skillName,
    } satisfies SkillExtensionTarget);
  });
