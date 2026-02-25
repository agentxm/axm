/**
 * Workspace context service for CLI commands.
 *
 * This is the sole public gateway for all settings and lockfile read/write
 * operations. It calls the I/O functions (`readSettings`, `writeSettings`,
 * `readLockfile`, `writeLockfile`) directly and manages mutation
 * serialization via a single Semaphore(1). No other service should perform
 * settings or lockfile I/O in production; the per-service semaphores in
 * `settings/service.ts` and `lockfile/service.ts` have been removed.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { type AgentDescriptor, detectAgents, getAllAgents, getAgentById } from "../agents/index.js";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  LOCKFILE_NAME,
  readLockfile,
  writeLockfile,
  type CommandLockEntry,
  type CommandsLockMap,
  type McpServerLockEntry,
  type McpServersLockMap,
  type PackLockEntry,
  type PacksLockMap,
  type RegistryPackLockEntry,
  type SkillLockEntry,
  type SkillsLockMap,
} from "../lockfile/index.js";
import {
  BUILTIN_PACK_FQN,
  BUILTIN_PACK_NAME,
  BUILTIN_PACK_SCOPE,
  resolveBuiltinPack,
} from "../builtin-pack/index.js";
import { copySkillDirectory } from "../extensions/skills/operations/copy-directory.js";
import { createSymlink } from "../utils/create-symlink.js";
import {
  computeSkillPaths,
  type SkillDirPaths,
  type SkillPathSource,
} from "../extensions/skills/paths.js";
import { computePackPaths, type PackDirPath } from "../extensions/packs/paths.js";
import { sanitizeName } from "../extensions/skills/utils.js";
import { AgentIdSchema } from "../extensions/common.js";
import { formatFqn } from "../extensions/fqn.js";
import { type CliError, makeCliError } from "../cli-error/index.js";
import {
  collapseSkillEntry,
  createDefaultSettings,
  DEFAULT_NAMESPACE,
  getSkillEntrySource,
  type NonSkillExtensionsMap,
  type NormalizedSkillEntry,
  normalizeSkillEntry,
  type PacksMap,
  readSettings,
  SETTINGS_FILENAME,
  type Settings,
  type SkillsMap,
  type SourceHostConfig,
  writeSettings,
} from "../settings/index.js";
import { lockEntryToSourceParams, parseInputPattern, printSourceParams } from "../sources/index.js";
import * as Record from "effect/Record";
import { getAxmDir } from "./paths.js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Confirm, Log, Multiselect } from "../tui/index.js";
import { PromptCancelled } from "../tui/index.js";
import type { Operation, Plan, PlannedJobStep } from "./plan.js";
import { displayPlan } from "./display-plan.js";
import { applyPlan, type ExecutionContext, type Handlers } from "./apply-plan.js";
import { classifyExtensions, type ClassifiedExtension, type PackagingKind } from "./classifier.js";
import { discoverSkillsInDir } from "../cli-commands/skills/install/discover-skills.js";

/**
 * Arguments for `setSkill` — bundles the skill name (map key) with the lock entry.
 * The name may diverge from any registry extension name.
 */
export interface SetSkillArgs {
  readonly name: string;
  readonly lockEntry: SkillLockEntry;
  /** Version constraint from the original source (e.g. "^1.0.0"). Preserved in settings, not in lockfile. */
  readonly versionConstraint: Option.Option<string>;
}

/**
 * Arguments for `setPack` — all `PackLockEntry` fields except `type` (always "registry"),
 * plus an optional version constraint for settings persistence.
 */
export type SetPackArgs = Omit<RegistryPackLockEntry, "type"> & {
  /** Version constraint from the original source (e.g. "^2.0.0"). Preserved in settings, not in lockfile. */
  readonly versionConstraint: Option.Option<string>;
};

/**
 * Arguments for `setCommand` — bundles the command name with the lock entry.
 */
export interface SetCommandArgs {
  readonly name: string;
  readonly lockEntry: CommandLockEntry;
}

/**
 * Arguments for `setMcpServer` — bundles the MCP server name with the lock entry.
 */
export interface SetMcpServerArgs {
  readonly name: string;
  readonly lockEntry: McpServerLockEntry;
}

// ---------------------------------------------------------------------------
// Taxonomy types (classifier-backed workspace getters)
// ---------------------------------------------------------------------------

