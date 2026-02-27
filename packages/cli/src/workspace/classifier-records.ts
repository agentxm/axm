/**
 * Classifier record conversion helpers.
 *
 * Convert arrays of `ClassifiedExtension` rows into the typed record maps
 * used by workspace service getters (e.g., `getConfiguredSkills`,
 * `getInstalledCommands`).
 *
 * @internal
 */

import type * as Option from "effect/Option";
import type * as Record from "effect/Record";

import type { ClassifiedExtension } from "./classifier.js";
import type {
  ClassifiedCommand,
  ClassifiedExtensionRef,
  ClassifiedSkill,
  ConfiguredCommand,
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ImplicitCommand,
  ImplicitExtensionRef,
  ImplicitSkill,
  InstalledCommand,
  InstalledExtensionRef,
  InstalledSkill,
  UnmanagedCommand,
  UnmanagedExtensionRef,
  UnmanagedSkill,
} from "./taxonomy-types.js";

// ---------------------------------------------------------------------------
// Skill record converters
// ---------------------------------------------------------------------------

export const toConfiguredSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter(
        (r): r is ClassifiedExtension & { lifecycle: "configured" } => r.lifecycle === "configured",
      )
      .map((r) => [
        r.name,
        {
          source: r.source,
          enabled: r.enabled,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, ConfiguredSkill>;

export const toImplicitSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "implicit")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          enabled: true as const,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, ImplicitSkill>;

export const toUnmanagedSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "unmanaged")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          enabled: true as const,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, UnmanagedSkill>;

export const toInstalledSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "configured" || r.lifecycle === "implicit")
      .map((r) => {
        if (r.lifecycle === "configured") {
          return [
            r.name,
            {
              lifecycle: "configured" as const,
              source: r.source,
              enabled: r.enabled,
              packagingKind: r.packagingKind,
              isBuiltIn: r.isBuiltIn,
            },
          ];
        }
        return [
          r.name,
          {
            lifecycle: "implicit" as const,
            source: r.source as Option.Option<string>,
            enabled: true as const,
            packagingKind: r.packagingKind,
            isBuiltIn: r.isBuiltIn,
          },
        ];
      }),
  ) as Record.ReadonlyRecord<string, InstalledSkill>;

export const toClassifiedSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows.map((r) => {
      if (r.lifecycle === "configured") {
        return [
          r.name,
          {
            lifecycle: "configured" as const,
            source: r.source,
            enabled: r.enabled,
            packagingKind: r.packagingKind,
            isBuiltIn: r.isBuiltIn,
          },
        ];
      }
      return [
        r.name,
        {
          lifecycle: r.lifecycle,
          source: r.source as Option.Option<string>,
          enabled: true as const,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ];
    }),
  ) as Record.ReadonlyRecord<string, ClassifiedSkill>;

// ---------------------------------------------------------------------------
// Command record converters
// ---------------------------------------------------------------------------

export const toConfiguredCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter(
        (r): r is ClassifiedExtension & { lifecycle: "configured" } => r.lifecycle === "configured",
      )
      .map((r) => [
        r.name,
        {
          source: r.source,
          enabled: r.enabled,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, ConfiguredCommand>;

// ---------------------------------------------------------------------------
// Generic extension ref record converters (MCP servers, packs)
// ---------------------------------------------------------------------------

export const toConfiguredExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter(
        (r): r is ClassifiedExtension & { lifecycle: "configured" } => r.lifecycle === "configured",
      )
      .map((r) => [
        r.name,
        { source: r.source, packagingKind: r.packagingKind, isBuiltIn: r.isBuiltIn },
      ]),
  ) as Record.ReadonlyRecord<string, ConfiguredExtensionRef>;

export const toImplicitExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "implicit")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, ImplicitExtensionRef>;

export const toUnmanagedExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "unmanaged")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, UnmanagedExtensionRef>;

