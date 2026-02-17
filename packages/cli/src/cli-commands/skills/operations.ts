/**
 * Skill operation types and references.
 *
 * Shared across skill operations (install, uninstall, etc.).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import type { ReadonlyRecord } from "effect/Record";
import type { SkillRef } from "../../sources/provider.js";
import type { SkillExtensionRef } from "../../sources/types.js";
import type { Operation } from "../../workspace/plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Base skill metadata parsed from SKILL.md frontmatter.
 */
export interface Skill {
  /** Unique name of the skill */
  readonly name: string;
  /** Description of the skill */
  readonly description: string;
  /** Optional metadata from SKILL.md frontmatter */
  readonly metadata: Option.Option<ReadonlyRecord<string, unknown>>;
}

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

/**
 * Args for the install-skill operation.
 */
export type InstallSkillOperationArgs = {
  readonly ref: SkillExtensionRef;
  readonly agents: ReadonlyArray<string>;
  readonly force: boolean;
  /** When true, write to lockfile only (skip settings). Used for pack dependencies. */
  readonly skipSettings?: boolean;
  /** Pre-fetched file location (required for registry sources where ref has no location). */
  readonly fetchedLocation?: string | undefined;
};

/**
 * Add a skill to the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type InstallSkillOperation = Operation<"install-skill", InstallSkillOperationArgs>;

/**
 * Args for the uninstall-skill operation.
 */
export interface UninstallSkillOperationArgs {
  readonly skillName: string;
  /** Agent filter for partial uninstall. Empty = all agents. */
  readonly agents: ReadonlyArray<string>;
}

/**
 * Remove a skill from the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UninstallSkillOperation = Operation<"uninstall-skill", UninstallSkillOperationArgs>;

/**
 * Args for the copy-skill operation.
 *
 * Copies source files to `.axm/extensions/@<scope>/skills/<name>/`
 * and generates an `axm-skill.json` manifest.
 */
export type CopySkillOperationArgs = {
  /** The skill extension ref carrying source and location. */
  readonly ref: SkillExtensionRef;
  /** Target identity in `@scope/name` format. */
  readonly targetName: string;
};

/**
 * Copy a skill into a managed extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CopySkillOperation = Operation<"copy-skill", CopySkillOperationArgs>;

/**
 * Args for the publish-skill operation.
 *
 * Reads the manifest from `.axm/extensions/`, builds a zip archive,
 * computes the SHA-256 checksum, and publishes to the target registry.
 */
export type PublishSkillOperationArgs = {
  /** Extension identity in `@scope/name` format. */
  readonly name: string;
  /** Named source to publish to (e.g. "local"). */
  readonly registryName: string;
};

/**
 * Publish a managed extension to a registry.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type PublishSkillOperation = Operation<"publish-skill", PublishSkillOperationArgs>;

// -----------------------------------------------------------------------------
// Enable / Disable / Rename Operations
// -----------------------------------------------------------------------------

/**
 * Enable a previously disabled skill (re-install files and update state).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type EnableSkillOperation = Operation<"enable-skill", { readonly skillName: string }>;

/**
 * Disable a skill (remove files but keep settings/lockfile entry).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type DisableSkillOperation = Operation<"disable-skill", { readonly skillName: string }>;

/**
 * Rename a skill (rename files and update settings/lockfile keys).
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RenameSkillOperation = Operation<
  "rename-skill",
  { readonly oldName: string; readonly newName: string }
>;

// -----------------------------------------------------------------------------
// Bridge: Legacy SkillRef → SkillExtensionRef
// -----------------------------------------------------------------------------

/**
 * Convert a legacy SkillRef to a SkillExtensionRef.
 *
 * Bridge for Phase 7 — the callers still get SkillRef from resolveExtension(),
 * but the operation args now require SkillExtensionRef. At runtime, SkillRef.source
 * is a full Source (host + params) even though the type says SourceInput.
 *
 * @deprecated Remove in Phase 8 when callers use SourceHostProviders.find() directly.
 */
export const skillRefToExtensionRef = (ref: SkillRef): SkillExtensionRef => {
  const { source } = ref;
  const skillBase = { type: "skill" as const, skill: ref.skill };

  switch (source.type) {
    case "github":
      return {
        ...skillBase,
        // Assertion needed: at runtime, source carries full Source (with host config url)
        source: source as SkillExtensionRef & { source: { type: "github" } } extends {
          source: infer S;
        }
          ? S
          : never,
        location: ref.location,
        gitTreeSha: ref.gitTreeSha,
      } as SkillExtensionRef;

    case "gitlab":
    case "bitbucket":
    case "azurerepos":
    case "git":
      return {
        ...skillBase,
        source: source as never,
        location: ref.location,
        gitTreeSha: ref.gitTreeSha,
      } as SkillExtensionRef;

    case "registry":
      return {
        ...skillBase,
        source: source as never,
        version: Option.getOrElse(ref.version, () => ""),
        checksum: "",
      } as SkillExtensionRef;

    case "local":
      return {
        ...skillBase,
        source: source as never,
        location: ref.location,
      } as SkillExtensionRef;

    default:
      // Fallback for any unexpected source type
      return {
        ...skillBase,
        source: source as never,
        location: ref.location,
        gitTreeSha: ref.gitTreeSha,
      } as SkillExtensionRef;
  }
};
