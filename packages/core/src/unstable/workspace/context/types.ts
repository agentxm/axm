/**
 * Shared, non-circular type declarations for the WorkspaceContext capability.
 *
 * Subject modules under `extensions/` and `agents/` own their payload types;
 * this file holds only subject-agnostic declarations referenced from multiple
 * places (Scope, ExtensionKey, ActivationState, InstallationOrigin, the
 * empty-shape ExtensionStateReader contract, and the public surface contracts
 * for ScopedWorkspaceContext / ScopedStateApi / ScopedSourceHostsApi /
 * ScopedProfileApi / ScopedAgentsApi).
 *
 * Source-backed cell failure channels carry per-source tagged error unions
 * imported from `errors.ts`: `SettingsReadError` for `declared` and
 * `LockfileReadError` for `resolved`.
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { ExtensionName, ExtensionType } from "../../extensions/common.js";
import type { LockfileReadError, SettingsReadError } from "./errors.js";

// -----------------------------------------------------------------------------
// Scope
// -----------------------------------------------------------------------------

/**
 * Workspace scope discriminator. Project state is read from `./.axm`; user
 * state is read from `~/.axm` (or `$AXM_USER_HOME`).
 */
export type Scope = "project" | "user";

// -----------------------------------------------------------------------------
// ExtensionKey
// -----------------------------------------------------------------------------

/**
 * Stable identity for an extension row across declared, resolved, actual, and
 * projection cells. Subject modules reuse this shape for their projection rows.
 */
export interface ExtensionKey<TType extends ExtensionType = ExtensionType> {
  readonly scope: Scope;
  readonly type: TType;
  readonly name: ExtensionName;
}

// -----------------------------------------------------------------------------
// Activation
// -----------------------------------------------------------------------------

/**
 * Activation state on installed rows for subjects that support it.
 *
 * For subjects without an `enabled` flag (mcp-server, pack), the projection
 * row supplies `enabled` by policy.
 */
export type ActivationState = "enabled" | "disabled";

// -----------------------------------------------------------------------------
// Installation origin
// -----------------------------------------------------------------------------

/**
 * Why an installed row exists. Direct rows carry the declared entry; pack
 * member rows carry the installed pack reference and the resolved member.
 */
export type InstallationOrigin<TDeclared, TPackMember> =
  | { readonly _tag: "direct"; readonly declared: TDeclared }
  | {
      readonly _tag: "pack-member";
      readonly member: TPackMember;
      readonly pack: InstalledPackRef;
    };

/**
 * Reference to an installed pack carried on pack-member installation origins.
 *
 * Subject modules that need pack-member rows narrow this further; phase 7
 * defines the concrete shape on the pack subject module.
 */
export interface InstalledPackRef {
  readonly key: ExtensionKey<"pack">;
}

// -----------------------------------------------------------------------------
// Extension state reader (empty-shape contract)
// -----------------------------------------------------------------------------

/**
 * Empty-shape contract for the three independent layers per subject. Each
 * subject module instantiates this with its own payload types.
 *
 * The failure channels are intentionally narrow: `declared` only fails with
 * `SettingsReadError` (3 tags), `resolved` only fails with
 * `LockfileReadError` (3 tags), and `actual` never fails — workspace-root
 * path-escape is validated once at provider construction (Layer-level), not
 * per cell.
 */
export interface ExtensionStateReader<TDeclared, TResolved, TActual> {
  readonly declared: Effect.Effect<Option.Option<TDeclared>, SettingsReadError>;
  readonly resolved: Effect.Effect<Option.Option<TResolved>, LockfileReadError>;
  readonly actual: Effect.Effect<TActual>;
}

// -----------------------------------------------------------------------------
// Public scoped surfaces — concrete shapes live in `context.ts`
// -----------------------------------------------------------------------------
//
// `context.ts` (Phase 9) defines the real `ScopedStateApi`,
// `ScopedSourceHostsApi`, `ScopedProfileApi`, and `ScopedWorkspaceContext`
// surfaces. They attach payload types from per-subject modules under
// `extensions/` and per-agent modules under `agents/`, which would create
// import cycles if defined here. `ScopedAgentsApi` is owned by
// `agents/index.ts` for the same reason.
