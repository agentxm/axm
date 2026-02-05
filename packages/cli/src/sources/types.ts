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
 * Extended source type discriminator including "wellknown".
 *
 * Extends BaseSource with `"wellknown"` for HTTP(S) URLs with well-known skills index.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type Source = BaseSource | "wellknown";

// -----------------------------------------------------------------------------
// Parsed Source Interface
// -----------------------------------------------------------------------------

/**
 * Result of parsing a source string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ParsedSource {
  /** Type of the source */
  readonly type: Source;
  /** Original input string */
  readonly original: string;
  /** Normalized canonical form (e.g., "github:owner/repo") */
  readonly canonical: string;
  /** Repository owner (for github/gitlab/bitbucket) */
  readonly owner: Option.Option<string>;
  /** Repository name (for github/gitlab/bitbucket) */
  readonly repo: Option.Option<string>;
  /** Git ref (tag, branch, or SHA) */
  readonly ref: Option.Option<string>;
  /** Subpath within the repository */
  readonly path: Option.Option<string>;
  /** URL (for git sources) */
  readonly url: Option.Option<string>;
  /** Absolute path for local sources (after ~ expansion) */
  readonly localPath: Option.Option<string>;
  /** Base URL for wellknown sources */
  readonly baseUrl: Option.Option<string>;
}
