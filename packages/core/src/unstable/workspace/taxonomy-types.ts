/**
 * Taxonomy types for classifier-backed workspace getters.
 *
 * Defines the shapes returned by workspace methods like `getConfiguredSkills`,
 * `getInstalledCommands`, etc. Separated from service.ts for maintainability.
 *
 * @internal
 */

import type * as Option from "effect/Option";
import type { PackagingKind } from "./classifier.js";

// ---------------------------------------------------------------------------
// Skill taxonomy
// ---------------------------------------------------------------------------

/** Configured extension with source metadata. Skills and commands include `enabled`. */
export interface ConfiguredSkill {
  readonly source: string;
  readonly enabled: boolean;
  readonly packagingKind: PackagingKind;
}

export interface ImplicitSkill {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
}

export interface UnmanagedSkill {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
}

export type InstalledSkill =
  | ({ readonly lifecycle: "configured" } & ConfiguredSkill)
  | ({ readonly lifecycle: "implicit" } & ImplicitSkill);

export type ClassifiedSkill =
  | ({ readonly lifecycle: "configured" } & ConfiguredSkill)
  | ({ readonly lifecycle: "implicit" } & ImplicitSkill)
  | ({ readonly lifecycle: "unmanaged" } & UnmanagedSkill);

// ---------------------------------------------------------------------------
// Command taxonomy
// ---------------------------------------------------------------------------

export interface ConfiguredCommand {
  readonly source: string;
  readonly enabled: boolean;
  readonly packagingKind: PackagingKind;
}

export interface ImplicitCommand {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
}

export interface UnmanagedCommand {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
}

export type InstalledCommand =
  | ({ readonly lifecycle: "configured" } & ConfiguredCommand)
  | ({ readonly lifecycle: "implicit" } & ImplicitCommand);

export type ClassifiedCommand =
  | ({ readonly lifecycle: "configured" } & ConfiguredCommand)
  | ({ readonly lifecycle: "implicit" } & ImplicitCommand)
  | ({ readonly lifecycle: "unmanaged" } & UnmanagedCommand);

// ---------------------------------------------------------------------------
// Generic extension ref taxonomy (MCP servers, packs)
// ---------------------------------------------------------------------------

/** MCP servers and packs do not have `enabled` — use `ExtensionRef` shapes. */
export interface ConfiguredExtensionRef {
  readonly source: string;
  readonly packagingKind: PackagingKind;
}

export interface ImplicitExtensionRef {
  readonly source: Option.Option<string>;
  readonly packagingKind: PackagingKind;
}

export interface UnmanagedExtensionRef {
  readonly source: Option.Option<string>;
  readonly packagingKind: PackagingKind;
}

export type InstalledExtensionRef =
  | ({ readonly lifecycle: "configured" } & ConfiguredExtensionRef)
  | ({ readonly lifecycle: "implicit" } & ImplicitExtensionRef);

export type ClassifiedExtensionRef =
  | ({ readonly lifecycle: "configured" } & ConfiguredExtensionRef)
  | ({ readonly lifecycle: "implicit" } & ImplicitExtensionRef)
  | ({ readonly lifecycle: "unmanaged" } & UnmanagedExtensionRef);
