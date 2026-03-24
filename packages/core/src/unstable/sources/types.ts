/**
 * Core types for source parsing and identification.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { ExtensionType } from "../extensions/index.js";
import type * as Option from "effect/Option";
import type * as Record from "effect/Record";
import * as Schema from "effect/Schema";

// -----------------------------------------------------------------------------
// Source Type Schema
// -----------------------------------------------------------------------------

/**
 * Source type discriminator for extension origins.
 *
 * - `"github"` - GitHub repository source
 * - `"gitlab"` - GitLab repository source
 * - `"bitbucket"` - Bitbucket repository source
 * - `"azurerepos"` - Azure Repos repository source
 * - `"git"` - Generic git repository source
 * - `"registry"` - Package registry source
 * - `"local"` - Local filesystem path source
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceTypeSchema = Schema.Literals([
  "github",
  "gitlab",
  "bitbucket",
  "azurerepos",
  "git",
  "registry",
  "local",
  "builtin",
]);

/**
 * Inferred type for SourceTypeSchema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceType = Schema.Schema.Type<typeof SourceTypeSchema>;

// -----------------------------------------------------------------------------
// Ref Type Schema
// -----------------------------------------------------------------------------

/**
 * Ref type discriminator for extension ref hosting categories.
 *
 * - `"git-hosted"` - Git-based sources (GitHub, GitLab, Bitbucket, AzureRepos, Git)
 * - `"registry"` - Package registry source
 * - `"local"` - Local filesystem path source
 * - `"builtin"` - Bundled extension source
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RefTypeSchema = Schema.Literals(["git-hosted", "registry", "local", "builtin"]);

/**
 * Inferred type for RefTypeSchema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RefType = Schema.Schema.Type<typeof RefTypeSchema>;

// =============================================================================
// Source Domain Model (source-host-domain-modeling)
// =============================================================================

// -----------------------------------------------------------------------------
// SourceHost — how to reach a source
// -----------------------------------------------------------------------------

/** @experimental */
export interface GitHubSourceHost {
  readonly type: "github";
  readonly url: URL;
}

/** @experimental */
export interface GitLabSourceHost {
  readonly type: "gitlab";
  readonly url: URL;
}

/** @experimental */
export interface BitbucketSourceHost {
  readonly type: "bitbucket";
  readonly url: URL;
}

/** @experimental */
export interface AzureReposSourceHost {
  readonly type: "azurerepos";
  readonly url: URL;
}

/** Self-describing — the git URL lives in SourceParams. @experimental */
export interface GitSourceHost {
  readonly type: "git";
}

/**
 * Registry source host with URL.
 * @experimental
 */
export interface RegistrySourceHost {
  readonly type: "registry";
  readonly location: URL;
}

/** Self-describing — the filesystem path lives in SourceParams. @experimental */
export interface LocalSourceHost {
  readonly type: "local";
}

/** Self-describing — bundled extensions, no configuration needed. @experimental */
export interface BuiltinSourceHost {
  readonly type: "builtin";
}

/** @experimental */
export type SourceHost =
  | GitHubSourceHost
  | GitLabSourceHost
  | BitbucketSourceHost
  | AzureReposSourceHost
  | GitSourceHost
  | RegistrySourceHost
  | LocalSourceHost
  | BuiltinSourceHost;

// -----------------------------------------------------------------------------
// SourceParams — coordinates within a source
// -----------------------------------------------------------------------------

/** @experimental */
export interface GitHubSourceParams {
  readonly type: "github";
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
}

/** @experimental */
export interface GitLabSourceParams {
  readonly type: "gitlab";
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
}

/** @experimental */
export interface BitbucketSourceParams {
  readonly type: "bitbucket";
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
}

/** @experimental */
export interface AzureReposSourceParams {
  readonly type: "azurerepos";
  readonly organization: string;
  readonly project: string;
  readonly repo: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
}

/** @experimental */
export interface GitSourceParams {
  readonly type: "git";
  readonly url: URL;
  readonly ref: Option.Option<string>;
}

/** @experimental */
export interface RegistrySourceParams {
  readonly type: "registry";
  readonly profile: Option.Option<string>;
}

/** @experimental */
export interface LocalSourceParams {
  readonly type: "local";
  readonly path: string;
}

/** @experimental */
export interface BuiltinSourceParams {
  readonly type: "builtin";
}

/** @experimental */
export type SourceParams =
  | GitHubSourceParams
  | GitLabSourceParams
  | BitbucketSourceParams
  | AzureReposSourceParams
  | GitSourceParams
  | RegistrySourceParams
  | LocalSourceParams
  | BuiltinSourceParams;

// -----------------------------------------------------------------------------
// Source — SourceHost & SourceParams
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHubSource = GitHubSourceHost & GitHubSourceParams;
/** @experimental */
export type GitLabSource = GitLabSourceHost & GitLabSourceParams;
/** @experimental */
export type BitbucketSource = BitbucketSourceHost & BitbucketSourceParams;
/** @experimental */
export type AzureReposSource = AzureReposSourceHost & AzureReposSourceParams;
/** @experimental */
export type GitSource = GitSourceHost & GitSourceParams;
/** @experimental */
export type RegistrySource = RegistrySourceHost & RegistrySourceParams;
/** @experimental */
export type LocalSource = LocalSourceHost & LocalSourceParams;
/** @experimental */
export type BuiltinSource = BuiltinSourceHost & BuiltinSourceParams;

/** @experimental */
export type Source =
  | GitHubSource
  | GitLabSource
  | BitbucketSource
  | AzureReposSource
  | GitSource
  | RegistrySource
  | LocalSource
  | BuiltinSource;

