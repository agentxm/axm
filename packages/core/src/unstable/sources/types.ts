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
 * @experimental
 */
export const SourceTypeSchema = Schema.Literals([
  "github",
  "gitlab",
  "bitbucket",
  "azurerepos",
  "git",
  "registry",
  "local",
]).annotate({
  identifier: "SourceType",
  title: "Source Type",
  description:
    "Source type discriminator: github, gitlab, bitbucket, azurerepos, git, registry, or local.",
});

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
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RefTypeSchema = Schema.Literals(["git-hosted", "registry", "local"]).annotate({
  identifier: "RefType",
  title: "Ref Type",
  description: "Ref type category: git-hosted, registry, or local.",
});

/**
 * Inferred type for RefTypeSchema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RefType = Schema.Schema.Type<typeof RefTypeSchema>;

const noSlashSegmentMessage = "Expected non-empty segment without '/' characters";
const noTraversalSegmentMessage = "Expected subpath without '..' traversal segments";

export const SourceSegmentSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value: string) => (value.includes("/") ? noSlashSegmentMessage : undefined)),
  ),
).annotate({
  identifier: "SourceSegment",
  title: "Source Segment",
  description:
    "A non-empty path segment without slash characters, used for owner/repo identifiers.",
});

export const SourceRefSchema = Schema.NonEmptyString;

export const SourceNamespaceSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      value.split("/").some((segment) => segment.length === 0 || segment === "..")
        ? "Expected non-empty namespace path segments without '..' traversal"
        : undefined,
    ),
  ),
).annotate({
  identifier: "SourceNamespace",
  title: "Source Namespace",
  description:
    "A non-empty repository namespace path. GitLab subgroup paths may contain slash-separated segments.",
});

export const SourceSubPathSchema = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((value: string) =>
      value.split("/").some((segment) => segment.length === 0 || segment === "..")
        ? noTraversalSegmentMessage
        : undefined,
    ),
  ),
).annotate({
  identifier: "SourceSubPath",
  title: "Source Subpath",
  description: "A non-empty repository subpath without empty or '..' traversal segments.",
});

const GitHostedSourceParamFields = {
  owner: SourceNamespaceSchema,
  repo: SourceSegmentSchema,
  ref: Schema.OptionFromOptionalKey(SourceRefSchema),
  subPath: Schema.OptionFromOptionalKey(SourceSubPathSchema),
} satisfies Schema.Struct.Fields;

export const GitHostedSourceParamPartsSchema = Schema.Struct(GitHostedSourceParamFields).annotate({
  identifier: "GitHostedSourceParamParts",
  title: "Git Hosted Source Params",
  description: "Parameters for a git-hosted source: owner, repo, optional ref and sub-path.",
});

export type GitHostedSourceParamParts = Schema.Schema.Type<typeof GitHostedSourceParamPartsSchema>;

const AzureReposSourceParamFields = {
  organization: SourceSegmentSchema,
  project: SourceSegmentSchema,
  repo: SourceSegmentSchema,
  ref: Schema.OptionFromOptionalKey(SourceRefSchema),
  subPath: Schema.OptionFromOptionalKey(SourceSubPathSchema),
} satisfies Schema.Struct.Fields;

export const AzureReposSourceParamPartsSchema = Schema.Struct(AzureReposSourceParamFields).annotate(
  {
    identifier: "AzureReposSourceParamParts",
    title: "Azure Repos Source Params",
    description:
      "Parameters for an Azure Repos source: organization, project, repo, optional ref and sub-path.",
  },
);

export type AzureReposSourceParamParts = Schema.Schema.Type<
  typeof AzureReposSourceParamPartsSchema
>;

export const GitHubSourceParamsSchema = Schema.Struct({
  type: Schema.Literal("github"),
  ...GitHostedSourceParamFields,
});

export const GitLabSourceParamsSchema = Schema.Struct({
  type: Schema.Literal("gitlab"),
  ...GitHostedSourceParamFields,
});

export const BitbucketSourceParamsSchema = Schema.Struct({
  type: Schema.Literal("bitbucket"),
  ...GitHostedSourceParamFields,
});

export const AzureReposSourceParamsSchema = Schema.Struct({
  type: Schema.Literal("azurerepos"),
  ...AzureReposSourceParamFields,
});

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

/** @experimental */
export type SourceHost =
  | GitHubSourceHost
  | GitLabSourceHost
  | BitbucketSourceHost
  | AzureReposSourceHost
  | GitSourceHost
  | RegistrySourceHost
  | LocalSourceHost;

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
export type SourceParams =
  | GitHubSourceParams
  | GitLabSourceParams
  | BitbucketSourceParams
  | AzureReposSourceParams
  | GitSourceParams
  | RegistrySourceParams
  | LocalSourceParams;

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
export type Source =
  | GitHubSource
  | GitLabSource
  | BitbucketSource
  | AzureReposSource
  | GitSource
  | RegistrySource
  | LocalSource;

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
export type SelfDescribingSourceHost = GitSourceHost | LocalSourceHost;
