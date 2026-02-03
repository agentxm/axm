/**
 * Extension source schemas for skill and extension origins.
 *
 * Defines the canonical source type discriminator used by both settings
 * and lockfile schemas.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { Schema } from "effect";

/**
 * Source type discriminator for extension origins.
 *
 * - `"github"` - GitHub repository source
 * - `"git"` - Generic git repository source
 * - `"local"` - Local filesystem source
 * - `"registry"` - Package registry source
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceSchema = Schema.Literal("github", "git", "local", "registry");

/**
 * Inferred type for SourceSchema.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceType = typeof SourceSchema.Type;
