/**
 * Base types for extension references.
 *
 * Defines the foundational type hierarchy used by all extension types.
 * Per-type concrete refs live in their respective feature folders
 * (skills/refs.ts, commands/refs.ts, etc.).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionName, ExtensionType } from "./common.js";
import type * as Option from "effect/Option";
import type * as Record from "effect/Record";
import type { RefType, Source } from "../sources/types.js";
import type { ExtensionDependencyConstraintMap } from "./common.js";
import type { ExactSemverVersion } from "../version-constraints/version-constraints.js";
import type { Handle } from "./handle.js";
import type { PackageUrlParts } from "../packaging/package-url.js";

// -----------------------------------------------------------------------------
// Ref Detail Interfaces
// -----------------------------------------------------------------------------

/** Ref details for git-hosted sources (GitHub, GitLab, Bitbucket, AzureRepos, Git). @experimental */
export interface GitHostedRefDetails {
  /** file:// URL to cloned directory */
  readonly location: string;
  /** Git tree SHA for integrity verification */
  readonly gitTreeSha: Option.Option<string>;
}

/** Ref details for registry sources. @experimental */
export interface RegistryRefDetails {
  /** Registry owner that owns the published extension */
  readonly owner: Handle;
  /**
   * Registry package name — the identifier used for registry operations (fetch, version resolution).
   * This may differ from the extension-specific display name (e.g., skill.name, pack.name,
   * server.name) which is the user-facing name parsed from the extension's manifest.
   */
  readonly name: ExtensionName;
  /** Resolved semver version */
  readonly version: ExactSemverVersion;
  /** SRI integrity string in `sha512-<base64>` format. None for synthetic refs (fork/publish). */
  readonly integrity: Option.Option<string>;
  /** Package URLs this extension is compatible with, from registry metadata. Empty when absent. */
  readonly compatiblePackages: ReadonlyArray<PackageUrlParts>;
}

/** Ref details for local filesystem sources. @experimental */
export interface LocalRefDetails {
  /** file:// URL to local directory */
  readonly location: string;
}

// -----------------------------------------------------------------------------
// Layer 1: ExtensionRefBase — universal base for all extension refs
// -----------------------------------------------------------------------------

/** @experimental */
export interface ExtensionRefBase<
  TExtensionType extends ExtensionType,
  TRefType extends RefType,
  TSource extends Source,
> {
  readonly type: TExtensionType;
  readonly refType: TRefType;
  readonly source: TSource;
}

// -----------------------------------------------------------------------------
// Layer 2: Per-extension-type bases (add extension-specific metadata)
// -----------------------------------------------------------------------------

/** @experimental */
export type SkillExtensionRefBase<
  TRefType extends RefType,
  TSource extends Source,
> = ExtensionRefBase<"skill", TRefType, TSource> & {
  readonly skill: {
    readonly name: ExtensionName;
    readonly description: Option.Option<string>;
    readonly metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>;
  };
};

/** @experimental */
export type CommandExtensionRefBase<
  TRefType extends RefType,
  TSource extends Source,
> = ExtensionRefBase<"command", TRefType, TSource> & {
  readonly command: { readonly name: ExtensionName };
};

/** @experimental */
export type McpServerExtensionRefBase<
  TRefType extends RefType,
  TSource extends Source,
> = ExtensionRefBase<"mcp-server", TRefType, TSource> & {
  readonly server: { readonly name: ExtensionName };
};

/** @experimental */
export type SubagentExtensionRefBase<
  TRefType extends RefType,
  TSource extends Source,
> = ExtensionRefBase<"subagent", TRefType, TSource> & {
  readonly subagent: {
    readonly name: ExtensionName;
    readonly description: Option.Option<string>;
  };
};

/** @experimental */
export type ExtensionPackRefBase<
  TRefType extends RefType,
  TSource extends Source,
> = ExtensionRefBase<"pack", TRefType, TSource> & {
  readonly owner: Handle;
  readonly pack: {
    readonly name: ExtensionName;
    readonly skills: ExtensionDependencyConstraintMap;
    readonly commands: ExtensionDependencyConstraintMap;
    readonly mcpServers: ExtensionDependencyConstraintMap;
    readonly subagents: ExtensionDependencyConstraintMap;
  };
};
