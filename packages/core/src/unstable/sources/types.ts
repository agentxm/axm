/**
 * Core types for source parsing and identification.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { Handle } from "../extensions/handle.js";

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
  readonly owner: Option.Option<Handle>;
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
