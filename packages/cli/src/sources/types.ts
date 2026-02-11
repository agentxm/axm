/**
 * Core types for source parsing and identification.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type {
  AzureReposSourceConfig,
  BitbucketSourceConfig,
  GitHubSourceConfig,
  GitLabSourceConfig,
  RegistrySourceConfig,
  SourceConfig,
} from "../settings/schema.js";

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
// Discriminated Union Types
// -----------------------------------------------------------------------------

/**
 * GitHub repository source.
 */
export interface GitHubSourceInput {
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
export interface GitLabSourceInput {
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
export interface BitbucketSourceInput {
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
  | GitHubSourceInput
  | GitLabSourceInput
  | BitbucketSourceInput
  | AzureReposSourceInput;

/**
 * Union of all git-based sources (hosting providers, Azure DevOps, and generic git).
 */
export type GitSource = GitHostingProviderSource | GitRepositorySourceInput;

/**
 * Azure Repos repository source (placeholder for future implementation).
 *
 * URL format: https://dev.azure.com/{organization}/{project}/_git/{repo}
 */
export interface AzureReposSourceInput {
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
export type GitRepositorySourceInput = {
  readonly source: "git";
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  readonly url: URL;
};

/**
 * Package registry source input (placeholder for future implementation).
 */
export type RegistrySourceInput = {
  readonly source: "registry";
  readonly scope: string;
  readonly name: string;
};

/**
 * Local filesystem path source.
 */
export interface LocalSourceInput {
  readonly source: "local";
  /** Absolute path for local sources (after ~ expansion) */
  readonly path: string;
}

/**
 * Union of all source input types.
 * Discriminated union based on the `source` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceInput =
  | GitHubSourceInput
  | GitLabSourceInput
  | BitbucketSourceInput
  | AzureReposSourceInput
  | GitRepositorySourceInput
  | RegistrySourceInput
  | LocalSourceInput;

/**
 * Result of parsing a source input string.
 *
 * Combines the parsed input coordinates with an optional explicit config
 * (determined during two-phase parsing when a config-name prefix or URL
 * hostname match identifies the source provider).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ParseSourceInputResult {
  readonly input: SourceInput;
  readonly config: Option.Option<SourceConfig>;
}

// -----------------------------------------------------------------------------
// Source (Input + Config)
// -----------------------------------------------------------------------------

/**
 * A Source combines the parsed input (resource coordinates) with the
 * configured source provider that will be used to resolve it.
 *
 * For git hosting providers and registries, this intersects the input with the
 * matching source config from settings. For git and local sources, no config is
 * needed — they are self-describing.
 *
 * @experimental This API is unstable and may change without notice.
 */

export type GitHubSource = GitHubSourceInput & GitHubSourceConfig;
export type GitLabSource = GitLabSourceInput & GitLabSourceConfig;
export type BitbucketSource = BitbucketSourceInput & BitbucketSourceConfig;
export type AzureReposSource = AzureReposSourceInput & AzureReposSourceConfig;
export type RegistrySource = RegistrySourceInput & RegistrySourceConfig;
export type GitRepositorySource = GitRepositorySourceInput;
export type LocalSource = LocalSourceInput;

/**
 * Union of all resolved source types.
 * Discriminated union based on the `source` field.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Source =
  | GitHubSource
  | GitLabSource
  | BitbucketSource
  | AzureReposSource
  | RegistrySource
  | GitRepositorySource
  | LocalSource;
