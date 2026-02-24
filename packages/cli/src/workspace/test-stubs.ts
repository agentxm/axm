/**
 * Default no-op stubs for taxonomy getter methods added to WorkspaceContextService.
 * Spread into test mocks to satisfy the interface without implementing every method.
 *
 * @internal Test-only. Not exported from the barrel.
 */

import * as Effect from "effect/Effect";
import type {
  ConfiguredSkill,
  ImplicitSkill,
  UnmanagedSkill,
  InstalledSkill,
  ClassifiedSkill,
  ConfiguredCommand,
  ImplicitCommand,
  UnmanagedCommand,
  InstalledCommand,
  ClassifiedCommand,
  ConfiguredExtensionRef,
  ImplicitExtensionRef,
  UnmanagedExtensionRef,
  InstalledExtensionRef,
  ClassifiedExtensionRef,
} from "./service.js";
import type { CliError } from "../cli-error/index.js";
import type * as Record from "effect/Record";

type R<T> = Effect.Effect<Record.ReadonlyRecord<string, T>, CliError>;
type RA = Effect.Effect<ReadonlyArray<string>, CliError>;

const empty = <T>(): R<T> => Effect.succeed({}) as R<T>;
const emptyArr = (): RA => Effect.succeed([]);

/**
 * No-op stubs for all taxonomy getters. Spread into mock objects:
 * ```ts
 * const ws: WorkspaceContextService = {
 *   ...taxonomyStubs,
 *   // your overrides
 * };
 * ```
 */
export const taxonomyStubs = {
  // Skill taxonomy
  getConfiguredSkills: empty<ConfiguredSkill>,
  getImplicitSkills: empty<ImplicitSkill>,
  getUnmanagedSkills: empty<UnmanagedSkill>,
  getInstalledSkills: empty<InstalledSkill>,
  getClassifiedSkills: empty<ClassifiedSkill>,
  getConfiguredExternalSkills: empty<ConfiguredSkill>,
  getUnmanagedExternalSkills: empty<UnmanagedSkill>,
  getIgnoredSkillPatterns: emptyArr,
  // Command taxonomy
  getConfiguredCommands: empty<ConfiguredCommand>,
  getImplicitCommands: empty<ImplicitCommand>,
  getUnmanagedCommands: empty<UnmanagedCommand>,
  getInstalledCommands: empty<InstalledCommand>,
  getClassifiedCommands: empty<ClassifiedCommand>,
  getConfiguredExternalCommands: empty<ConfiguredCommand>,
  getUnmanagedExternalCommands: empty<UnmanagedCommand>,
  getIgnoredCommandPatterns: emptyArr,
  // MCP Server taxonomy
  getConfiguredMcpServers: empty<ConfiguredExtensionRef>,
  getImplicitMcpServers: empty<ImplicitExtensionRef>,
  getUnmanagedMcpServers: empty<UnmanagedExtensionRef>,
  getInstalledMcpServers: empty<InstalledExtensionRef>,
  getClassifiedMcpServers: empty<ClassifiedExtensionRef>,
  getConfiguredExternalMcpServers: empty<ConfiguredExtensionRef>,
  getUnmanagedExternalMcpServers: empty<UnmanagedExtensionRef>,
  getIgnoredMcpServerPatterns: emptyArr,
  // Pack taxonomy
  getConfiguredPacks: empty<ConfiguredExtensionRef>,
  getImplicitPacks: empty<ImplicitExtensionRef>,
  getUnmanagedPacks: empty<UnmanagedExtensionRef>,
  getInstalledPacks: empty<InstalledExtensionRef>,
  getClassifiedPacks: empty<ClassifiedExtensionRef>,
  getConfiguredExternalPacks: empty<ConfiguredExtensionRef>,
  getUnmanagedExternalPacks: empty<UnmanagedExtensionRef>,
  getIgnoredPackPatterns: emptyArr,
} as const;
