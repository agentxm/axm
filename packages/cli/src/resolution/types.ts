/**
 * Extension resolution types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { Option } from "effect";

import type { Source } from "../extensions/sources.js";

/**
 * Discriminator for extension kinds.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionType = "skill" | "command" | "pack" | "mcp-server";

/**
 * Where the extension comes from.
 *
 * Re-exported from canonical location at extensions/sources.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type { Source };

/**
 * Additional info about the extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ExtensionMetadata {
  /** Resolved version of the extension */
  readonly version: Option.Option<string>;
  /** Human-readable description */
  readonly description: Option.Option<string>;
  /** List of files included in the extension */
  readonly files: Option.Option<readonly string[]>;
  /** Version constraint from the original input */
  readonly versionConstraint: Option.Option<string>;
}

/**
 * The result of resolution - a fully resolved extension reference.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ExtensionRef {
  /** The kind of extension */
  readonly type: ExtensionType;
  /** Where the extension comes from */
  readonly source: Source;
  /** Fully resolved URL or path */
  readonly origin: string;
  /** Git ref if applicable (branch, tag, commit) */
  readonly ref: Option.Option<string>;
  /** Scoped name if resolved (e.g., @scope/name) */
  readonly name: Option.Option<string>;
  /** Subpath within repo */
  readonly path: Option.Option<string>;
  /** Original input string preserved for debugging */
  readonly originalInput: string;
  /** Additional metadata about the extension */
  readonly metadata: ExtensionMetadata;
}

/**
 * Configuration options for resolution.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ResolutionOptions {
  /** Filter by extension types */
  readonly types: Option.Option<readonly ExtensionType[]>;
  /** Filter by source types */
  readonly sources: Option.Option<readonly Source[]>;
  /** Filter by agent names */
  readonly agents: Option.Option<readonly string[]>;
  /** Current working directory */
  readonly cwd: Option.Option<string>;
  /** Implied scope from settings */
  readonly scope: Option.Option<string>;
  /** Project .axm directory location */
  readonly projectDir: Option.Option<string>;
  /** Global ~/.axm directory location */
  readonly globalDir: Option.Option<string>;
}
