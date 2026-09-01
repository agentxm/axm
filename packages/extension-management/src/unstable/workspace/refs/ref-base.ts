/**
 * Base types for extension references.
 *
 * Defines the foundational type hierarchy used by all extension types.
 * Per-type concrete refs live in their respective feature folders
 * (skills/refs.ts, mcps/refs.ts, etc.).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type {
  ExtensionName,
  ExtensionType,
} from "@agentxm/extension-model/unstable/extensions/common";
import type * as Option from "effect/Option";
import type * as Record from "effect/Record";
import type { RefType, Source } from "@agentxm/extension-model/unstable/sources/types";
import type { ExtensionDependencyConstraintMap } from "@agentxm/extension-model/unstable/extensions/common";
import type { Version } from "@agentxm/extension-model/unstable/version-constraints";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";
import type { WorkspaceScope } from "../scope.js";
import type { SourceHash } from "../rendered-files.js";
import type { DeprecationView } from "@agentxm/registry-protocol/unstable/registry/schema";

// -----------------------------------------------------------------------------
// Ref Detail Interfaces
// -----------------------------------------------------------------------------

/** Ref details for git-hosted sources (GitHub, GitLab, Bitbucket, AzureRepos, Git). @experimental */
export interface GitHostedRefDetails {
  /** Publisher identity declared by the resolved package manifest. */
  readonly owner: Handle;
  /** Package identity declared by the resolved package manifest. */
  readonly name: ExtensionName;
  /** file:// URL to cloned directory */
  readonly location: string;
  /** Repository-relative directory selected for this extension */
  readonly sourcePath?: string;
  /** Git tree SHA for integrity verification */
  readonly gitTreeSha: string;
  /** Immutable commit checked out while resolving this ref. */
  readonly gitCommitSha: string;
}

/** Ref details for registry sources. @experimental */
export interface RegistryRefDetails {
  /** Registry owner that owns the published extension */
  readonly owner: Handle;
  /** Immutable registry publisher epoch. */
  readonly publisherBindingId: string;
  /**
   * Registry package name — the identifier used for registry operations (fetch, version resolution).
   * This may differ from the extension-specific display name (e.g., skill.name, pack.name,
   * server.name) which is the user-facing name parsed from the extension's manifest.
   */
  readonly name: ExtensionName;
  /** Resolved semver version */
  readonly version: Version;
  /** SRI integrity string in `sha512-<base64>` format. None for synthetic refs from publish. */
  readonly integrity: Option.Option<string>;
  /** Package URLs this extension is designed to work with, from registry metadata. Empty when absent. */
  readonly packages: ReadonlyArray<PackageUrlParts>;
  /** Structured Registry lifecycle evidence captured at resolution time. */
  readonly deprecation?: DeprecationView;
  /** Lifecycle notices that must be shown before an exact historical install. */
  readonly lifecycleWarnings?: ReadonlyArray<string>;
}

/** Ref details for local filesystem sources. @experimental */
export interface LocalRefDetails {
  /** Publisher identity declared by the resolved package manifest. */
  readonly owner: Handle;
  /** Package identity declared by the resolved package manifest. */
  readonly name: ExtensionName;
  /** file:// URL to local directory */
  readonly location: string;
  /** Workspace-relative selected package directory when known. */
  readonly sourcePath?: string;
}

/** Ref details for intrinsic workspace sources. @experimental */
export interface WorkspaceRefDetails {
  /** Owner declared by the workspace locator and manifest. */
  readonly owner: Handle;
  /** Package name declared by the workspace locator and manifest. */
  readonly name: ExtensionName;
  /** Manifest version; workspace locators never carry a version constraint. */
  readonly version: Version;
  /** Scope whose settings document declares the workspace source. */
  readonly scope: WorkspaceScope;
  /** Runtime-only canonical package location. Never persisted in the lockfile. */
  readonly location: string;
  /** Deterministic hash of the authoritative workspace package content. */
  readonly sourceHash: SourceHash;
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
  /** Override platform capability degradation for this extension. */
  readonly fallback?: "auto" | "none";
};

/** @experimental */
/** @experimental */
export type PackRefBase<TRefType extends RefType, TSource extends Source> = ExtensionRefBase<
  "pack",
  TRefType,
  TSource
> & {
  readonly owner: Handle;
  readonly pack: {
    readonly name: ExtensionName;
    readonly dependencies: ExtensionDependencyConstraintMap;
  };
};
