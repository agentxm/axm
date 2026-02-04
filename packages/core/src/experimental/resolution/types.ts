/**
 * Extension resolution types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * Discriminator for extension kinds.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type ExtensionType = "skill" | "command" | "pack" | "mcp-server";

/**
 * Where the extension comes from.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceType = "github" | "gitlab" | "bitbucket" | "git" | "registry";

/**
 * Additional info about the extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ExtensionMetadata {
  /** Resolved version of the extension */
  readonly version?: string;
  /** Human-readable description */
  readonly description?: string;
  /** List of files included in the extension */
  readonly files?: readonly string[];
  /** Version constraint from the original input */
  readonly versionConstraint?: string;
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
  readonly source: SourceType;
  /** Fully resolved URL or path */
  readonly origin: string;
  /** Git ref if applicable (branch, tag, commit) */
  readonly ref?: string;
  /** Scoped name if resolved (e.g., @scope/name) */
  readonly name?: string;
  /** Subpath within repo */
  readonly path?: string;
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
  readonly types?: readonly ExtensionType[];
  /** Filter by source types */
  readonly sources?: readonly SourceType[];
  /** Filter by agent names */
  readonly agents?: readonly string[];
  /** Current working directory */
  readonly cwd?: string;
  /** Implied scope from settings */
  readonly scope?: string;
  /** Project .axm directory location */
  readonly projectDir?: string;
  /** Global ~/.axm directory location */
  readonly globalDir?: string;
}