export const toInstalledExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "configured" || r.lifecycle === "implicit")
      .map((r) => {
        if (r.lifecycle === "configured") {
          return [
            r.name,
            {
              lifecycle: "configured" as const,
              source: r.source,
              packagingKind: r.packagingKind,
              isBuiltIn: r.isBuiltIn,
            },
          ];
        }
        return [
          r.name,
          {
            lifecycle: "implicit" as const,
            source: r.source as Option.Option<string>,
            packagingKind: r.packagingKind,
            isBuiltIn: r.isBuiltIn,
          },
        ];
      }),
  ) as Record.ReadonlyRecord<string, InstalledExtensionRef>;

export const toClassifiedExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows.map((r) => {
      if (r.lifecycle === "configured") {
        return [
          r.name,
          {
            lifecycle: "configured" as const,
            source: r.source,
            packagingKind: r.packagingKind,
            isBuiltIn: r.isBuiltIn,
          },
        ];
      }
      return [
        r.name,
        {
          lifecycle: r.lifecycle,
          source: r.source as Option.Option<string>,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ];
    }),
  ) as Record.ReadonlyRecord<string, ClassifiedExtensionRef>;

// ---------------------------------------------------------------------------
// Filtered variants (external = non-native packaging)
// ---------------------------------------------------------------------------

export const toConfiguredExternalSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "configured" && r.packagingKind === "non-native")
      .map((r) => [
        r.name,
        {
          source: r.source as string,
          enabled: (r as { enabled: boolean }).enabled,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, ConfiguredSkill>;

export const toUnmanagedExternalSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "unmanaged" && r.packagingKind === "non-native")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          enabled: true as const,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, UnmanagedSkill>;

export const toImplicitCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "implicit")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          enabled: true as const,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, ImplicitCommand>;

export const toUnmanagedCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "unmanaged")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          enabled: true as const,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, UnmanagedCommand>;

export const toInstalledCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "configured" || r.lifecycle === "implicit")
      .map((r) => {
        if (r.lifecycle === "configured") {
          return [
            r.name,
            {
              lifecycle: "configured" as const,
              source: r.source,
              enabled: r.enabled,
              packagingKind: r.packagingKind,
              isBuiltIn: r.isBuiltIn,
            },
          ];
        }
        return [
          r.name,
          {
            lifecycle: "implicit" as const,
            source: r.source as Option.Option<string>,
            enabled: true as const,
            packagingKind: r.packagingKind,
            isBuiltIn: r.isBuiltIn,
          },
        ];
      }),
  ) as Record.ReadonlyRecord<string, InstalledCommand>;

export const toClassifiedCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows.map((r) => {
      if (r.lifecycle === "configured") {
        return [
          r.name,
          {
            lifecycle: "configured" as const,
            source: r.source,
            enabled: r.enabled,
            packagingKind: r.packagingKind,
            isBuiltIn: r.isBuiltIn,
          },
        ];
      }
      return [
        r.name,
        {
          lifecycle: r.lifecycle,
          source: r.source as Option.Option<string>,
          enabled: true as const,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ];
    }),
  ) as Record.ReadonlyRecord<string, ClassifiedCommand>;

export const toConfiguredExternalCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "configured" && r.packagingKind === "non-native")
      .map((r) => [
        r.name,
        {
          source: r.source as string,
          enabled: (r as { enabled: boolean }).enabled,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, ConfiguredCommand>;

export const toUnmanagedExternalCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "unmanaged" && r.packagingKind === "non-native")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          enabled: true as const,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, UnmanagedCommand>;

export const toConfiguredExternalExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "configured" && r.packagingKind === "non-native")
      .map((r) => [
        r.name,
        {
          source: r.source as string,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, ConfiguredExtensionRef>;

export const toUnmanagedExternalExtensionRefRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
  Object.fromEntries(
    rows
      .filter((r) => r.lifecycle === "unmanaged" && r.packagingKind === "non-native")
      .map((r) => [
        r.name,
        {
          source: r.source as Option.Option<string>,
          packagingKind: r.packagingKind,
          isBuiltIn: r.isBuiltIn,
        },
      ]),
  ) as Record.ReadonlyRecord<string, UnmanagedExtensionRef>;
