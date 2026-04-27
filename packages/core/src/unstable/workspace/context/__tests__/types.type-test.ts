/**
 * Compile-time type assertions for the WorkspaceContext shared types contract.
 *
 * Pure type-level. The file is excluded from vitest's runtime suite (see
 * `vitest.config.ts`) and included in `tsconfig.spec.json` so the assertions
 * are checked when typecheck runs. The point of this file is to keep the
 * shared interface shapes stable as later phases attach payload types.
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type { LockfileReadError, SettingsReadError } from "../errors.js";
import type {
  ActivationState,
  ExtensionKey,
  ExtensionStateReader,
  InstallationOrigin,
  InstalledPackRef,
  Scope,
} from "../types.js";

// ---------------------------------------------------------------------------
// Scope: exactly "project" | "user", no widening
// ---------------------------------------------------------------------------

const _projectScope = "project" as const satisfies Scope;
const _userScope = "user" as const satisfies Scope;
// `Scope` SHALL contain no extra members beyond the canonical pair.
type _ScopeNoExtra = [Exclude<Scope, "project" | "user">] extends [never] ? true : false;
const _scopeNoExtra = true as const satisfies _ScopeNoExtra;
// `Scope` SHALL contain every canonical member.
type _ScopeComplete = [Exclude<"project" | "user", Scope>] extends [never] ? true : false;
const _scopeComplete = true as const satisfies _ScopeComplete;

// ---------------------------------------------------------------------------
// ActivationState: exactly "enabled" | "disabled"
// ---------------------------------------------------------------------------

const _enabled = "enabled" as const satisfies ActivationState;
const _disabled = "disabled" as const satisfies ActivationState;
type _ActivationNoExtra = [Exclude<ActivationState, "enabled" | "disabled">] extends [never]
  ? true
  : false;
const _activationNoExtra = true as const satisfies _ActivationNoExtra;
type _ActivationComplete = [Exclude<"enabled" | "disabled", ActivationState>] extends [never]
  ? true
  : false;
const _activationComplete = true as const satisfies _ActivationComplete;

// ---------------------------------------------------------------------------
// ExtensionKey: defaults TType to ExtensionType, narrows to a literal type
// ---------------------------------------------------------------------------

const _skillKey = {
  scope: "project",
  type: "skill",
  name: "some-skill",
} as const satisfies ExtensionKey<"skill">;

const _packKey = {
  scope: "user",
  type: "pack",
  name: "team-pack",
} as const satisfies ExtensionKey<"pack">;

// ---------------------------------------------------------------------------
// InstallationOrigin: tagged union with `direct` | `pack-member`
// ---------------------------------------------------------------------------

interface PlaceholderDeclared {
  readonly source: string;
}
interface PlaceholderPackMember {
  readonly name: string;
}

const _directOrigin = {
  _tag: "direct",
  declared: { source: "github:owner/repo" },
} as const satisfies InstallationOrigin<PlaceholderDeclared, PlaceholderPackMember>;

const _packMemberOrigin = {
  _tag: "pack-member",
  member: { name: "review-tool" },
  pack: {
    key: { scope: "project", type: "pack", name: "team-pack" },
  },
} as const satisfies InstallationOrigin<PlaceholderDeclared, PlaceholderPackMember>;

// InstalledPackRef.key.type is constrained to "pack"
const _installedPackRefShape: InstalledPackRef = {
  key: { scope: "project", type: "pack", name: "team-pack" },
};

// ---------------------------------------------------------------------------
// ExtensionStateReader: empty-shape contract with three readonly Effect cells
// ---------------------------------------------------------------------------

// Placeholder payload aliases representing what subject modules will plug in
// once they own their per-type declared/resolved/actual types.
type DeclaredSkills = unknown;
type ResolvedSkills = unknown;
type ActualSkills = unknown;

type SkillReader = ExtensionStateReader<DeclaredSkills, ResolvedSkills, ActualSkills>;

// Spell out the cell signatures so a regression in the failure channel
// shape — `declared` SHALL fail with exactly `SettingsReadError`, `resolved`
// SHALL fail with exactly `LockfileReadError` — trips a compile error here.
type _SkillDeclaredShape =
  SkillReader["declared"] extends Effect.Effect<Option.Option<DeclaredSkills>, SettingsReadError>
    ? true
    : false;
const _skillDeclaredShape = true as const satisfies _SkillDeclaredShape;

type _SkillDeclaredErrorChannelExact = [
  Exclude<Effect.Error<SkillReader["declared"]>, SettingsReadError>,
] extends [never]
  ? [Exclude<SettingsReadError, Effect.Error<SkillReader["declared"]>>] extends [never]
    ? true
    : false
  : false;
const _skillDeclaredErrorChannelExact = true as const satisfies _SkillDeclaredErrorChannelExact;

type _SkillResolvedShape =
  SkillReader["resolved"] extends Effect.Effect<Option.Option<ResolvedSkills>, LockfileReadError>
    ? true
    : false;
const _skillResolvedShape = true as const satisfies _SkillResolvedShape;

type _SkillResolvedErrorChannelExact = [
  Exclude<Effect.Error<SkillReader["resolved"]>, LockfileReadError>,
] extends [never]
  ? [Exclude<LockfileReadError, Effect.Error<SkillReader["resolved"]>>] extends [never]
    ? true
    : false
  : false;
const _skillResolvedErrorChannelExact = true as const satisfies _SkillResolvedErrorChannelExact;

type _SkillActualShape = SkillReader["actual"] extends Effect.Effect<ActualSkills> ? true : false;
const _skillActualShape = true as const satisfies _SkillActualShape;

// Reference all locals so `noUnusedLocals` does not flag them.
export type _Refs = [
  typeof _projectScope,
  typeof _userScope,
  typeof _scopeNoExtra,
  typeof _scopeComplete,
  typeof _enabled,
  typeof _disabled,
  typeof _activationNoExtra,
  typeof _activationComplete,
  typeof _skillKey,
  typeof _packKey,
  typeof _directOrigin,
  typeof _packMemberOrigin,
  typeof _installedPackRefShape,
  typeof _skillDeclaredShape,
  typeof _skillDeclaredErrorChannelExact,
  typeof _skillResolvedShape,
  typeof _skillResolvedErrorChannelExact,
  typeof _skillActualShape,
];
