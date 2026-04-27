/**
 * Taxonomy types for workspace getters.
 *
 * Defines the shapes returned by workspace methods like `getConfiguredSkills`,
 * `getInstalledCommands`, etc. Separated from service.ts for maintainability.
 *
 * @internal
 */

import type * as Option from "effect/Option";
export type PackagingKind = "native" | "non-native";

export type ConfiguredExtensionState<TExtra extends object = object> = {
  readonly source: string;
  readonly packagingKind: PackagingKind;
} & TExtra;

export type ImplicitExtensionState<TExtra extends object = object> = {
  readonly source: Option.Option<string>;
  readonly packagingKind: PackagingKind;
} & TExtra;

export type UnmanagedExtensionState<TExtra extends object = object> = {
  readonly source: Option.Option<string>;
  readonly packagingKind: PackagingKind;
} & TExtra;

export type LifecycleConfigured<T> = { readonly lifecycle: "configured" } & T;
export type LifecycleImplicit<T> = { readonly lifecycle: "implicit" } & T;
export type LifecycleUnmanaged<T> = { readonly lifecycle: "unmanaged" } & T;

export type EnabledState = {
  readonly enabled: boolean;
};

export type AlwaysEnabledState = {
  readonly enabled: true;
};

export type LocatedState = {
  readonly locations: ReadonlyArray<string>;
};

export type ClassifiedExtension =
  | {
      readonly type: string;
      readonly name: string;
      readonly source: string;
      readonly enabled: boolean;
      readonly packagingKind: PackagingKind;
      readonly lifecycle: "configured";
    }
  | {
      readonly type: string;
      readonly name: string;
      readonly source: Option.Option<string>;
      readonly enabled: true;
      readonly packagingKind: PackagingKind;
      readonly lifecycle: "implicit";
    }
  | {
      readonly type: string;
      readonly name: string;
      readonly source: Option.Option<string>;
      readonly enabled: true;
      readonly packagingKind: PackagingKind;
      readonly locations: ReadonlyArray<string>;
      readonly lifecycle: "unmanaged";
    };

// ---------------------------------------------------------------------------
// Skill taxonomy
// ---------------------------------------------------------------------------

/** Configured extension with source metadata. Skills and commands include `enabled`. */
export type ConfiguredSkill = ConfiguredExtensionState<EnabledState>;

export type ImplicitSkill = ImplicitExtensionState<AlwaysEnabledState>;

export type UnmanagedSkill = UnmanagedExtensionState<AlwaysEnabledState & LocatedState>;

export type InstalledSkill =
  | LifecycleConfigured<ConfiguredSkill>
  | LifecycleImplicit<ImplicitSkill>;

export type ClassifiedSkill =
  | LifecycleConfigured<ConfiguredSkill>
  | LifecycleImplicit<ImplicitSkill>
  | LifecycleUnmanaged<UnmanagedSkill>;

// ---------------------------------------------------------------------------
// Command taxonomy
// ---------------------------------------------------------------------------

export type ConfiguredCommand = ConfiguredExtensionState<EnabledState>;

export type ImplicitCommand = ImplicitExtensionState<AlwaysEnabledState>;

export type UnmanagedCommand = UnmanagedExtensionState<AlwaysEnabledState>;

export type InstalledCommand =
  | LifecycleConfigured<ConfiguredCommand>
  | LifecycleImplicit<ImplicitCommand>;

export type ClassifiedCommand =
  | LifecycleConfigured<ConfiguredCommand>
  | LifecycleImplicit<ImplicitCommand>
  | LifecycleUnmanaged<UnmanagedCommand>;

// ---------------------------------------------------------------------------
// Subagent taxonomy
// ---------------------------------------------------------------------------

/** Configured subagent with source metadata. Includes `enabled`. */
export type ConfiguredSubagent = ConfiguredExtensionState<EnabledState>;

export type ImplicitSubagent = ImplicitExtensionState<AlwaysEnabledState>;

export type UnmanagedSubagent = UnmanagedExtensionState<AlwaysEnabledState>;

export type InstalledSubagent =
  | LifecycleConfigured<ConfiguredSubagent>
  | LifecycleImplicit<ImplicitSubagent>;

export type ClassifiedSubagent =
  | LifecycleConfigured<ConfiguredSubagent>
  | LifecycleImplicit<ImplicitSubagent>
  | LifecycleUnmanaged<UnmanagedSubagent>;

// ---------------------------------------------------------------------------
// Generic extension ref taxonomy (MCP servers, packs)
// ---------------------------------------------------------------------------

/** MCP servers and packs do not have `enabled` — use `ExtensionRef` shapes. */
export type ConfiguredExtensionRef = ConfiguredExtensionState;

export type ImplicitExtensionRef = ImplicitExtensionState;

export type UnmanagedExtensionRef = UnmanagedExtensionState;

export type InstalledExtensionRef =
  | LifecycleConfigured<ConfiguredExtensionRef>
  | LifecycleImplicit<ImplicitExtensionRef>;

export type ClassifiedExtensionRef =
  | LifecycleConfigured<ConfiguredExtensionRef>
  | LifecycleImplicit<ImplicitExtensionRef>
  | LifecycleUnmanaged<UnmanagedExtensionRef>;
