/**
 * Core types for source parsing and identification.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ParseError } from "./errors.js";

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
);

/**
 * Inferred type for SourceTypeSchema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceType = typeof SourceTypeSchema.Type;

// -----------------------------------------------------------------------------
// Source Config
// -----------------------------------------------------------------------------

/**
 * Shorthand configuration for a source provider (e.g. `github:owner/repo`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ShorthandConfig<T extends SourceType, T2 extends Source & { source: T }> {
  readonly prefix: T;
  readonly parse: (input: string) => Effect.Effect<T2, ParseError>;
}

/**
 * URL parse configuration for a source provider (e.g. `https://github.com/...`, `git@github.com:...`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface UrlParseConfig<T extends SourceType, T2 extends Source & { source: T }> {
  readonly hostname: string;
  readonly parseUrl: (url: URL) => Effect.Effect<T2, ParseError>;
  readonly parseScp: (input: string) => Effect.Effect<T2, ParseError>;
}

/**
 * Configuration for a source provider.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SourceConfig<
  T extends SourceType = SourceType,
  T2 extends Source & { source: T } = Source & { source: T },
> {
  readonly id: T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly make: (args: any) => T2;
  readonly print: (source: T2) => string;
  readonly shorthand: Option.Option<ShorthandConfig<T, T2>>;
  readonly parseFromUrl: Option.Option<UrlParseConfig<T, T2>>;
}

// -----------------------------------------------------------------------------
// Discriminated Union Types
// -----------------------------------------------------------------------------

/**
 * GitHub repository source.
 */
export interface GitHubSource {
  readonly source: "github";
  /** Repository owner (user or organization) */
  readonly owner: string;
  /** Repository name */
  readonly repo: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly subPath: Option.Option<string>;
}

/**
 * GitLab repository source.
 */
export interface GitLabSource {
  readonly source: "gitlab";
  /** Repository owner (user or group) */
  readonly owner: string;
  /** Repository name */
  readonly repo: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly subPath: Option.Option<string>;
}

/**
 * Bitbucket repository source.
 */
export interface BitbucketSource {
  readonly source: "bitbucket";
  /** Workspace (formerly team or user) */
  readonly owner: string;
  /** Repository slug */
  readonly repo: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly subPath: Option.Option<string>;
}

/**
 * Union of all git hosting provider sources.
 */
export type GitHostingProviderSource =
  | GitHubSource
  | GitLabSource
  | BitbucketSource
  | AzureReposSource;

/**
 * Union of all git-based sources (hosting providers, Azure DevOps, and generic git).
 */
export type GitSource = GitHostingProviderSource | GitRepositorySource;

/**
 * Azure Repos repository source (placeholder for future implementation).
 *
 * URL format: https://dev.azure.com/{organization}/{project}/_git/{repo}
 */
export interface AzureReposSource {
  readonly source: "azurerepos";
  /** Azure DevOps organization */
  readonly organization: string;
  /** Azure DevOps project */
  readonly project: string;
  /** Repository name */
  readonly repo: string;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly subPath: Option.Option<string>;
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
export type GitRepositorySource = {
  readonly source: "git";
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
} & (
  | {
      /** Full git URL */
      readonly url: string;
    }
  | {
      /** Local path */
      readonly path: string;
    }
);

/**
 * Package registry source (placeholder for future implementation).
 */
export type RegistrySource = {
  readonly source: "registry";
} & ({ readonly url: string } | { readonly path: string });

/**
 * Local filesystem path source.
 */
export interface LocalSource {
  readonly source: "local";
  /** Absolute path for local sources (after ~ expansion) */
  readonly path: string;
}

/**
 * Union of all source types.
 * Discriminated union based on the `source` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Source =
  | GitHubSource
  | GitLabSource
  | BitbucketSource
  | AzureReposSource
  | GitRepositorySource
  | RegistrySource
  | LocalSource;