/** Configured extension with source metadata. Skills and commands include `enabled`. */
export interface ConfiguredSkill {
  readonly source: string;
  readonly enabled: boolean;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export interface ImplicitSkill {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export interface UnmanagedSkill {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export type InstalledSkill =
  | ({ readonly lifecycle: "configured" } & ConfiguredSkill)
  | ({ readonly lifecycle: "implicit" } & ImplicitSkill);

export type ClassifiedSkill =
  | ({ readonly lifecycle: "configured" } & ConfiguredSkill)
  | ({ readonly lifecycle: "implicit" } & ImplicitSkill)
  | ({ readonly lifecycle: "unmanaged" } & UnmanagedSkill);

export interface ConfiguredCommand {
  readonly source: string;
  readonly enabled: boolean;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export interface ImplicitCommand {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export interface UnmanagedCommand {
  readonly source: Option.Option<string>;
  readonly enabled: true;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export type InstalledCommand =
  | ({ readonly lifecycle: "configured" } & ConfiguredCommand)
  | ({ readonly lifecycle: "implicit" } & ImplicitCommand);

export type ClassifiedCommand =
  | ({ readonly lifecycle: "configured" } & ConfiguredCommand)
  | ({ readonly lifecycle: "implicit" } & ImplicitCommand)
  | ({ readonly lifecycle: "unmanaged" } & UnmanagedCommand);

/** MCP servers and packs do not have `enabled` — use `ExtensionRef` shapes. */
export interface ConfiguredExtensionRef {
  readonly source: string;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export interface ImplicitExtensionRef {
  readonly source: Option.Option<string>;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export interface UnmanagedExtensionRef {
  readonly source: Option.Option<string>;
  readonly packagingKind: PackagingKind;
  readonly isBuiltIn: boolean;
}

export type InstalledExtensionRef =
  | ({ readonly lifecycle: "configured" } & ConfiguredExtensionRef)
  | ({ readonly lifecycle: "implicit" } & ImplicitExtensionRef);

export type ClassifiedExtensionRef =
  | ({ readonly lifecycle: "configured" } & ConfiguredExtensionRef)
  | ({ readonly lifecycle: "implicit" } & ImplicitExtensionRef)
  | ({ readonly lifecycle: "unmanaged" } & UnmanagedExtensionRef);

// ---------------------------------------------------------------------------
// Source metadata derivation helpers
// ---------------------------------------------------------------------------

type SourceMeta = { readonly packagingKind: PackagingKind; readonly isBuiltIn: boolean };

const deriveSourceMetaFromLockType = (lockType: string): SourceMeta => {
  switch (lockType) {
    case "builtin":
      return { packagingKind: "native", isBuiltIn: true };
    case "registry":
      return { packagingKind: "native", isBuiltIn: false };
    default:
      // git, github, gitlab, bitbucket, azurerepos, local
      return { packagingKind: "non-native", isBuiltIn: false };
  }
};

/**
 * Built-in source defaults that are always available unless overridden.
 *
 * @internal
 */
const BUILT_IN_SOURCES: ReadonlyArray<SourceHostConfig> = [
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

/**
 * Effect service tag for workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class Workspace extends Context.Tag("@axm.sh/cli/Workspace")<
  Workspace,
  WorkspaceContextService
>() {
  /**
   * Create a layer from a custom service implementation.
   */
  static readonly layer = (service: WorkspaceContextService): Layer.Layer<Workspace> =>
    Layer.succeed(Workspace, service);
}

/**
 * Error loading workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceContextError = CliError | PromptCancelled;

/**
 * Options for creating workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContextOptions {
  /** Whether to use user-scope workspace (~/.axm) or project workspace (.axm) */
  readonly global: boolean;
  /** Auto-accept detected agents without prompting */
  readonly yes: boolean;
  /** Disable all prompts; Option.none() falls back to CI detection */
  readonly nonInteractive: Option.Option<boolean>;
  /** Show plan without applying (preview mode) */
  readonly preview: boolean;
  /** Explicit agent IDs to use (overrides detection and prompting) */
  readonly agents: Option.Option<readonly string[]>;
}

/**
 * Materialize builtin pack skills into the workspace.
 *
 * Copies bundled skill files to canonical locations, creates agent symlinks,
 * and writes lock entries. No-op if the builtin pack is already in the lockfile.
 *
 * @internal
 */
const materializeBuiltinPack = (workspaceDir: string, agentIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    // Check if already materialized
    const existingLockfile = yield* readLockfile(workspaceDir);
    const existingPacks = existingLockfile.packs ?? {};
    if (BUILTIN_PACK_FQN in existingPacks) {
      return;
    }

    // Resolve builtin pack
    const builtinPack = yield* resolveBuiltinPack();
    const base = path.dirname(workspaceDir);
    const now = new Date();

    // Get skill entries from manifest
    const skillEntries = Object.entries(builtinPack.manifest.skills ?? {});

    // Copy each skill to canonical location and create agent symlinks
    yield* Effect.forEach(
      skillEntries,
      ([fqn, version]) =>
        Effect.gen(function* () {
          // Extract skill name from FQN (@axm/skills/axm-manage-skills -> axm-manage-skills)
          const skillName = fqn.split("/")[2]!;

          // Source: bundled skill directory
          const sourceDir = path.join(builtinPack.skillsDir, skillName);

          // Canonical destination: .axm/extensions/@axm/skills/<name>/
          const canonicalDir = path.join(
            workspaceDir,
            "extensions",
            BUILTIN_PACK_SCOPE,
            "skills",
            skillName,
          );

          // Copy skill files to canonical location
          yield* copySkillDirectory(sourceDir, canonicalDir);

          // Create symlinks for each agent
          yield* Effect.forEach(
            agentIds,
            (agentId) =>
              Effect.gen(function* () {
                const maybeAgent = getAgentById(agentId);
                if (Option.isNone(maybeAgent)) return;
                const agent = maybeAgent.value;
                const agentSkillPath = path.join(base, agent.skills.dir, skillName);
                yield* createSymlink({ target: canonicalDir, link: agentSkillPath });
              }),
            { concurrency: "unbounded" },
          );
          void version;
        }),
      { concurrency: "unbounded" },
    );

    // Build skill lock entries
    const skillLockEntries: Record<
      string,
      { type: "builtin"; agents: string[]; installedAt: Date; updatedAt: Date }
    > = {};
    for (const [fqn] of skillEntries) {
      const skillName = fqn.split("/")[2]!;
      skillLockEntries[skillName] = {
        type: "builtin" as const,
        agents: [...agentIds],
        installedAt: now,
        updatedAt: now,
      };
    }

    const packLockEntry = {
      type: "builtin" as const,
      namespace: BUILTIN_PACK_SCOPE,
      name: BUILTIN_PACK_NAME,
      resolvedVersion: builtinPack.version,
      installedAt: now,
      updatedAt: now,
      resolvedSkills: Object.fromEntries(skillEntries.map(([fqn, ver]) => [fqn, ver])),
      resolvedCommands: {} as Record<string, string>,
      resolvedMcpServers: {} as Record<string, string>,
    };

    // Write updated lockfile
    const currentLockfile = yield* readLockfile(workspaceDir);
    const updatedLockfile = {
      ...currentLockfile,
      skills: {
        ...currentLockfile.skills,
        ...skillLockEntries,
      },
      packs: {
        ...(currentLockfile.packs ?? {}),
        [BUILTIN_PACK_FQN]: packLockEntry,
      },
    };
    yield* writeLockfile(workspaceDir, updatedLockfile);
  }).pipe(Effect.catchAll(() => Effect.void));

/**
 * Initialize project workspace by detecting and selecting agents.
 *
 * @param localDir - Path to local .axm directory
 * @param options - Workspace context options
 * @returns Effect yielding selected agent IDs
 *
 * @internal
 */
const initializeProjectWorkspace = (localDir: string, options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    // Select agents based on options
    let selectedAgents: AgentDescriptor[];

    // If explicit agents are provided, use those (no detection needed)
    if (Option.isSome(options.agents) && options.agents.value.length > 0) {
      selectedAgents = Array.filterMap([...options.agents.value], (id) => getAgentById(id));
    } else {
      // Detect installed agents
      const detectedAgents = yield* detectAgents(process.cwd()).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "WORKSPACE_INITIALIZATION_FAILED",
            what: `Failed to detect agents: ${error.message}`,
            cause: error,
          }),
        ),
      );

      if (options.yes) {
        // Auto-select all detected agents
        selectedAgents = detectedAgents;
      } else if (Option.getOrElse(options.nonInteractive, () => process.env["CI"] === "true")) {
        // Non-interactive mode but would need selection - fail with error
        return yield* Effect.fail(
          makeCliError({
            code: "WORKSPACE_INITIALIZATION_FAILED",
            what: "Cannot initialize workspace in non-interactive mode",
            howToFix: "Use --yes to auto-select detected agents, or run interactively",
          }),
        );
      } else {
        // Interactive mode — single multiselect with detected agents pre-selected
        const multiselect = yield* Multiselect;
        const allAgents = getAllAgents();
        const detectedIds = Array.map(detectedAgents, (a) => a.id);

        selectedAgents = yield* multiselect
          .prompt<AgentDescriptor>({
            message: "Select agents to configure",
            items: allAgents,
            toOption: (agent) => ({
              value: agent.id,
              label: agent.name,
              hint: Option.some(`skills: ${agent.skills.dir}`),
            }),
            initialValues: detectedIds.length > 0 ? Option.some(detectedIds) : Option.none(),
            required: Option.some(false),
          })
          .pipe(Effect.map((agents) => [...agents]));
      }
    }

    // Extract agent IDs for settings
    const agentIds = Array.map(selectedAgents, (a) => a.id);

    // Create settings with selected agents (satisfies ensures type safety without cast)
    const settings = { agents: agentIds } satisfies Settings;
    yield* writeSettings(localDir, settings);

    // Create empty lockfile
    yield* writeLockfile(localDir, { lockfileVersion: 1, skills: {} });

    // Materialize builtin pack
    yield* materializeBuiltinPack(localDir, agentIds);

    return settings;
  });

/**
 * Ensure user-scope workspace directory has settings.json and axm-lock.yaml.
 *
 * Creates missing files with empty defaults.
 *
 * @param globalDir - Path to user-scope .axm directory
 *
 * @internal
 */
const ensureGlobalWorkspaceInitialized = (globalDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(globalDir, SETTINGS_FILENAME);
    const lockfilePath = path.join(globalDir, LOCKFILE_NAME);

    const settingsExists = yield* fs.exists(settingsPath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Failed to check if settings file exists: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
    const lockfileExists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "LOCKFILE_PARSE_FAILED",
          what: `Failed to check if lockfile exists: ${lockfilePath}`,
          cause: error,
        }),
      ),
    );

    // Create settings.json with {} if missing
    if (!settingsExists) {
      yield* writeSettings(globalDir, {});
    }

    // Create axm-lock.yaml with version 1, empty skills if missing
    if (!lockfileExists) {
      yield* writeLockfile(globalDir, { lockfileVersion: 1, skills: {} });
    }
  });

