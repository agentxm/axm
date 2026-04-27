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

import type * as ServiceMap from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { AgentDescriptor, AgentId } from "../agents/types.js";
import type { WorkspaceContext } from "../workspace/context/context.js";

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
 * Raw workspace `settings.json` document as returned by the accessor.
 *
 * The accessor parses JSON but does NOT decode via `SettingsSchema` — the
 * decode arm is the job of `workspace/settings-schema-valid`. Rules that
 * need a typed shape call `Schema.decodeUnknown(SettingsSchema)` locally;
 * those decodes produce no findings because `workspace/settings-schema-valid`
 * already emits them.
 *
 * A `SettingsReadError` on the accessor's `settings` Effect means the bytes
 * were unreadable or failed JSON.parse. Absence of the file surfaces via
 * `exists(".axm/settings.json") -> false` and is owned by
 * `workspace/initialized`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SettingsDocument = unknown;

/**
 * Raw workspace `axm-lock.yaml` document as returned by the accessor.
 *
 * The accessor parses YAML but does NOT decode via `LockfileSchema` — the
 * decode arm is the job of `workspace/lockfile-valid`. Rules that need a
 * typed shape call `Schema.decodeUnknown(LockfileSchema)` locally; those
 * decodes produce no findings because `workspace/lockfile-valid` already
 * emits them.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LockfileDocument = unknown;

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
  /**
   * Content-root accessor. Rooted at the directory containing `SKILL.md`.
   * For native (registry-installed) skills this is the `src/` sub-directory
   * of the extension package; for non-native skills it is the skill's own
   * directory. Rules validating skill content (`skill-md-present`,
   * `frontmatter-parseable`, and any future rule evaluating files that
   * render into agent directories) read through this accessor.
   */
  readonly files: SkillFileAccessor;
  /**
   * Package-root accessor. Rooted at the skill's extension package root —
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
 * Phase 3b and 3c consumers build `SkillContent` via
 * `buildSkillRuleContexts` (this phase) against the `WorkspaceIndex`
 * surface; publish (Phase 4, this-repo) builds one `SkillContent` per
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
 * `extension-pack.json` bytes through `context.files` as needed.
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
 * Rules read `extension-pack.json` bytes through `context.files` (the
 * authoritative source shared across publish and `axm lint`). The `subject`
 * carries only what rules can't efficiently re-derive from bytes:
 *
 * - `packJson` — the already-decoded `extension-pack.json` contents when
 *   present (caller decodes once, rules don't re-read + re-parse).
 *   `undefined` when the file is absent. Schema-valid rules pipe this into
 *   `Schema.decodeUnknownResult(ExtensionPackManifestSchema)`;
 *   keys-recognized enumerates top-level keys after narrowing to
 *   `Record<string, unknown>`.
 *
 * Unlike `SkillContent`, there is no `isNative` discriminator — packs are
 * registry-only and every pack context is expected to expose a manifest.
 * The presence rule (`pack/manifest-present`) owns the absence arm.
 *
 * Phase 3c consumers build `PackContent` via `buildPackRuleContexts`
 * against the `WorkspaceIndex` surface; publish (Phase 4, this-repo) builds
 * one `PackContent` per incoming archive.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackContent {
  readonly packJson: unknown;
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
  /**
   * Workspace context service. Rules migrating off the legacy
   * `WorkspaceLintAccessor` read scope-keyed state (`state.settings`,
   * `state.lockfile`, projections, agents) through `workspaceCtx.scope(...)`.
   * The legacy `workspace` accessor stays alongside this field until every
   * `workspace/*` rule has been migrated.
   *
   * @experimental This API is unstable and may change without notice.
   */
  readonly workspaceCtx: ServiceMap.Service.Shape<typeof WorkspaceContext>;
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
