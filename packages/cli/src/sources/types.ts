/**
 * Core types for source parsing and identification.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
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
 * - `"azuredevops"` - Azure DevOps repository source
 * - `"git"` - Generic git repository source
 * - `"registry"` - Package registry source
 * - `"local"` - Local filesystem path source
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceSchema = Schema.Literal(
  "github",
  "gitlab",
  "bitbucket",
  "azuredevops",
  "git",
  "registry",
  "local",
);

/**
 * Inferred type for SourceSchema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type BaseSource = typeof SourceSchema.Type;

/**
 * Source type alias.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Source = BaseSource;

// -----------------------------------------------------------------------------
// Discriminated Union Types
// -----------------------------------------------------------------------------

/**
 * Base interface for common fields shared by all source types.
 */
interface SourceBase {
  /** Original input string */
  readonly original: string;
  /** Normalized canonical form (e.g., "github:owner/repo") */
  readonly canonical: string;
}

/**
 * GitHub repository source.
 */
export interface GitHubSource extends SourceBase {
  readonly source: "github";
  /** Repository owner (user or organization) */
  readonly owner: string;
  /** Repository name */
  readonly repo: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly path: Option.Option<string>;
}

/**
 * GitLab repository source.
 */
export interface GitLabSource extends SourceBase {
  readonly source: "gitlab";
  /** Repository owner (user or group) */
  readonly owner: string;
  /** Repository name */
  readonly repo: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly path: Option.Option<string>;
}

/**
 * Bitbucket repository source.
 */
export interface BitbucketSource extends SourceBase {
  readonly source: "bitbucket";
  /** Workspace (formerly team or user) */
  readonly owner: string;
  /** Repository slug */
  readonly repo: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly path: Option.Option<string>;
}

/**
 * Union of all git hosting provider sources.
 */
export type GitSource = GitHubSource | GitLabSource | BitbucketSource;

/**
 * Azure DevOps repository source (placeholder for future implementation).
 *
 * URL format: https://dev.azure.com/{organization}/{project}/_git/{repo}
 */
export interface AzureDevOpsSource extends SourceBase {
  readonly source: "azuredevops";
  /** Azure DevOps organization */
  readonly organization: string;
  /** Azure DevOps project */
  readonly project: string;
  /** Repository name */
  readonly repo: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly path: Option.Option<string>;
}

/**
 * Generic git repository source (placeholder for future implementation).
 *
 * Supports any git URL format without owner semantics:
 * - SCP-style SSH: git@server:path/repo.git
 * - Standard SSH: ssh://git@server/path/repo.git
 * - Git protocol: git://server/repo.git
 * - File URI: file:///path/to/repo.git
 */
export interface GenericGitSource extends SourceBase {
  readonly source: "git";
  /** Full git URL */
  readonly url: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly path: Option.Option<string>;
}

/**
 * Package registry source (placeholder for future implementation).
 */
export interface RegistrySource extends SourceBase {
  readonly source: "registry";
  readonly url: string;
}

/**
 * Local filesystem path source.
 */
export interface LocalSource extends SourceBase {
  readonly source: "local";
  /** Absolute path for local sources (after ~ expansion) */
  readonly localPath: string;
}

/**
 * Result of parsing a source string.
 * Discriminated union based on the `source` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ParsedSource =
  | GitHubSource
  | GitLabSource
  | BitbucketSource
  | AzureDevOpsSource
  | GenericGitSource
  | RegistrySource
  | LocalSource;

// -----------------------------------------------------------------------------
// ParsedSource Namespace with Constructors
// -----------------------------------------------------------------------------

/**
 * Namespace containing constructors for ParsedSource types.
 */
export const ParsedSource = {
  /**
   * Create a GitHub source.
   */
  GitHub: (args: {
    original: string;
    owner: string;
    repo: string;
    ref?: string | undefined;
    path?: string | undefined;
  }): GitHubSource => ({
    source: "github",
    original: args.original,
    canonical: `github:${args.owner}/${args.repo}`,
    owner: args.owner,
    repo: args.repo,
    ref: Option.fromNullable(args.ref),
    path: Option.fromNullable(args.path),
  }),

  /**
   * Create a GitLab source.
   */
  GitLab: (args: {
    original: string;
    owner: string;
    repo: string;
    ref?: string | undefined;
    path?: string | undefined;
  }): GitLabSource => ({
    source: "gitlab",
    original: args.original,
    canonical: `gitlab:${args.owner}/${args.repo}`,
    owner: args.owner,
    repo: args.repo,
    ref: Option.fromNullable(args.ref),
    path: Option.fromNullable(args.path),
  }),

  /**
   * Create a Bitbucket source.
   */
  Bitbucket: (args: {
    original: string;
    owner: string;
    repo: string;
    ref?: string | undefined;
    path?: string | undefined;
  }): BitbucketSource => ({
    source: "bitbucket",
    original: args.original,
    canonical: `bitbucket:${args.owner}/${args.repo}`,
    owner: args.owner,
    repo: args.repo,
    ref: Option.fromNullable(args.ref),
    path: Option.fromNullable(args.path),
  }),

  /**
   * Create a local filesystem source.
   */
  Local: (args: { original: string; localPath: string }): LocalSource => ({
    source: "local",
    original: args.original,
    canonical: `local:${args.localPath}`,
    localPath: args.localPath,
  }),
} as const;
