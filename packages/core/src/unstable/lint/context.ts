/**
 * Rule-context types and narrow accessors.
 *
 * Each rule-context type bundles a caller-decoded `subject` with a narrow
 * caller-bound accessor and a `displayRoot` used for path rendering. Rules
 * consume accessors as ordinary property access (no Layer wiring); tests pass
 * literal fakes.
 *
 * Phase 2 pins the context shapes and accessor interfaces. Phases 3a, 3b, and
 * 3c land the concrete `subject` decoders and VFT-/platform-backed accessor
 * implementations.
 *
 * Accessor surfaces are intentionally minimal — rules SHALL see only the
 * methods the v1 catalog requires. Extending a surface is a Phase 3a/3b/3c
 * action with a documented rule consumer, not a free action.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type { WorkspaceReadModel } from "../workspace/read-model/service.js";

// -----------------------------------------------------------------------------
// FileAccessError — shared by per-extension file accessors
// -----------------------------------------------------------------------------

/**
 * Tagged error surfaced by `SkillFileAccessor` / `PackFileAccessor` when a
 * read fails for reasons other than "file not found" (which is represented
 * by `exists -> false`).
 *
 * Concrete implementations live in Phases 3a/3b; this interface fixes the
 * error shape rules can rely on.
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

export interface CommandFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

export interface SubagentFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

export interface McpServerFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

export interface ContextFilesAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
  readonly listFiles: (path: string) => Effect.Effect<ReadonlyArray<string>, FileAccessError>;
}

// -----------------------------------------------------------------------------
// Rule-context types
// -----------------------------------------------------------------------------

/**
 * Context passed to `skill/*` rules.
 *
 * `subject` is the caller-decoded skill content (SKILL.md frontmatter +
 * optional skill.json). Phase 3a refines the `subject` type to the concrete
 * `SkillContent` shape; Phase 2 leaves it structurally open so the rule
 * primitives don't need a circular dependency on the skill module.
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

export interface CommandRuleContext<S = CommandContent> {
  readonly subject: S;
  readonly files: CommandFileAccessor;
  readonly displayRoot: string;
}

export interface CommandContent {
  readonly commandJson: unknown;
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

export interface ContextFilesRuleContext<S = ContextFilesContent> {
  readonly subject: S;
  readonly files: ContextFilesAccessor;
  readonly displayRoot: string;
}

export interface ContextFilesContent {
  readonly contextFilesJson: unknown;
}

/**
 * Context passed to `workspace/*` rules.
 *
 * `subject.scope` is `"project"` (default) or `"user"` (user-level `.axm/`).
 * Rules whose invariants apply at only one scope early-return `[]` via the
 * `check` body.
 *
 * `subject.root` is an absolute filesystem path pinning the workspace root;
 * typed as `string` in Phase 2 so the rule primitives don't depend on a
 * platform-specific path brand.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceRuleContext {
  readonly subject: WorkspaceSubject;
  readonly workspace: WorkspaceReadModel;
  readonly axmDirExists: Effect.Effect<boolean>;
  readonly displayRoot: string;
}

/**
 * WorkspaceMutations subject: the rule-addressable identity of the workspace under lint.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceSubject {
  readonly root: string;
  readonly scope: "project" | "user";
}