/**
 * Ensure project workspace is initialized, returning local settings.
 *
 * Reads existing local settings or runs the initialization flow when missing.
 *
 * @param localDir - Path to local .axm directory
 * @param options - Workspace context options
 * @returns Effect yielding local Settings
 *
 * @internal
 */
const ensureProjectWorkspaceInitialized = (localDir: string, options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    const localSettingsResult = yield* readSettings(localDir).pipe(
      Effect.map(
        Option.match({
          onNone: () => ({ found: false as const, settings: createDefaultSettings() }),
          onSome: (s) => ({ found: true as const, settings: s }),
        }),
      ),
    );

    if (!localSettingsResult.found) {
      // Initialize project workspace and return the settings it wrote
      return yield* initializeProjectWorkspace(localDir, options);
    }

    return localSettingsResult.settings;
  });

/**
 * Create workspace context effect.
 *
 * Loads settings and lockfile based on workspace namespace:
 * - User-scope mode: reads only user-scope settings (auto-creates with {} if not found)
 * - Project mode: merges user-scope and project settings (project overrides user),
 *   runs initialization flow if local settings don't exist
 *
 * When project initialization is needed and `yes=false` and `nonInteractive=false`,
 * TUI services are required for agent selection prompts.
 *
 * @param options - Workspace context options
 * @returns Effect yielding WorkspaceContextService
 *
 * @internal Not exported from barrel - use layer() for external access
 */
