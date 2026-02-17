/**
 * Core types for source parsing and identification.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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
export const SourceTypeSchema = Schema.Literal(
  "github",
  "gitlab",
  "bitbucket",
  "azurerepos",
  "git",
  "registry",
  "local",
  "builtin",
);

/**
 * Inferred type for SourceTypeSchema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceType = typeof SourceTypeSchema.Type;

// =============================================================================
// New Domain Model (source-host-domain-modeling)
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
 * Registry source host with URL and optional scopes.
 * @experimental
 */
export interface RegistrySourceHost {
  readonly type: "registry";
  readonly url: URL;
  /** Scopes this registry handles; None = catch-all */
  readonly scopes: Option.Option<ReadonlyArray<string>>;
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
  readonly scope: string;
  readonly name: string;
  readonly versionConstraint: Option.Option<string>;
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
// New Source — SourceHost & SourceParams
// -----------------------------------------------------------------------------

/** @experimental */
export type NewGitHubSource = GitHubSourceHost & GitHubSourceParams;
/** @experimental */
export type NewGitLabSource = GitLabSourceHost & GitLabSourceParams;
/** @experimental */
export type NewBitbucketSource = BitbucketSourceHost & BitbucketSourceParams;
/** @experimental */
export type NewAzureReposSource = AzureReposSourceHost & AzureReposSourceParams;
/** @experimental */
export type NewGitSource = GitSourceHost & GitSourceParams;
/** @experimental */
export type NewRegistrySource = RegistrySourceHost & RegistrySourceParams;
/** @experimental */
export type NewLocalSource = LocalSourceHost & LocalSourceParams;
/** @experimental */
export type BuiltinSource = BuiltinSourceHost & BuiltinSourceParams;

/** @experimental */
export type NewSource =
  | NewGitHubSource
  | NewGitLabSource
  | NewBitbucketSource
  | NewAzureReposSource
  | NewGitSource
  | NewRegistrySource
  | NewLocalSource
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
export type GitHostingSource =
  | NewGitHubSource
  | NewGitLabSource
  | NewBitbucketSource
  | NewAzureReposSource;

/** All git-based sources (hosting providers + generic git). @experimental */
export type GitBasedSource = GitHostingSource | NewGitSource;

/** Sources that require host configuration from settings. @experimental */
export type ConfiguredSourceHost = GitHostingSourceHost | RegistrySourceHost;

/** Sources that are self-describing (no settings config needed). @experimental */
export type SelfDescribingSourceHost = GitSourceHost | LocalSourceHost | BuiltinSourceHost;

// -----------------------------------------------------------------------------
// FindableExtensionType
// -----------------------------------------------------------------------------

/** Findable extension types — excludes "command" until CommandExtensionRef is implemented. @experimental */
export type FindableExtensionType = "skill" | "pack" | "mcp-server";

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
  /** Resolved semver version */
  readonly version: string;
  /** Archive checksum for integrity verification */
  readonly checksum: string;
}

/** Ref details for local filesystem sources. @experimental */
export interface LocalRefDetails {
  /** file:// URL to local directory */
  readonly location: string;
}

/** Ref details for builtin sources — no additional fields. @experimental */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intentionally empty: builtin extensions are resolved from bundled data
export interface BuiltinRefDetails {}

// -----------------------------------------------------------------------------
// Skill Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export interface SkillRefBase {
  readonly type: "skill";
  readonly skill: {
    readonly name: string;
    readonly description: string;
    readonly metadata: Option.Option<Record.ReadonlyRecord<string, unknown>>;
  };
}

/** @experimental */
export type GitHubSkillRef = SkillRefBase & {
  readonly source: NewGitHubSource;
} & GitHostedRefDetails;
/** @experimental */
export type GitLabSkillRef = SkillRefBase & {
  readonly source: NewGitLabSource;
} & GitHostedRefDetails;
/** @experimental */
export type BitbucketSkillRef = SkillRefBase & {
  readonly source: NewBitbucketSource;
} & GitHostedRefDetails;
/** @experimental */
export type AzureReposSkillRef = SkillRefBase & {
  readonly source: NewAzureReposSource;
} & GitHostedRefDetails;
/** @experimental */
export type GitSkillRef = SkillRefBase & { readonly source: NewGitSource } & GitHostedRefDetails;
/** @experimental */
export type RegistrySkillRef = SkillRefBase & {
  readonly source: NewRegistrySource;
} & RegistryRefDetails;
/** @experimental */
export type LocalSkillRef = SkillRefBase & { readonly source: NewLocalSource } & LocalRefDetails;
/** @experimental */
export type BuiltinSkillRef = SkillRefBase & { readonly source: BuiltinSource } & BuiltinRefDetails;

/** @experimental */
export type SkillExtensionRef =
  | GitHubSkillRef
  | GitLabSkillRef
  | BitbucketSkillRef
  | AzureReposSkillRef
  | GitSkillRef
  | RegistrySkillRef
  | LocalSkillRef
  | BuiltinSkillRef;

// -----------------------------------------------------------------------------
// MCP Server Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export interface McpServerRefBase {
  readonly type: "mcp-server";
  readonly server: {
    readonly name: string;
  };
}

/** @experimental */
export type GitHubMcpServerRef = McpServerRefBase & {
  readonly source: NewGitHubSource;
} & GitHostedRefDetails;
/** @experimental */
export type RegistryMcpServerRef = McpServerRefBase & {
  readonly source: NewRegistrySource;
} & RegistryRefDetails;
/** @experimental */
export type LocalMcpServerRef = McpServerRefBase & {
  readonly source: NewLocalSource;
} & LocalRefDetails;
/** @experimental */
export type BuiltinMcpServerRef = McpServerRefBase & {
  readonly source: BuiltinSource;
} & BuiltinRefDetails;

/** @experimental */
export type McpServerExtensionRef =
  | GitHubMcpServerRef
  | RegistryMcpServerRef
  | LocalMcpServerRef
  | BuiltinMcpServerRef;

// -----------------------------------------------------------------------------
// Pack Extension Refs
// -----------------------------------------------------------------------------

/** @experimental */
export type RegistryPackRef = {
  readonly type: "pack";
  readonly source: NewRegistrySource;
} & RegistryRefDetails;

/** @experimental */
export type BuiltinPackRef = {
  readonly type: "pack";
  readonly pack: { readonly scope: string; readonly name: string; readonly version: string };
  readonly source: BuiltinSource;
} & BuiltinRefDetails;

/** @experimental */
export type PackExtensionRef = RegistryPackRef | BuiltinPackRef;

// -----------------------------------------------------------------------------
// SourceExtensionRef Union
// -----------------------------------------------------------------------------

/** @experimental */
export type SourceExtensionRef = SkillExtensionRef | McpServerExtensionRef | PackExtensionRef;
