/**
 * Rule-context types and narrow accessors.
 *
 * Each rule-context type bundles a caller-decoded `subject` with a narrow
 * caller-bound accessor and a `displayRoot` used for path rendering. Rules
 * consume accessors as ordinary property access (no Layer wiring); tests pass
 * literal fakes.
 *
 * Accessor surfaces are intentionally minimal — rules SHALL see only the
 * methods the current catalog requires. Extend a surface only for a documented
 * rule consumer.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type { KnowledgeInspection } from "../knowledge/okf.js";

// -----------------------------------------------------------------------------
// FileAccessError — shared by per-extension file accessors
// -----------------------------------------------------------------------------

/**
 * Tagged error surfaced by an `ExtensionFileAccessor` when a read fails for
 * reasons other than "file not found" (which is represented by
 * `exists -> false`).
 *
 * This interface fixes the error shape rules can rely on.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface FileAccessError {
  readonly _tag: "FileAccessError";
  /** Accessor-relative posix path that failed. */
  readonly path: string;
  /** Machine-readable reason. */
  readonly reason: "path-escape" | "read-error" | "io-error";
  /** Human-readable detail; no rendered display path. */
  readonly message: string;
}

// -----------------------------------------------------------------------------
// ExtensionFileAccessor — package-rooted narrow file access
// -----------------------------------------------------------------------------

/**
 * Narrow rooted file accessor shared by every extension type's rule context.
 *
 * The root is chosen by the caller: the directory containing the type's
 * manifest (`pack.json`, `hook.json`, ...), or for a skill's `files` the
 * directory containing `SKILL.md`. Paths are posix and relative to the root;
 * implementations MUST reject path-traversal attempts (`..`, absolute paths,
 * symlink escapes) by returning `false` from `exists` or failing `readBytes`
 * with `FileAccessError { reason: "path-escape" }`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ExtensionFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

// -----------------------------------------------------------------------------
// Rule-context types
// -----------------------------------------------------------------------------

/**
 * Context passed to every extension type's rules.
 *
 * `subject` is the caller-decoded content for the type (for example
 * {@link PackContent}). `files` is rooted at the directory containing the
 * type's manifest. `displayRoot` is posix and relative; `""` means the
 * accessor root is the rendering base. See `./compose-path.ts` for the four
 * documented cases.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface ManifestRuleContext<S> {
  readonly subject: S;
  readonly files: ExtensionFileAccessor;
  readonly displayRoot: string;
}

/**
 * Context passed to `skill/*` rules.
 *
 * `subject` is the caller-decoded skill content (SKILL.md frontmatter +
 * optional skill.json).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillRuleContext extends ManifestRuleContext<SkillContent> {
  /**
   * Content-root accessor. Rooted at the directory containing `SKILL.md`.
   * For native (registry-installed) skills this is the `src/` sub-directory
   * of the package; for non-native skills it is the skill's own
   * directory. Rules validating skill content (`skill-md-present`,
   * `frontmatter-parseable`, and any future rule evaluating files that
   * render into agent directories) read through this accessor.
   */
  readonly files: ExtensionFileAccessor;
  /**
   * Package-root accessor. Rooted at the skill's package root —
   * the directory containing `skill.json` for native skills. For non-native
   * skills that have no package/content split, this MAY alias `files`.
   * Rules validating package-shape concerns (`manifest-present` and any
   * future rule inspecting files at or above the content root) read through
   * this accessor.
   */
  readonly packageFiles: ExtensionFileAccessor;
}

/**
 * Concrete subject shape passed to `skill/*` rules.
 *
 * Rules read `SKILL.md` bytes through `context.files` (the authoritative
 * source shared across publish and `axm lint`). The `subject` carries only
 * what rules can't efficiently re-derive from bytes:
 *
 * - `isNative` — whether the caller expects this skill to carry a
 *   `skill.json` manifest. Native (registry-installed) skills set this to
 *   `true`; non-native (managed external) skills set it to `false`. The
 *   `skill.json` envelope rules produce no findings when
 *   `isNative === false`, so the same catalog covers both.
 * - `skillJson` — the already-decoded `skill.json` contents when present
 *   (caller decodes once, rules don't re-read + re-parse). `undefined` when
 *   the file is absent.
 *
 * Workspace consumers build `SkillContent` via `buildSkillRuleContexts`
 * against the lint workspace view; publish builds one `SkillContent` per
 * incoming archive.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillContent {
  /** Authored checks are opt-in for acquired content; normal health checks use management. */
  readonly isNative: boolean;
  readonly skillJson: unknown;
  /** Agent-facing skill directory name used for the standard name-match check. */
  readonly expectedName?: string;
}

/**
 * Concrete subject shape passed to `pack/*` rules.
 *
 * `packJson` is the already-decoded `pack.json` contents when present
 * (caller decodes once, rules don't re-read + re-parse), and `undefined`
 * when the file is absent. Packs are registry-only, so there is no
 * `isNative` discriminator; `pack/manifest-present` owns the absence arm.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackContent {
  readonly packJson: unknown;
}

export interface SubagentContent {
  readonly subagentJson: unknown;
}

export interface McpServerContent {
  readonly mcpServerJson: unknown;
}

export interface HookContent {
  readonly hookJson: unknown;
}

/** Subject for the `rule` extension type's `rule/*` lint rules. */
export interface RuleContent {
  readonly ruleJson: unknown;
}

/**
 * Context passed to `knowledge/*` rules.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface KnowledgeRuleContext extends ManifestRuleContext<KnowledgeContent> {
  /** Absolute package root used once while constructing the cached inspection. */
  readonly packageRoot?: string;
}

export interface KnowledgeContent {
  readonly knowledgeJson: unknown;
  readonly inspection?: KnowledgeInspection;
}