const make = (options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    const globalDir = yield* getAxmDir(true);
    const localDir = yield* getAxmDir(false);
    const workspaceDir = options.global ? globalDir : localDir;

    if (options.global) {
      yield* ensureGlobalWorkspaceInitialized(globalDir);
    } else {
      yield* ensureProjectWorkspaceInitialized(localDir, options);
    }

    const resolvedNonInteractive = Option.getOrElse(
      options.nonInteractive,
      () => process.env["CI"] === "true",
    );

    // Capture FileSystem and Path for use in closures
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const semaphore = yield* Effect.makeSemaphore(1);

    const baseDir = path.dirname(workspaceDir);

    const fsLayer = Layer.merge(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    // Mutable cache for merged sources (invalidated by addConfiguredSource)
    let cachedSources: ReadonlyArray<SourceHostConfig> | null = null;

    const withMutex = semaphore.withPermits(1);

    /**
     * Read settings from a directory, returning default settings if not found.
     */
    const readSettingsSafe = (dir: string) =>
      readSettings(dir).pipe(
        Effect.map(Option.getOrElse(() => createDefaultSettings())),
        Effect.provide(fsLayer),
      );

    /**
     * Read lockfile from a directory, returning empty lockfile if not found.
     */
    const readLockfileSafe = (dir: string) => readLockfile(dir).pipe(Effect.provide(fsLayer));

    // -----------------------------------------------------------------------
    // Classifier integration
    // -----------------------------------------------------------------------

    /**
     * Detect skill names on disk from configured agent skill directories.
     */
    const detectSkillNamesOnDisk = (agentIds: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const agentRoots = Array.getSomes(
          Array.map(agentIds, (agentId) =>
            Option.map(getAgentById(agentId), (agent) => path.join(baseDir, agent.skills.dir)),
          ),
        );
        const dedupedRoots = Array.dedupe(agentRoots);
        const discovered = yield* Effect.forEach(
          dedupedRoots,
          (agentRoot) =>
            discoverSkillsInDir(agentRoot, Option.none(), {
              fullDepth: false,
              includeInternal: false,
            }).pipe(
              Effect.catchAll(() =>
                Effect.succeed<ReadonlyArray<{ skill: { name: string }; location: string }>>([]),
              ),
              Effect.provide(fsLayer),
            ),
          { concurrency: "unbounded" },
        ).pipe(Effect.map(Array.flatten));
        return Array.dedupe(discovered.map((d) => d.skill.name));
      });

    /**
     * Build source metadata map for skills from lockfile and settings.
     */
    const deriveSourceMetaForSkills = (
      settings: import("../settings/index.js").Settings,
      lockSkills: Readonly<Record<string, { type: string }>>,
      _detectedNames: ReadonlyArray<string>,
    ): Readonly<Record<string, SourceMeta>> => {
      const result: Record<string, SourceMeta> = {};
      // Lockfile entries take precedence
      for (const [name, entry] of Object.entries(lockSkills)) {
        result[name] = deriveSourceMetaFromLockType(entry.type);
      }
      // Configured entries without lockfile entries — parse source string
      const configuredSkills = settings.skills ?? {};
      for (const [name, entry] of Object.entries(configuredSkills)) {
        if (name in result) continue;
        const sourceStr = getSkillEntrySource(entry);
        // Registry/FQN → native; otherwise → non-native
        if (sourceStr.includes("/skills/") || sourceStr.startsWith("@")) {
          result[name] = { packagingKind: "native", isBuiltIn: false };
        } else {
          result[name] = { packagingKind: "non-native", isBuiltIn: false };
        }
      }
      return result;
    };

    /**
     * Build source metadata map for non-skill extension types.
     */
    const deriveSourceMetaForNonSkill = (
      settingsEntries: Readonly<Record<string, string>>,
      lockEntries: Readonly<Record<string, { type: string }>>,
    ): Readonly<Record<string, SourceMeta>> => {
      const result: Record<string, SourceMeta> = {};
      for (const [name, entry] of Object.entries(lockEntries)) {
        result[name] = deriveSourceMetaFromLockType(entry.type);
      }
      for (const [name, source] of Object.entries(settingsEntries)) {
        if (name in result) continue;
        if (source.includes("/") && source.startsWith("@")) {
          result[name] = { packagingKind: "native", isBuiltIn: false };
        } else {
          result[name] = { packagingKind: "non-native", isBuiltIn: false };
        }
      }
      return result;
    };

    /**
     * Build source metadata map for packs (always native).
     */
    const deriveSourceMetaForPacks = (
      _settingsEntries: Readonly<Record<string, unknown>>,
      lockEntries: Readonly<Record<string, { type: string }>>,
    ): Readonly<Record<string, SourceMeta>> => {
      const result: Record<string, SourceMeta> = {};
      for (const [name, entry] of Object.entries(lockEntries)) {
        result[name] = { packagingKind: "native", isBuiltIn: entry.type === "builtin" };
      }
      return result;
    };

    /**
     * Classify extensions by type using the shared classifier.
     */
    const getClassifiedExtensions = (type: import("../extensions/common.js").ExtensionType) =>
      Effect.gen(function* () {
        const settings = yield* readSettingsSafe(workspaceDir);
        const lockfile = yield* readLockfileSafe(workspaceDir);
        switch (type) {
          case "skill": {
            const detectedNames = yield* detectSkillNamesOnDisk(settings.agents ?? []);
            const configuredSkills = settings.skills ?? {};
            const configured = Object.fromEntries(
              Object.entries(configuredSkills).map(([name, entry]) => {
                const normalized = normalizeSkillEntry(entry);
                return [name, { source: normalized.source, enabled: normalized.enabled }];
              }),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(lockfile.skills),
              detectedNames,
              ignoredPatterns: settings.ignored?.skills ?? [],
              sourceMetaByName: deriveSourceMetaForSkills(
                settings,
                lockfile.skills as Record<string, { type: string }>,
                detectedNames,
              ),
            });
          }
          case "command": {
            const commandSettings = settings.commands ?? {};
            const configured = Object.fromEntries(
              Object.entries(commandSettings).map(([name, source]) => [
                name,
                { source, enabled: true },
              ]),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(lockfile.commands ?? {}),
              detectedNames: [],
              ignoredPatterns: settings.ignored?.commands ?? [],
              sourceMetaByName: deriveSourceMetaForNonSkill(
                commandSettings,
                (lockfile.commands ?? {}) as Record<string, { type: string }>,
              ),
            });
          }
          case "mcp-server": {
            const mcpSettings = settings.mcpServers ?? {};
            const configured = Object.fromEntries(
              Object.entries(mcpSettings).map(([name, source]) => [name, { source }]),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(lockfile.mcpServers ?? {}),
              detectedNames: [],
              ignoredPatterns: settings.ignored?.mcpServers ?? [],
              sourceMetaByName: deriveSourceMetaForNonSkill(
                mcpSettings,
                (lockfile.mcpServers ?? {}) as Record<string, { type: string }>,
              ),
            });
          }
          case "pack": {
            const packSettings = settings.packs ?? {};
            const configured = Object.fromEntries(
              Object.entries(packSettings).map(([name, entry]) => {
                const source = typeof entry === "string" ? entry : entry.source;
                return [name, { source }];
              }),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(lockfile.packs ?? {}),
              detectedNames: [],
              ignoredPatterns: settings.ignored?.packs ?? [],
              sourceMetaByName: deriveSourceMetaForPacks(
                packSettings,
                (lockfile.packs ?? {}) as Record<string, { type: string }>,
              ),
            });
          }
        }
      });

    // Helpers to convert classified rows to record maps

    const toConfiguredSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
      Object.fromEntries(
        rows
          .filter(
            (r): r is ClassifiedExtension & { lifecycle: "configured" } =>
              r.lifecycle === "configured",
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

    const toImplicitSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
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

    const toUnmanagedSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
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

    const toInstalledSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
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

    const toClassifiedSkillRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
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

    const toConfiguredCommandRecord = (rows: ReadonlyArray<ClassifiedExtension>) =>
      Object.fromEntries(
        rows
          .filter(
            (r): r is ClassifiedExtension & { lifecycle: "configured" } =>
              r.lifecycle === "configured",
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

    /**
     * Resolve the immutable registry name for a skill's directory.
     *
     * Registry skill directories are tied to the registry name, not the
     * user-facing alias. This helper tries the lockfile first, then falls
     * back to parsing the settings source string, and finally returns the
     * passed-in name (correct for fresh installs).
     */
    const resolveRegistryDirName = (name: string) =>
      Effect.gen(function* () {
        // Try lockfile
        const lockEntry = yield* readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromNullable(lf.skills[name])),
        );
        if (Option.isSome(lockEntry) && lockEntry.value.type === "registry") {
          return lockEntry.value.name;
        }

        // Fallback to settings source string
        const settings = yield* readSettingsSafe(workspaceDir);
        const skills = settings.skills ?? {};
        const entry = skills[name];
        if (entry !== undefined) {
          const sourceStr = getSkillEntrySource(entry);
          if (sourceStr !== undefined) {
            const parts = sourceStr.split(":");
            if (parts.length >= 2 && parts[0] === "registry") {
              const parsed = parseInputPattern(parts.slice(1).join(":"));
              if (
                Option.isSome(parsed) &&
                parsed.value.pattern.pattern === "registry-pattern-input"
              ) {
                if (Option.isSome(parsed.value.pattern.name)) {
                  return parsed.value.pattern.name.value;
                }
              }
            }
          }
        }

        // Final fallback: passed-in name (correct for fresh installs)
        return name;
      });

    /**
     * Three-layer merge: project sources -> user-scope sources -> built-in sources.
     * Name-based deduplication: earlier layers win.
     */
    const getConfiguredSources = (): Effect.Effect<ReadonlyArray<SourceHostConfig>, CliError> =>
      Effect.gen(function* () {
        if (cachedSources !== null) return cachedSources;

        const projectSettings = yield* readSettingsSafe(localDir);
        const globalSettings = yield* readSettingsSafe(globalDir);

        const projectSources: ReadonlyArray<SourceHostConfig> = projectSettings.sources ?? [];
        const globalSources: ReadonlyArray<SourceHostConfig> = globalSettings.sources ?? [];

        const projectNames = new Set(projectSources.map((s) => s.name));
        const filteredGlobal = globalSources.filter((s) => !projectNames.has(s.name));
        const projectGlobalNames = new Set([...projectNames, ...filteredGlobal.map((s) => s.name)]);

        const merged: ReadonlyArray<SourceHostConfig> = [
          ...projectSources,
          ...filteredGlobal,
          ...BUILT_IN_SOURCES.filter((s) => !projectGlobalNames.has(s.name)),
        ];

        cachedSources = merged;
        return merged;
      });

    return {
      global: options.global,
      path: workspaceDir,
      baseDir,
      nonInteractive: resolvedNonInteractive,
      preview: options.preview,
      resolvePlan: <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
        plan: Plan<Op>,
        handlers: T,
      ) =>
        Effect.gen(function* () {
          const log = yield* Log;
          const confirm = yield* Confirm;
          const emptyPlan = { ...plan, jobs: [] } satisfies Plan<Op>;

          // Scan readiness across all planned steps
          const allSteps = Array.flatMap(plan.jobs, (job) => [...job.steps]);
          const plannedSteps = allSteps.filter(
            (s): s is PlannedJobStep<Op> => s._tag === "PlannedJobStep",
          );
          const hasErrors = plannedSteps.some((s) => s.readiness.status === "error");
          const hasWarnings = plannedSteps.some((s) => s.readiness.status === "warn");

          // Aggregate error messages for the CliError detail
          const errorMessages = plannedSteps
            .filter((s) => s.readiness.status === "error")
            .map((s) => `${s.label}: ${s.readiness.message}`);

          if (options.preview) {
            yield* log.info("Previewing changes...");
            yield* displayPlan(plan);

            if (hasErrors) {
              return yield* makeCliError({
                code: "PLAN_HAS_ERRORS",
                what: "Plan has errors that prevent execution",
                details: errorMessages,
              });
            }

            if (hasWarnings && resolvedNonInteractive) {
              return yield* makeCliError({
                code: "PLAN_HAS_WARNINGS",
                what: "Plan has warnings and cannot prompt in non-interactive mode",
              });
            }

            if (options.yes) {
              if (hasWarnings) {
                const confirmed = yield* confirm.prompt({
                  message: "Plan has warnings. Continue anyway?",
                });
                if (!confirmed) return emptyPlan;
              }
              yield* log.info("Pre-approved via --yes, applying changes...");
              return yield* applyPlan(plan, handlers);
            } else if (resolvedNonInteractive) {
              yield* log.warn(
                "Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.",
              );
              return emptyPlan;
            } else {
              if (hasWarnings) {
                const confirmed = yield* confirm.prompt({
                  message: "Plan has warnings. Continue anyway?",
                });
                if (!confirmed) return emptyPlan;
              } else {
                const confirmed = yield* confirm.prompt({ message: "Apply changes?" });
                if (!confirmed) {
                  yield* log.success("Cancelled.");
                  return emptyPlan;
                }
              }
              return yield* applyPlan(plan, handlers);
            }
          } else {
            if (hasErrors) {
              yield* displayPlan(plan);
              return yield* makeCliError({
                code: "PLAN_HAS_ERRORS",
                what: "Plan has errors that prevent execution",
                details: errorMessages,
              });
            }

            if (hasWarnings) {
              yield* displayPlan(plan);
              if (resolvedNonInteractive) {
                return yield* makeCliError({
                  code: "PLAN_HAS_WARNINGS",
                  what: "Plan has warnings and cannot prompt in non-interactive mode",
                });
              }
              const confirmed = yield* confirm.prompt({
                message: "Plan has warnings. Continue anyway?",
              });
              if (!confirmed) return emptyPlan;
            }

            const applied = yield* applyPlan(plan, handlers);
            yield* displayPlan(applied);
            return applied;
          }
        }),

      getConfiguredSources,

      getConfiguredSourceByName: (name: string) =>
        getConfiguredSources().pipe(
          Effect.map((sources) => Option.fromNullable(sources.find((s) => s.name === name))),
        ),

      getConfiguredRegistrySources: () =>
        getConfiguredSources().pipe(
          Effect.map((sources) => {
            const registrySources = sources.filter(
              (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
            );
            return registrySources;
          }),
        ),

      getConfiguredNamespace: () =>
        Effect.gen(function* () {
          const normalizeNamespace = (s: string): string => (s.startsWith("@") ? s : `@${s}`);
          const projectSettings = yield* readSettingsSafe(localDir);
          if (projectSettings.namespace) return normalizeNamespace(projectSettings.namespace);
          const globalSettings = yield* readSettingsSafe(globalDir);
          if (globalSettings.namespace) return normalizeNamespace(globalSettings.namespace);
          return DEFAULT_NAMESPACE;
        }),

      addConfiguredSource: (source: SourceHostConfig) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* readSettingsSafe(workspaceDir);
            const currentSources: ReadonlyArray<SourceHostConfig> = current.sources ?? [];
            const updatedSettings = { ...current, sources: [...currentSources, source] };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            cachedSources = null; // invalidate cache
          }),
        ),

      getConfiguredSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toConfiguredSkillRecord)),

      getImplicitSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toImplicitSkillRecord)),

      getUnmanagedSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toUnmanagedSkillRecord)),

      getInstalledSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toInstalledSkillRecord)),

      getClassifiedSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toClassifiedSkillRecord)),

      getConfiguredExternalSkills: () =>
        getClassifiedExtensions("skill").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ConfiguredSkill>,
          ),
        ),

      getUnmanagedExternalSkills: () =>
        getClassifiedExtensions("skill").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, UnmanagedSkill>,
          ),
        ),

      getIgnoredSkillPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => (s.ignored?.skills ?? []) as ReadonlyArray<string>),
        ),

      getConfiguredAgents: () =>
        readSettingsSafe(workspaceDir).pipe(Effect.map((s) => s.agents ?? [])),

      getLockedSkills: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.skills)),

      getLockedSkill: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromNullable(lf.skills[name])),
        ),

      getSkillDir: (name: string, source?: SkillPathSource) =>
        Effect.gen(function* () {
          if (source !== undefined) {
            const dirName =
              source.refType === "registry" ? yield* resolveRegistryDirName(name) : name;
            return computeSkillPaths(path.join, baseDir, source, sanitizeName(dirName));
          }

          const lockEntry = yield* readLockfileSafe(workspaceDir).pipe(
            Effect.map((lf) => Option.fromNullable(lf.skills[name])),
          );

          if (Option.isNone(lockEntry)) {
            return yield* makeCliError({
              code: "SKILL_NOT_LOCKED",
              what: `Skill "${name}" not found in lockfile`,
              howToFix: "Install the skill first with `axm skills install`",
            });
          }

          const entry = lockEntry.value;
          const entrySource: SkillPathSource =
            entry.type === "registry"
              ? { refType: "registry", namespace: entry.namespace }
              : entry.type === "local"
                ? { refType: "local" }
                : entry.type === "builtin"
                  ? { refType: "builtin" }
                  : { refType: "git-hosted" };

          const dirName = entry.type === "registry" ? entry.name : name;
          return computeSkillPaths(path.join, baseDir, entrySource, sanitizeName(dirName));
        }),

      setSkill: ({ name, lockEntry, versionConstraint }: SetSkillArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings — thread version constraint through so it survives the round-trip
            const sourceInput = lockEntryToSourceParams(lockEntry);
            const source =
              lockEntry.type === "registry"
                ? (() => {
                    const fqn = formatFqn({ namespace: lockEntry.namespace, type: "skills", name });
                    return Option.isSome(versionConstraint)
                      ? `${fqn}@${versionConstraint.value}`
                      : fqn;
                  })()
                : printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: source },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      setSkillLock: ({ name, lockEntry }: SetSkillArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeSkill: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            if (!(name in currentSkills)) return; // no-op

            const { [name]: _, ...remainingSkills } = currentSkills;
            void _;
            const updatedSettings = { ...currentSettings, skills: remainingSkills };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            if (name in currentLockfile.skills) {
              const { [name]: __, ...remainingLockSkills } = currentLockfile.skills;
              void __;
              const updatedLockfile = { ...currentLockfile, skills: remainingLockSkills };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ),

      removeSkillFromSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            if (!(name in currentSkills)) return; // no-op

            const { [name]: _, ...remainingSkills } = currentSkills;
            void _;
            const updatedSettings = { ...currentSettings, skills: remainingSkills };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      updateSkillEntry: (
        name: string,
        updater: (entry: NormalizedSkillEntry) => NormalizedSkillEntry,
      ) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            if (!(name in currentSkills)) {
              return yield* makeCliError({
                code: "SKILL_NOT_FOUND",
                what: `Skill "${name}" not found in settings`,
              });
            }
            const normalized = normalizeSkillEntry(currentSkills[name]!);
            const updated = updater(normalized);
            const collapsed = collapseSkillEntry(updated);
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: collapsed },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      setSkillEntry: (name: string, entry: NormalizedSkillEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const collapsed = collapseSkillEntry(entry);
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: collapsed },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      renameSkill: (oldName: string, newName: string) =>
        withMutex(
          Effect.gen(function* () {
            // Read and validate settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            if (!(oldName in currentSkills)) {
              return yield* makeCliError({
                code: "SKILL_NOT_FOUND",
                what: `Skill "${oldName}" not found in settings`,
              });
            }

            // Rename in settings
            const oldEntry = currentSkills[oldName]!;
            const { [oldName]: _, ...remainingSkills } = currentSkills;
            void _;
            const updatedSettings = {
              ...currentSettings,
              skills: { ...remainingSkills, [newName]: oldEntry },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Rename in lockfile if entry exists
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            if (oldName in currentLockfile.skills) {
              const oldLockEntry = currentLockfile.skills[oldName]!;
              const { [oldName]: __, ...remainingLockSkills } = currentLockfile.skills;
              void __;
              const updatedLockfile = {
                ...currentLockfile,
                skills: { ...remainingLockSkills, [newName]: oldLockEntry },
              };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ),

      updateLockEntryAgents: (name: string, agents: ReadonlyArray<string>) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            if (!(name in currentLockfile.skills)) {
              return yield* makeCliError({
                code: "LOCK_ENTRY_NOT_FOUND",
                what: `Lock entry "${name}" not found in lockfile`,
              });
            }
            const oldEntry = currentLockfile.skills[name]!;
            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: { ...oldEntry, agents: [...agents] },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      addConfiguredAgent: (agentId: string) =>
        withMutex(
          Effect.gen(function* () {
            const validId = yield* Schema.decodeUnknown(AgentIdSchema)(agentId).pipe(
              Effect.mapError((error) =>
                makeCliError({
                  code: "SETTINGS_PARSE_FAILED",
                  what: `Invalid agent ID: ${agentId}`,
                  cause: error,
                }),
              ),
            );
            const current = yield* readSettingsSafe(workspaceDir);
            const agents = current.agents ?? [];
            if (agents.includes(validId)) return;
            const updatedSettings: Settings = { ...current, agents: [...agents, validId] };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      // -----------------------------------------------------------------------
      // Command taxonomy getters
      // -----------------------------------------------------------------------

      getConfiguredCommands: () =>
        getClassifiedExtensions("command").pipe(Effect.map(toConfiguredCommandRecord)),

      getImplicitCommands: () =>
        getClassifiedExtensions("command").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ImplicitCommand>,
          ),
        ),

      getUnmanagedCommands: () =>
        getClassifiedExtensions("command").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, UnmanagedCommand>,
          ),
        ),

      getInstalledCommands: () =>
        getClassifiedExtensions("command").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, InstalledCommand>,
          ),
        ),

      getClassifiedCommands: () =>
        getClassifiedExtensions("command").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ClassifiedCommand>,
          ),
        ),

      getConfiguredExternalCommands: () =>
        getClassifiedExtensions("command").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ConfiguredCommand>,
          ),
        ),

      getUnmanagedExternalCommands: () =>
        getClassifiedExtensions("command").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, UnmanagedCommand>,
          ),
        ),

      getIgnoredCommandPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => (s.ignored?.commands ?? []) as ReadonlyArray<string>),
        ),

      // -----------------------------------------------------------------------
      // MCP Server taxonomy getters
      // -----------------------------------------------------------------------

      getConfiguredMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(
            (rows) =>
              Object.fromEntries(
                rows
                  .filter(
                    (r): r is ClassifiedExtension & { lifecycle: "configured" } =>
                      r.lifecycle === "configured",
                  )
                  .map((r) => [
                    r.name,
                    { source: r.source, packagingKind: r.packagingKind, isBuiltIn: r.isBuiltIn },
                  ]),
              ) as Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
          ),
        ),

      getImplicitMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ImplicitExtensionRef>,
          ),
        ),

      getUnmanagedMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
          ),
        ),

      getInstalledMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, InstalledExtensionRef>,
          ),
        ),

      getClassifiedMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
          ),
        ),

      getConfiguredExternalMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
          ),
        ),

      getUnmanagedExternalMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
          ),
        ),

      getIgnoredMcpServerPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => (s.ignored?.mcpServers ?? []) as ReadonlyArray<string>),
        ),

      // -----------------------------------------------------------------------
      // Pack taxonomy getters
      // -----------------------------------------------------------------------

      getConfiguredPacks: () =>
        getClassifiedExtensions("pack").pipe(
          Effect.map(
            (rows) =>
              Object.fromEntries(
                rows
                  .filter(
                    (r): r is ClassifiedExtension & { lifecycle: "configured" } =>
                      r.lifecycle === "configured",
                  )
                  .map((r) => [
                    r.name,
                    { source: r.source, packagingKind: r.packagingKind, isBuiltIn: r.isBuiltIn },
                  ]),
              ) as Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
          ),
        ),

      getImplicitPacks: () =>
        getClassifiedExtensions("pack").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ImplicitExtensionRef>,
          ),
        ),

      getUnmanagedPacks: () =>
        getClassifiedExtensions("pack").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
          ),
        ),

      getInstalledPacks: () =>
        getClassifiedExtensions("pack").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, InstalledExtensionRef>,
          ),
        ),

      getClassifiedPacks: () =>
        getClassifiedExtensions("pack").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
          ),
        ),

      getConfiguredExternalPacks: () =>
        getClassifiedExtensions("pack").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
          ),
        ),

      getUnmanagedExternalPacks: () =>
        getClassifiedExtensions("pack").pipe(
          Effect.map(
            (rows) =>
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
              ) as Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
          ),
        ),

      getIgnoredPackPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => (s.ignored?.packs ?? []) as ReadonlyArray<string>),
        ),

      getLockedPacks: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.packs ?? {})),

      getLockedPack: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromNullable((lf.packs ?? {})[name])),
        ),

      setPack: (args: SetPackArgs) =>
        withMutex(
          Effect.gen(function* () {
            const { name, versionConstraint, ...lockFields } = args;
            const lockEntry: RegistryPackLockEntry = { ...lockFields, name, type: "registry" };
            // Update settings — thread versionConstraint through so it's preserved
            const fqn = formatFqn({ namespace: args.namespace, type: "packs", name });
            const source = Option.isSome(versionConstraint)
              ? `${fqn}@${versionConstraint.value}`
              : fqn;
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
            const updatedSettings = {
              ...currentSettings,
              packs: { ...currentPacks, [name]: source },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              packs: {
                ...currentLockedPacks,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removePack: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
            if (!(name in currentPacks)) return; // no-op

            const { [name]: _, ...remainingPacks } = currentPacks;
            void _;
            const updatedSettings = { ...currentSettings, packs: remainingPacks };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            if (name in currentLockedPacks) {
              const { [name]: __, ...remainingLockedPacks } = currentLockedPacks;
              void __;
              const updatedLockfile = { ...currentLockfile, packs: remainingLockedPacks };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ),

      getPackDir: (name: string, namespace: string) =>
        Effect.succeed(computePackPaths(path.join, baseDir, namespace, name)),

      // -----------------------------------------------------------------------
      // Command methods
      // -----------------------------------------------------------------------

      getLockedCommands: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.commands ?? {})),

      getLockedCommand: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromNullable((lf.commands ?? {})[name])),
        ),

      setCommand: ({ name, lockEntry }: SetCommandArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            // Assertion needed: CommandLockEntry is structurally compatible with SkillLockEntry
            // for lockEntryToSourceParams (only accesses source-type fields, not agents)
            const sourceInput = lockEntryToSourceParams(lockEntry as unknown as SkillLockEntry);
            const source = printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: NonSkillExtensionsMap = currentSettings.commands ?? {};
            const updatedSettings = {
              ...currentSettings,
              commands: { ...currentCommands, [name]: source },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedCommands = currentLockfile.commands ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              commands: {
                ...currentLockedCommands,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      setCommandLock: ({ name, lockEntry }: SetCommandArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedCommands = currentLockfile.commands ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              commands: {
                ...currentLockedCommands,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeCommand: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: NonSkillExtensionsMap = currentSettings.commands ?? {};
            if (!(name in currentCommands)) return; // no-op

            const { [name]: _, ...remainingCommands } = currentCommands;
            void _;
            const updatedSettings = { ...currentSettings, commands: remainingCommands };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedCommands = currentLockfile.commands ?? {};
            if (name in currentLockedCommands) {
              const { [name]: __, ...remainingLockedCommands } = currentLockedCommands;
              void __;
              const updatedLockfile = {
                ...currentLockfile,
                commands: remainingLockedCommands,
              };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ),

      // -----------------------------------------------------------------------
      // MCP Server methods
      // -----------------------------------------------------------------------

      getLockedMcpServers: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.mcpServers ?? {})),

      getLockedMcpServer: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromNullable((lf.mcpServers ?? {})[name])),
        ),

      setMcpServer: ({ name, lockEntry }: SetMcpServerArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings (uses "mcpServers" key)
            // Assertion needed: McpServerLockEntry is structurally compatible with SkillLockEntry
            // for lockEntryToSourceParams (only accesses source-type fields, not agents)
            const sourceInput = lockEntryToSourceParams(lockEntry as unknown as SkillLockEntry);
            const source = printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: NonSkillExtensionsMap = currentSettings.mcpServers ?? {};
            const updatedSettings = {
              ...currentSettings,
              mcpServers: { ...currentMcpServers, [name]: source },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile (uses "mcpServers" key)
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              mcpServers: {
                ...currentLockedMcpServers,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      setMcpServerLock: ({ name, lockEntry }: SetMcpServerArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              mcpServers: {
                ...currentLockedMcpServers,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeMcpServer: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings (uses "mcpServers" key)
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: NonSkillExtensionsMap = currentSettings.mcpServers ?? {};
            if (!(name in currentMcpServers)) return; // no-op

            const { [name]: _, ...remainingMcpServers } = currentMcpServers;
            void _;
            const updatedSettings = {
              ...currentSettings,
              mcpServers: remainingMcpServers,
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile (uses "mcpServers" key)
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            if (name in currentLockedMcpServers) {
              const { [name]: __, ...remainingLockedMcpServers } = currentLockedMcpServers;
              void __;
              const updatedLockfile = {
                ...currentLockfile,
                mcpServers: remainingLockedMcpServers,
              };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ),
    };
  });

/**
 * Create a layer that loads workspace context from disk.
 *
 * When project initialization is needed and `yes=false` and `nonInteractive=false`,
 * TUI services are required for agent selection prompts.
 *
 * @param options - Workspace context options
 * @returns Layer providing WorkspaceContext
 *
 * @experimental This API is unstable and may change without notice.
 */
export const layer = (options: WorkspaceContextOptions) => Layer.effect(Workspace, make(options));

/**
 * Workspace context service types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * Service interface for workspace context.
 *
 * Provides access to parsed workspace settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContextService {
  /** Whether this is a user-scope workspace (~/.axm) or project workspace (.axm) */
  readonly global: boolean;
  /** Path to the .axm directory */
  readonly path: string;
  /** Project root directory (parent of .axm) */
  readonly baseDir: string;
  /** Resolved nonInteractive flag (explicit value or CI detection fallback) */
  readonly nonInteractive: boolean;
  /** Whether to show plan without applying (preview mode) */
  readonly preview: boolean;
  /** Display, confirm, and apply a plan based on preview/yes/nonInteractive flags. */
  readonly resolvePlan: <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
    plan: Plan<Op>,
    handlers: T,
  ) => Effect.Effect<Plan<Op>, PromptCancelled | CliError, Log | Confirm | ExecutionContext<T>>;
  /** Merged sources from project, user-scope, and built-in defaults. Cached per workspace lifetime. */
  readonly getConfiguredSources: () => Effect.Effect<ReadonlyArray<SourceHostConfig>, CliError>;
  /** Lookup a source by name from the merged sources list. */
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, CliError>;
  /** Filter merged sources to registry sources. */
  readonly getConfiguredRegistrySources: () => Effect.Effect<
    ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>,
    CliError
  >;
  /** Resolve namespace: project settings -> user-scope settings -> DEFAULT_NAMESPACE. */
  readonly getConfiguredNamespace: () => Effect.Effect<string, CliError>;
  /** Append a source to project settings. Invalidates the sources cache. Serialized by semaphore. */
  readonly addConfiguredSource: (source: SourceHostConfig) => Effect.Effect<void, CliError>;
  /** Configured skills from settings with source metadata. */
  readonly getConfiguredSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredSkill>,
    CliError
  >;
  /** Implicit skills (lockfile-only native entries). */
  readonly getImplicitSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitSkill>,
    CliError
  >;
  /** Unmanaged skills (on-disk only, not configured or implicit). */
  readonly getUnmanagedSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedSkill>,
    CliError
  >;
  /** Installed skills (configured ∪ implicit). */
  readonly getInstalledSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledSkill>,
    CliError
  >;
  /** All classified skills. */
  readonly getClassifiedSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedSkill>,
    CliError
  >;
  /** Configured skills with non-native packaging. */
  readonly getConfiguredExternalSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredSkill>,
    CliError
  >;
  /** Unmanaged skills with non-native packaging. */
  readonly getUnmanagedExternalSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedSkill>,
    CliError
  >;
  /** Ignored skill patterns from settings. */
  readonly getIgnoredSkillPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;
  /** Read settings and return the configured agent IDs, defaulting to `[]`. */
  readonly getConfiguredAgents: () => Effect.Effect<ReadonlyArray<string>, CliError>;
  /** Read lockfile and return the skills lock map. */
  readonly getLockedSkills: () => Effect.Effect<SkillsLockMap, CliError>;
  /** Read lockfile and return the entry for a specific skill, or Option.none(). */
  readonly getLockedSkill: (name: string) => Effect.Effect<Option.Option<SkillLockEntry>, CliError>;
  /** Compute skill directory paths. If source is omitted, looks up the lock entry to determine source type. */
  readonly getSkillDir: (
    name: string,
    source?: SkillPathSource,
  ) => Effect.Effect<SkillDirPaths, CliError>;
  /** Add or update a skill in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setSkill: (args: SetSkillArgs) => Effect.Effect<void, CliError>;
  /** Add or update a skill in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setSkillLock: (args: SetSkillArgs) => Effect.Effect<void, CliError>;
  /** Remove a skill from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeSkill: (name: string) => Effect.Effect<void, CliError>;
  /** Remove a skill from settings only (keep lockfile entry). Used when a pack still references the skill. Serialized by semaphore. */
  readonly removeSkillFromSettings: (name: string) => Effect.Effect<void, CliError>;
  /** Update a skill entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateSkillEntry: (
    name: string,
    updater: (entry: NormalizedSkillEntry) => NormalizedSkillEntry,
  ) => Effect.Effect<void, CliError>;
  /** Create or overwrite a skill entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setSkillEntry: (
    name: string,
    entry: NormalizedSkillEntry,
  ) => Effect.Effect<void, CliError>;
  /** Atomically rename a skill in both settings and lockfile. Serialized by semaphore. */
  readonly renameSkill: (oldName: string, newName: string) => Effect.Effect<void, CliError>;
  /** Update the agents field on a lock entry. Serialized by semaphore. */
  readonly updateLockEntryAgents: (
    name: string,
    agents: ReadonlyArray<string>,
  ) => Effect.Effect<void, CliError>;
  /** Append an agent ID if not already present and write to disk. Fails with CliError if invalid. Serialized by semaphore. */
  readonly addConfiguredAgent: (agentId: string) => Effect.Effect<void, CliError>;
  // --- Command taxonomy ---
  readonly getConfiguredCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredCommand>,
    CliError
  >;
  readonly getImplicitCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitCommand>,
    CliError
  >;
  readonly getUnmanagedCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedCommand>,
    CliError
  >;
  readonly getInstalledCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledCommand>,
    CliError
  >;
  readonly getClassifiedCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedCommand>,
    CliError
  >;
  readonly getConfiguredExternalCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredCommand>,
    CliError
  >;
  readonly getUnmanagedExternalCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedCommand>,
    CliError
  >;
  readonly getIgnoredCommandPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;
  // --- MCP Server taxonomy ---
  readonly getConfiguredMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getImplicitMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitExtensionRef>,
    CliError
  >;
  readonly getUnmanagedMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    CliError
  >;
  readonly getInstalledMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    CliError
  >;
  readonly getClassifiedMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
    CliError
  >;
  readonly getConfiguredExternalMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getUnmanagedExternalMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    CliError
  >;
  readonly getIgnoredMcpServerPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;
  // --- Pack taxonomy ---
  readonly getConfiguredPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getImplicitPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitExtensionRef>,
    CliError
  >;
  readonly getUnmanagedPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    CliError
  >;
  readonly getInstalledPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    CliError
  >;
  readonly getClassifiedPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
    CliError
  >;
  readonly getConfiguredExternalPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    CliError
  >;
  readonly getUnmanagedExternalPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    CliError
  >;
  readonly getIgnoredPackPatterns: () => Effect.Effect<ReadonlyArray<string>, CliError>;
  /** Read lockfile and return the packs lock map. */
  readonly getLockedPacks: () => Effect.Effect<PacksLockMap, CliError>;
  /** Read lockfile and return the entry for a specific pack, or Option.none(). */
  readonly getLockedPack: (name: string) => Effect.Effect<Option.Option<PackLockEntry>, CliError>;
  /** Add or update a pack in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setPack: (args: SetPackArgs) => Effect.Effect<void, CliError>;
  /** Remove a pack from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removePack: (name: string) => Effect.Effect<void, CliError>;
  /** Compute the pack directory path. Packs are always registry-sourced. */
  readonly getPackDir: (name: string, namespace: string) => Effect.Effect<PackDirPath, CliError>;
  /** Read lockfile and return the commands lock map. */
  readonly getLockedCommands: () => Effect.Effect<CommandsLockMap, CliError>;
  /** Read lockfile and return the entry for a specific command, or Option.none(). */
  readonly getLockedCommand: (
    name: string,
  ) => Effect.Effect<Option.Option<CommandLockEntry>, CliError>;
  /** Add or update a command in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setCommand: (args: SetCommandArgs) => Effect.Effect<void, CliError>;
  /** Add or update a command in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setCommandLock: (args: SetCommandArgs) => Effect.Effect<void, CliError>;
  /** Remove a command from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeCommand: (name: string) => Effect.Effect<void, CliError>;
  /** Read lockfile and return the MCP servers lock map. */
  readonly getLockedMcpServers: () => Effect.Effect<McpServersLockMap, CliError>;
  /** Read lockfile and return the entry for a specific MCP server, or Option.none(). */
  readonly getLockedMcpServer: (
    name: string,
  ) => Effect.Effect<Option.Option<McpServerLockEntry>, CliError>;
  /** Add or update an MCP server in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setMcpServer: (args: SetMcpServerArgs) => Effect.Effect<void, CliError>;
  /** Add or update an MCP server in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setMcpServerLock: (args: SetMcpServerArgs) => Effect.Effect<void, CliError>;
  /** Remove an MCP server from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeMcpServer: (name: string) => Effect.Effect<void, CliError>;
}
