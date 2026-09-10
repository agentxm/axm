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
 * Tagged error surfaced by `SkillFileAccessor` / `PackFileAccessor` when a
 * read fails for reasons other than "file not found" (which is represented
 * by `exists -> false`).
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
// SkillFileAccessor — skill-rooted narrow file access
// -----------------------------------------------------------------------------

/**
 * Narrow skill-rooted file accessor.
 *
 * Root is the directory containing `SKILL.md`. Paths are posix and relative
 * to the root; implementations MUST reject path-traversal attempts (`..`,
 * absolute paths, symlink escapes) by returning `false` from `exists` or
 * failing `readBytes` with `FileAccessError { reason: "path-escape" }`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

// -----------------------------------------------------------------------------
// PackFileAccessor — pack-rooted narrow file access
// -----------------------------------------------------------------------------

/**
 * Narrow pack-rooted file accessor.
 *
 * Root is the directory containing `pack.json`. Same traversal
 * constraints as `SkillFileAccessor`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

// -----------------------------------------------------------------------------
// Manifest-rooted accessors for non-skill extension types
// -----------------------------------------------------------------------------

export interface SubagentFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

export interface McpServerFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

export interface HookFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

export interface RuleFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

export interface KnowledgeFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

// -----------------------------------------------------------------------------
// Rule-context types
// -----------------------------------------------------------------------------

/**
 * Context passed to `skill/*` rules.
 *
 * `subject` is the caller-decoded skill content (SKILL.md frontmatter +
 * optional skill.json).
 *
 * `displayRoot` is posix and relative; `""` means the accessor root is the
 * rendering base. See `./compose-path.ts` for the four documented cases.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillRuleContext<S = SkillContent> {
  readonly subject: S;
  /**
   * Content-root accessor. Rooted at the directory containing `SKILL.md`.
   * For native (registry-installed) skills this is the `src/` sub-directory
   * of the package; for non-native skills it is the skill's own
   * directory. Rules validating skill content (`skill-md-present`,
   * `frontmatter-parseable`, and any future rule evaluating files that
   * render into agent directories) read through this accessor.
   */
  readonly files: SkillFileAccessor;
  /**
   * Package-root accessor. Rooted at the skill's package root —
   * the directory containing `skill.json` for native skills. For non-native
   * skills that have no package/content split, this MAY alias `files`.
   * Rules validating package-shape concerns (`manifest-present` and any
   * future rule inspecting files at or above the content root) read through
   * this accessor.
   */
  readonly packageFiles: SkillFileAccessor;
  readonly displayRoot: string;
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
 *   `true`; non-native (managed external) skills set it to `false`. Rules
 *   that depend on `skill.json` (`skill/manifest-present`,
 *   `skill/manifest-schema-valid`, `skill/manifest-keys-recognized`)
 *   early-return `[]` when `isNative === false`, so the same catalog covers
 *   both.
 * - `skillJson` — the already-decoded `skill.json` contents when present
 *   (caller decodes once, rules don't re-read + re-parse). `undefined` when
 *   the file is absent. Schema-valid rules pipe this into
 *   `Schema.decodeUnknownResult(SkillManifestSchema)`; keys-recognized
 *   enumerates top-level keys after narrowing to `Record<string, unknown>`.
 *
 * Workspace consumers build `SkillContent` via `buildSkillRuleContexts`
 * against the lint workspace view; publish builds one `SkillContent` per
 * incoming archive.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillContent {
  readonly isNative: boolean;
  readonly skillJson: unknown;
  /** Agent-facing skill directory name used for the standard name-match check. */
  readonly expectedName?: string;
}

/**
 * Context passed to `pack/*` rules.
 *
 * `subject` is the caller-decoded pack content — concrete `PackContent` shape
 * defined below. Packs are registry-only at v1 (no non-native arm), so the
 * subject carries only the already-decoded manifest and rules read
 * `pack.json` bytes through `context.files` as needed.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackRuleContext<S = PackContent> {
  readonly subject: S;
  readonly files: PackFileAccessor;
  readonly displayRoot: string;
}

/**
 * Concrete subject shape passed to `pack/*` rules.
 *
 * Rules read `pack.json` bytes through `context.files` (the
 * authoritative source shared across publish and `axm lint`). The `subject`
 * carries only what rules can't efficiently re-derive from bytes:
 *
 * - `packJson` — the already-decoded `pack.json` contents when
 *   present (caller decodes once, rules don't re-read + re-parse).
 *   `undefined` when the file is absent. Schema-valid rules pipe this into
 *   `Schema.decodeUnknownResult(PackManifestSchema)`;
 *   keys-recognized enumerates top-level keys after narrowing to
 *   `Record<string, unknown>`.
 *
 * Unlike `SkillContent`, there is no `isNative` discriminator — packs are
 * registry-only and every pack context is expected to expose a manifest.
 * The presence rule (`pack/manifest-present`) owns the absence arm.
 *
 * Workspace consumers build `PackContent` via `buildPackRuleContexts`
 * against the lint workspace view; publish builds one `PackContent` per
 * incoming archive.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackContent {
  readonly packJson: unknown;
}

export interface SubagentRuleContext<S = SubagentContent> {
  readonly subject: S;
  readonly files: SubagentFileAccessor;
  readonly displayRoot: string;
}

export interface SubagentContent {
  readonly subagentJson: unknown;
}

export interface McpServerRuleContext<S = McpServerContent> {
  readonly subject: S;
  readonly files: McpServerFileAccessor;
  readonly displayRoot: string;
}

export interface McpServerContent {
  readonly mcpServerJson: unknown;
}

export interface HookRuleContext<S = HookContent> {
  readonly subject: S;
  readonly files: HookFileAccessor;
  readonly displayRoot: string;
}

export interface HookContent {
  readonly hookJson: unknown;
}

/**
 * Context passed to `rule/*` rules.
 *
 * The doubled word is unavoidable: `rule` is an extension type and `rule` is
 * also the lint primitive, so the context for the `rule` extension type is a
 * `RuleRuleContext`. Every other name here follows `<Type>RuleContext`.
 */
export interface RuleRuleContext<S = RuleContent> {
  readonly subject: S;
  readonly files: RuleFileAccessor;
  readonly displayRoot: string;
}

export interface RuleContent {
  readonly ruleJson: unknown;
}

export interface KnowledgeRuleContext<S = KnowledgeContent> {
  readonly subject: S;
  readonly files: KnowledgeFileAccessor;
  readonly displayRoot: string;
  /** Absolute package root used once while constructing the cached inspection. */
  readonly packageRoot?: string;
}

export interface KnowledgeContent {
  readonly knowledgeJson: unknown;
  readonly inspection?: KnowledgeInspection;
}
