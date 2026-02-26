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
import * as Option from "effect/Option";
import { makeCliError, type CliError } from "../../cli-error/index.js";
import type { ExtensionType } from "../common.js";
import type { ExtensionRef, PackExtensionRef, RegistrySource } from "../../sources/types.js";
import type {
  ExtensionTarget,
  PackExtensionTarget,
  SkillExtensionTarget,
} from "../../workflows/install-operation/workflow.js";
import type { Lockfile } from "../../lockfile/schema.js";

// -----------------------------------------------------------------------------
// FQN Parsing
// -----------------------------------------------------------------------------

/**
 * Extract the short name from a fully-qualified name.
 * e.g. "@acme/skills/code-review" -> "code-review"
 */
const nameFromFqn = (fqn: string): string => {
  const parts = fqn.split("/");
  return parts[parts.length - 1]!;
};

/**
 * Extract the namespace from a fully-qualified name.
 * e.g. "@acme/skills/code-review" -> "@acme"
 */
const namespaceFromFqn = (fqn: string): string => {
  const parts = fqn.split("/");
  return parts[0]!;
};

// -----------------------------------------------------------------------------
// expandPackInstallRefs
// -----------------------------------------------------------------------------

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
  readonly pack: PackExtensionRef;
  readonly supportedDependencyTypes: ReadonlyArray<ExtensionType>;
}): Effect.Effect<ReadonlyArray<ExtensionRef>, CliError> => {
  const { pack, supportedDependencyTypes } = args;
  const deps: ExtensionRef[] = [];

  // Build a registry source for dependencies based on pack's source
  const depSource: RegistrySource =
    pack.source.type === "registry"
      ? pack.source
      : {
          type: "registry",
          location: new URL("file:///builtin"),
          namespace: Option.none(),
        };

  // Skills
  if (supportedDependencyTypes.includes("skill")) {
    for (const [fqn, version] of Object.entries(pack.pack.skills)) {
      deps.push({
        type: "skill",
        refType: "registry",
        skill: {
          name: nameFromFqn(fqn),
          description: Option.none(),
          metadata: Option.none(),
        },
        source: depSource,
        namespace: namespaceFromFqn(fqn),
        name: nameFromFqn(fqn),
        version,
        integrity: "",
      });
    }
  }

  // Commands
  if (supportedDependencyTypes.includes("command")) {
    for (const [fqn, version] of Object.entries(pack.pack.commands)) {
      deps.push({
        type: "command",
        refType: "registry",
        command: { name: nameFromFqn(fqn) },
        source: depSource,
        namespace: namespaceFromFqn(fqn),
        name: nameFromFqn(fqn),
        version,
        integrity: "",
      });
    }
  }

  // MCP Servers
  if (supportedDependencyTypes.includes("mcp-server")) {
    for (const [fqn, version] of Object.entries(pack.pack.mcpServers)) {
      deps.push({
        type: "mcp-server",
        refType: "registry",
        server: { name: nameFromFqn(fqn) },
        source: depSource,
        namespace: namespaceFromFqn(fqn),
        name: nameFromFqn(fqn),
        version,
        integrity: "",
      });
    }
  }

  return Effect.succeed([pack as ExtensionRef, ...deps]);
};

// -----------------------------------------------------------------------------
// expandPackUninstallTargets
// -----------------------------------------------------------------------------

/** Settings shape needed for directly-configured extension checks. */
export interface UninstallSettingsContext {
  readonly skills: Readonly<Record<string, string>>;
  readonly commands: Readonly<Record<string, string>>;
  readonly mcpServers: Readonly<Record<string, string>>;
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
}): Effect.Effect<ReadonlyArray<ExtensionTarget>, CliError> => {
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

  return Effect.succeed([pack, ...orphanedTargets]);
};

// -----------------------------------------------------------------------------
// resolveSkillUninstallTargetsFromLockfile
// -----------------------------------------------------------------------------

/**
 * Resolve skill names to lockfile-backed uninstall targets.
 *
 * Fails with CliError if any skill name is not found in the lockfile.
 */
export const resolveSkillUninstallTargetsFromLockfile = (
  skills: ReadonlyArray<{ readonly skillName: string }>,
  lockfile: Lockfile,
): Effect.Effect<ReadonlyArray<SkillExtensionTarget>, CliError> =>
  Effect.forEach(skills, (entry) => {
    if (!(entry.skillName in lockfile.skills)) {
      return Effect.fail(
        makeCliError({
          code: "SKILL_NOT_FOUND_IN_LOCKFILE",
          what: `Skill "${entry.skillName}" is not installed`,
          howToFix: "Check the skill name and try again",
        }),
      );
    }
    return Effect.succeed({
      type: "skill" as const,
      name: entry.skillName,
    } satisfies SkillExtensionTarget);
  });