// -----------------------------------------------------------------------------
// Convenience Unions
// -----------------------------------------------------------------------------

/** Git hosting providers that require a configured URL. @experimental */
export type GitHostingSourceHost =
  | GitHubSourceHost
  | GitLabSourceHost
  | BitbucketSourceHost
  | AzureReposSourceHost;

/** @experimental */
export type GitHostingSourceParams =
  | GitHubSourceParams
  | GitLabSourceParams
  | BitbucketSourceParams
  | AzureReposSourceParams;

/** @experimental */
export type GitHostingSource = GitHubSource | GitLabSource | BitbucketSource | AzureReposSource;

/** All git-based sources (hosting providers + generic git). @experimental */
export type GitBasedSource = GitHostingSource | GitSource;

/** Sources that require host configuration from settings. @experimental */
export type ConfiguredSourceHost = GitHostingSourceHost | RegistrySourceHost;

/** Sources that are self-describing (no settings config needed). @experimental */
export type SelfDescribingSourceHost = GitSourceHost | LocalSourceHost | BuiltinSourceHost;

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
  /** Registry profile that owns the published extension */
  readonly profile: string;
  /**
   * Registry package name — the identifier used for registry operations (fetch, version resolution).
   * This may differ from the extension-specific display name (e.g., skill.name, pack.name,
   * server.name) which is the user-facing name parsed from the extension's manifest.
   */
  readonly name: string;
  /** Resolved semver version */
  readonly version: string;
  /** SRI integrity string in `sha512-<base64>` format */
  readonly integrity: string;
}

/** Ref details for local filesystem sources. @experimental */
export interface LocalRefDetails {
  /** file:// URL to local directory */
  readonly location: string;
}

/** Ref details for builtin sources — no additional fields. @experimental */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally empty: builtin extensions are resolved from bundled data
export interface BuiltinRefDetails {}

// =============================================================================
// Extension Ref Type Hierarchy
// =============================================================================

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
    readonly name: string;
    readonly description: Option.Option<string>;
    readonly metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>;
  };
};

/** @experimental */
export type CommandExtensionRefBase<
  TRefType extends RefType,
  TSource extends Source,
> = ExtensionRefBase<"command", TRefType, TSource> & {
  readonly command: { readonly name: string };
};

/** @experimental */
export type McpServerExtensionRefBase<
  TRefType extends RefType,
  TSource extends Source,
> = ExtensionRefBase<"mcp-server", TRefType, TSource> & {
  readonly server: { readonly name: string };
};

/** @experimental */
export type PackExtensionRefBase<
  TRefType extends RefType,
  TSource extends Source,
> = ExtensionRefBase<"pack", TRefType, TSource> & {
  readonly profile: string;
  readonly pack: {
    readonly name: string;
    readonly skills: Readonly<Record<string, string>>;
    readonly commands: Readonly<Record<string, string>>;
    readonly mcpServers: Readonly<Record<string, string>>;
  };
};

// -----------------------------------------------------------------------------
// Layer 3: Concrete Skill Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedSkillRef = SkillExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistrySkillRef = SkillExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalSkillRef = SkillExtensionRefBase<"local", LocalSource> & LocalRefDetails;
/** @experimental */
export type BuiltinSkillRef = SkillExtensionRefBase<"builtin", BuiltinSource> & BuiltinRefDetails;

/** @experimental */
export type SkillExtensionRef =
  | GitHostedSkillRef
  | RegistrySkillRef
  | LocalSkillRef
  | BuiltinSkillRef;

// -----------------------------------------------------------------------------
// Layer 3: Concrete Command Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedCommandRef = CommandExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryCommandRef = CommandExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalCommandRef = CommandExtensionRefBase<"local", LocalSource> & LocalRefDetails;
/** @experimental */
export type BuiltinCommandRef = CommandExtensionRefBase<"builtin", BuiltinSource> &
  BuiltinRefDetails;

/** @experimental */
export type CommandExtensionRef =
  | GitHostedCommandRef
  | RegistryCommandRef
  | LocalCommandRef
  | BuiltinCommandRef;

// -----------------------------------------------------------------------------
// Layer 3: Concrete MCP Server Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type GitHostedMcpServerRef = McpServerExtensionRefBase<"git-hosted", GitBasedSource> &
  GitHostedRefDetails;
/** @experimental */
export type RegistryMcpServerRef = McpServerExtensionRefBase<"registry", RegistrySource> &
  RegistryRefDetails;
/** @experimental */
export type LocalMcpServerRef = McpServerExtensionRefBase<"local", LocalSource> & LocalRefDetails;
/** @experimental */
export type BuiltinMcpServerRef = McpServerExtensionRefBase<"builtin", BuiltinSource> &
  BuiltinRefDetails;

/** @experimental */
export type McpServerExtensionRef =
  | GitHostedMcpServerRef
  | RegistryMcpServerRef
  | LocalMcpServerRef
  | BuiltinMcpServerRef;

// -----------------------------------------------------------------------------
// Layer 3: Concrete Pack Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type RegistryPackRef = PackExtensionRefBase<"registry", RegistrySource> & RegistryRefDetails;
/** @experimental */
export type BuiltinPackRef = PackExtensionRefBase<"builtin", BuiltinSource> & BuiltinRefDetails;

/** @experimental */
export type PackExtensionRef = RegistryPackRef | BuiltinPackRef;

// -----------------------------------------------------------------------------
// ExtensionRef Union
// -----------------------------------------------------------------------------

/** @experimental */
export type ExtensionRef =
  | SkillExtensionRef
  | CommandExtensionRef
  | McpServerExtensionRef
  | PackExtensionRef;
