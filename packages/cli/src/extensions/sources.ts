/**
 * Extension source schemas for skill and extension origins.
 *
 * Defines the canonical source type discriminator used by both settings
 * and lockfile schemas.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

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
export type Source = typeof SourceSchema.Type;
