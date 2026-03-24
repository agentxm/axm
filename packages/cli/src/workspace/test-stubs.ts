/**
 * Default no-op stubs for taxonomy getter methods added to WorkspaceContextService.
 * Spread into test mocks to satisfy the interface without implementing every method.
 *
 * @internal Test-only. Not exported from the barrel.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type {
  WorkspaceContextService,
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
import type { AppError } from "../app-error/index.js";
import type * as Record from "effect/Record";

type R<T> = Effect.Effect<Record.ReadonlyRecord<string, T>, AppError>;
type RA = Effect.Effect<ReadonlyArray<string>, AppError>;

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
  getLockfileState: () => Effect.succeed("ok" as const),
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

/**
 * Base workspace mock with no-op defaults for all methods.
 * Tests should only override the methods they exercise.
 *
 * @example
 * ```ts
 * const ws = makeBaseWorkspaceMock("/tmp/axm", {
 *   setSkill: vi.fn(() => Effect.void),
 * });
 * ```
 */
export const makeBaseWorkspaceMock = (
  axmDir = "/tmp/axm",
  overrides?: Partial<WorkspaceContextService>,
): WorkspaceContextService => {
  const baseDir = axmDir.replace(/\/\.axm$/, "") || "/tmp";
  const base: Record<string, unknown> = {
    ...taxonomyStubs,
    scope: "project",
    path: axmDir,
    baseDir,
    resolvePlan: () =>
      Effect.succeed({ _tag: "ExecutedPlan", name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredNamespace: () => Effect.succeed("@community"),
    getDefaultNamespace: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(["claude-code"]),
    getLockedSkills: () => Effect.succeed({}),
    getLockedSkill: () => Effect.succeed(Option.none()),
    getSkillDir: () =>
      Effect.succeed({
        canonicalPath: `${axmDir}/extensions/external/skills/test`,
        skillSrcPath: `${axmDir}/extensions/external/skills/test`,
      }),
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    setSkillEntry: () => Effect.void,
    renameSkill: () => Effect.void,
    updateLockEntryAgents: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: `${axmDir}/extensions/@test/packs/test` }),
    getLockedCommands: () => Effect.succeed({}),
    getLockedCommand: () => Effect.succeed(Option.none()),
    setCommand: () => Effect.void,
    setCommandLock: () => Effect.void,
    removeCommand: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    removeSkillLock: () => Effect.void,
    removeCommandSettings: () => Effect.void,
    removeCommandLock: () => Effect.void,
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removePackSettings: () => Effect.void,
    removePackLock: () => Effect.void,
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
    markDependencyRetainedInLockfile: () => Effect.void,
  };
  return { ...base, ...overrides } as unknown as WorkspaceContextService;
};
