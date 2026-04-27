/**
 * Compile-time type assertions for the WorkspaceContext per-source error
 * families.
 *
 * Pure type-level. Excluded from vitest's runtime suite; included in
 * `tsconfig.spec.json` so the assertions are checked when typecheck runs.
 */

import type { LockfileReadError, SettingsReadError } from "../errors.js";

// SettingsReadError SHALL contain only the three Settings* tags.
type _SettingsExact = [
  Exclude<
    SettingsReadError["_tag"],
    "SettingsIoError" | "SettingsParseError" | "SettingsDecodeError"
  >,
] extends [never]
  ? true
  : false;
const _settingsExact = true as const satisfies _SettingsExact;

type _SettingsComplete = [
  Exclude<
    "SettingsIoError" | "SettingsParseError" | "SettingsDecodeError",
    SettingsReadError["_tag"]
  >,
] extends [never]
  ? true
  : false;
const _settingsComplete = true as const satisfies _SettingsComplete;

// LockfileReadError SHALL contain only the three Lockfile* tags.
type _LockfileExact = [
  Exclude<
    LockfileReadError["_tag"],
    "LockfileIoError" | "LockfileParseError" | "LockfileDecodeError"
  >,
] extends [never]
  ? true
  : false;
const _lockfileExact = true as const satisfies _LockfileExact;

type _LockfileComplete = [
  Exclude<
    "LockfileIoError" | "LockfileParseError" | "LockfileDecodeError",
    LockfileReadError["_tag"]
  >,
] extends [never]
  ? true
  : false;
const _lockfileComplete = true as const satisfies _LockfileComplete;

// WorkspaceRootEscape SHALL NOT be a member of either source-read union.
type _RootEscapeNotInSettings = [
  Extract<SettingsReadError, { readonly _tag: "WorkspaceRootEscape" }>,
] extends [never]
  ? true
  : false;
const _rootEscapeNotInSettings = true as const satisfies _RootEscapeNotInSettings;

type _RootEscapeNotInLockfile = [
  Extract<LockfileReadError, { readonly _tag: "WorkspaceRootEscape" }>,
] extends [never]
  ? true
  : false;
const _rootEscapeNotInLockfile = true as const satisfies _RootEscapeNotInLockfile;

export type _Refs = [
  typeof _settingsExact,
  typeof _settingsComplete,
  typeof _lockfileExact,
  typeof _lockfileComplete,
  typeof _rootEscapeNotInSettings,
  typeof _rootEscapeNotInLockfile,
];
