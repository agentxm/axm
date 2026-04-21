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
import type * as Option from "effect/Option";
import type { AgentDescriptor, AgentId } from "../agents/types.js";
import type { Settings } from "../settings/schema.js";

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
 * Root is the directory containing `extension-pack.json`. Same traversal
 * constraints as `SkillFileAccessor`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackFileAccessor {
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly readBytes: (path: string) => Effect.Effect<Uint8Array, FileAccessError>;
}

// -----------------------------------------------------------------------------
// WorkspaceLintAccessor — narrow workspace query surface
// -----------------------------------------------------------------------------

/**
 * Forward-declared opaque types for workspace documents.
 *
 * Phase 3c replaces these aliases with concrete types (the workspace's
 * `settings` return goes through `SettingsSchema`; the lockfile goes through
 * `LockfileSchema`). Rules never construct these — they only read.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SettingsDocument = Settings;

/**
 * Forward-declared lockfile document.
 *
 * Phase 3c's `WorkspaceLintAccessor` implementation narrows this to the
 * concrete `Lockfile` schema type (`../lockfile/schema.ts`).
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LockfileDocument {
  readonly [key: string]: unknown;
}

/**
 * Tagged error surfaced by workspace-level reads.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SettingsReadError {
  readonly _tag: "SettingsReadError";
  readonly message: string;
}

/**
 * Tagged error surfaced by workspace lockfile reads.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface LockfileReadError {
  readonly _tag: "LockfileReadError";
  readonly message: string;
}

/**
 * A detected-but-not-declared coding agent surfaced by
 * `WorkspaceLintAccessor.detectAgents`. Phase 3c refines this if the detector
 * lands additional probe metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface AgentDetection {
  readonly id: AgentId;
  /** Path (posix, accessor-relative) that led to the detection. */
  readonly markerPath: string;
}

/**
 * Narrow workspace-rooted accessor.
 *
 * Exposes only the methods the v1 workspace catalog consumes; see `lint-engine`
 * spec "Workspace accessor exposes only v1 methods." Extending this interface
 * requires a concrete rule that needs the added method.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceLintAccessor {
  readonly settings: Effect.Effect<SettingsDocument, SettingsReadError>;
  readonly lockfile: Effect.Effect<Option.Option<LockfileDocument>, LockfileReadError>;
  readonly installedSkills: Effect.Effect<ReadonlyArray<SkillRuleContext>>;
  readonly installedPacks: Effect.Effect<ReadonlyArray<PackRuleContext>>;
  readonly knownAgents: Effect.Effect<ReadonlyArray<AgentDescriptor>>;
  readonly detectAgents: (
    scope: "project" | "user",
  ) => Effect.Effect<ReadonlyArray<AgentDetection>>;
  readonly exists: (path: string) => Effect.Effect<boolean>;
  readonly isWritable: (path: string) => Effect.Effect<boolean>;
  readonly list: (path: string) => Effect.Effect<ReadonlyArray<string>, FileAccessError>;
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
  readonly files: SkillFileAccessor;
  readonly displayRoot: string;
}

/**
 * Forward-declared shape of a decoded skill content bundle.
 *
 * Phase 3a replaces this with the concrete `SkillContent` type (SKILL.md
 * frontmatter + optional `skill.json`). Keeping the shape structural in Phase
 * 2 avoids a circular dependency on the skill module.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface SkillContent {
  readonly name: string;
  readonly [key: string]: unknown;
}

/**
 * Context passed to `pack/*` rules.
 *
 * Phase 3b refines `subject` to the concrete `PackContent` type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackRuleContext<S = PackContent> {
  readonly subject: S;
  readonly files: PackFileAccessor;
  readonly displayRoot: string;
}

/**
 * Forward-declared shape of a decoded pack manifest.
 *
 * Phase 3b replaces this with the concrete `PackContent` (`ExtensionPackManifest`
 * wrapper) type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackContent {
  readonly name: string;
  readonly [key: string]: unknown;
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
  readonly workspace: WorkspaceLintAccessor;
  readonly displayRoot: string;
}

/**
 * Workspace subject: the rule-addressable identity of the workspace under lint.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceSubject {
  readonly root: string;
  readonly scope: "project" | "user";
}
