/**
 * Core types for source parsing and identification.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { ExtensionName, ExtensionType } from "../extensions/common.js";
import type { Handle } from "../extensions/handle.js";

// -----------------------------------------------------------------------------
// Source Type Schema
// -----------------------------------------------------------------------------

/**
 * Source type discriminator for extension origins.
 *
 * - `"git"` - Generic git repository source
 * - `"registry"` - Package registry source
 * - `"local"` - Local filesystem path source
 * - `"inline"` - Inline workspace configuration
 * - `"workspace"` - Intrinsic source in the selected scope's managed extension tree
 *
 * @experimental
 */
export const SourceTypeSchema = Schema.Literals([
  "git",
  "registry",
  "local",
  "inline",
  "workspace",
]).annotate({
  identifier: "SourceType",
  title: "Source Type",
  description: "Source type discriminator: git, registry, local, inline, or workspace.",
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
 * - `"workspace"` - Intrinsic managed workspace package
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RefTypeSchema = Schema.Literals([
  "git-hosted",
  "registry",
  "local",
  "workspace",
]).annotate({
  identifier: "RefType",
  title: "Ref Type",
  description: "Ref type category: git-hosted, registry, local, or workspace.",
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
  sourceName: Schema.optional(Schema.String),
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
  sourceName: Schema.optional(Schema.String),
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
  readonly name: string;
  readonly location: URL;
}

/** Self-describing — the filesystem path lives in SourceParams. @experimental */
export interface LocalSourceHost {
  readonly type: "local";
}

/** Self-describing — inline transport details live in SourceParams. @experimental */
export interface InlineSourceHost {
  readonly type: "inline";
}

/** Intrinsic managed-tree source whose scope is bound by its settings document. @experimental */
export interface WorkspaceSourceHost {
  readonly type: "workspace";
}

/** @experimental */
export type SourceHost =
  GitSourceHost | RegistrySourceHost | LocalSourceHost | InlineSourceHost | WorkspaceSourceHost;

// -----------------------------------------------------------------------------
// SourceParams — coordinates within a source
// -----------------------------------------------------------------------------

/** @experimental */
export interface GitHubSourceParams {
  readonly type: "github";
  readonly sourceName?: string | undefined;
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
  readonly cloneUrl?: Option.Option<string>;
}

/** @experimental */
export interface GitLabSourceParams {
  readonly type: "gitlab";
  readonly sourceName?: string | undefined;
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
  readonly cloneUrl?: Option.Option<string>;
}

/** @experimental */
export interface BitbucketSourceParams {
  readonly type: "bitbucket";
  readonly sourceName?: string | undefined;
  readonly owner: string;
  readonly repo: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
  readonly cloneUrl?: Option.Option<string>;
}

/** @experimental */
export interface AzureReposSourceParams {
  readonly type: "azurerepos";
  readonly sourceName?: string | undefined;
  readonly organization: string;
  readonly project: string;
  readonly repo: string;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
  readonly cloneUrl?: Option.Option<string>;
}

/** @experimental */
export interface GitSourceParams {
  readonly type: "git";
  readonly url: URL;
  readonly ref: Option.Option<string>;
  readonly subPath: Option.Option<string>;
}

/** @experimental */
export interface RegistrySourceParams {
  readonly type: "registry";
  readonly sourceName?: string | undefined;
  readonly owner: Option.Option<Handle>;
}

/** @experimental */
export interface LocalSourceParams {
  readonly type: "local";
  readonly path: string;
}

/** @experimental */
export interface InlineSourceParams {
  readonly type: "inline";
  readonly command: Option.Option<string>;
  readonly args: ReadonlyArray<string>;
  readonly url: Option.Option<string>;
  readonly headers: Readonly<Record<string, string>>;
}

/** @experimental */
export interface WorkspaceSourceParams {
  readonly type: "workspace";
  readonly owner: Handle;
  readonly extensionType: ExtensionType;
  readonly name: ExtensionName;
}

/** @experimental */
export type SourceParams =
  | GitSourceParams
  | RegistrySourceParams
  | LocalSourceParams
  | InlineSourceParams
  | WorkspaceSourceParams;

// -----------------------------------------------------------------------------
// Source — SourceHost & SourceParams
// -----------------------------------------------------------------------------

/** @experimental */
export type InlineSource = InlineSourceHost & InlineSourceParams;
/** @experimental */
export type GitSource = GitSourceHost & GitSourceParams;
/** @experimental */
export type RegistrySource = RegistrySourceHost & RegistrySourceParams;
/** @experimental */
export type LocalSource = LocalSourceHost & LocalSourceParams;
/** @experimental */
export type WorkspaceSource = WorkspaceSourceHost & WorkspaceSourceParams;
/** @experimental */
export type Source = GitSource | RegistrySource | LocalSource | WorkspaceSource;

// -----------------------------------------------------------------------------
// Convenience Unions
// -----------------------------------------------------------------------------

/** All git-based sources. Hosted-provider syntax expands to this source. @experimental */
export type GitBasedSource = GitSource;

/** Sources that require host configuration from settings. @experimental */
export type ConfiguredSourceHost = RegistrySourceHost;

/** Sources that are self-describing (no settings config needed). @experimental */
export type SelfDescribingSourceHost = GitSourceHost | LocalSourceHost;
