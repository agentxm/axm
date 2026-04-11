import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { LOCKFILE_NAME } from "../lockfile/index.js";
import type {
  CommandsLockMap,
  CommandLockEntry,
  ExtensionPacksLockMap,
  ExtensionPackLockEntry,
  McpServersLockMap,
  McpServerLockEntry,
  SubagentsLockMap,
} from "../lockfile/index.js";
import type { SubagentLockEntry } from "../lockfile/schema.js";
import { computeExtensionPackPaths, type ExtensionPackRef } from "../packs/index.js";
import { resolveSource, SourceHostProviders } from "../source-resolution/index.js";
import { computeSubagentPaths, type SubagentExtensionRef } from "../subagents/index.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  extensionTypeSentenceLabels,
  parseRegistrySourceRef,
  toInstallableExtensionTypePlural,
  type ExtensionRef,
  type RegistrySourceRefParts,
} from "../extensions/index.js";
import { sanitizeName } from "../extensions/utils.js";
import type { CommandExtensionRef } from "../commands/index.js";
import type { McpServerExtensionRef } from "../mcp-servers/index.js";
import { Workspace } from "./service-interface.js";
import {
  createDefaultSettings,
  normalizeCommandEntry,
  normalizeSubagentEntry,
  readSettings,
} from "../settings/index.js";
import {
  buildWorkspaceSkillSnapshot,
  isResolvedWorkspaceSkill,
  type WorkspaceSkillAgentIssue,
  type WorkspaceSkillAgentSnapshot,
  type WorkspaceResolvedSkill,
  type WorkspaceSkillState,
  type WorkspaceUnresolvedSkill,
} from "./skill-snapshot.js";

type DoctorExtensionType = "skill" | "command" | "subagent" | "mcp-server" | "pack";
type NonSkillDoctorExtensionType = Exclude<DoctorExtensionType, "skill">;

type SourceUnresolvableCode = "SKILL_SOURCE_UNRESOLVABLE";

type LockfileCode = "LOCKFILE_MISSING" | "LOCKFILE_INVALID";

type InvalidEntryCode =
  | "COMMAND_ENTRY_INVALID"
  | "SUBAGENT_ENTRY_INVALID"
  | "MCP_SERVER_ENTRY_INVALID"
  | "PACK_ENTRY_INVALID";

type NotInstalledCode =
  | "SKILL_NOT_INSTALLED"
  | "COMMAND_NOT_INSTALLED"
  | "SUBAGENT_NOT_INSTALLED"
  | "MCP_SERVER_NOT_INSTALLED"
  | "PACK_NOT_INSTALLED";

const sourceUnresolvableCodeByType = {
  skill: "SKILL_SOURCE_UNRESOLVABLE",
} as const satisfies Record<"skill", SourceUnresolvableCode>;

const invalidEntryCodeByType = {
  command: "COMMAND_ENTRY_INVALID",
  subagent: "SUBAGENT_ENTRY_INVALID",
  "mcp-server": "MCP_SERVER_ENTRY_INVALID",
  pack: "PACK_ENTRY_INVALID",
} as const satisfies Record<NonSkillDoctorExtensionType, InvalidEntryCode>;

const notInstalledCodeByType = {
  skill: "SKILL_NOT_INSTALLED",
  command: "COMMAND_NOT_INSTALLED",
  subagent: "SUBAGENT_NOT_INSTALLED",
  "mcp-server": "MCP_SERVER_NOT_INSTALLED",
  pack: "PACK_NOT_INSTALLED",
} as const satisfies Record<DoctorExtensionType, NotInstalledCode>;

const blockingDiagnosticCodes = new Set<string>([
  sourceUnresolvableCodeByType.skill,
  ...Object.values(invalidEntryCodeByType),
]);

export const WORKSPACE_DOCTOR_DIAGNOSTIC_SEVERITIES = ["warn", "fail"] as const;

export type WorkspaceDoctorDiagnosticSeverity =
  (typeof WORKSPACE_DOCTOR_DIAGNOSTIC_SEVERITIES)[number];

export type WorkspaceDoctorDiagnosticCode =
  | LockfileCode
  | SourceUnresolvableCode
  | InvalidEntryCode
  | NotInstalledCode
  | "SKILL_ENABLEMENT_MISMATCH"
  | "AGENT_CONFIGURATION_ISSUE";

export interface WorkspaceDoctorDiagnostic {
  readonly code: WorkspaceDoctorDiagnosticCode;
  readonly severity: WorkspaceDoctorDiagnosticSeverity;
  readonly subject: string;
  readonly message: string;
  readonly hint?: string;
}

export interface WorkspaceDoctorDiagnosis {
  readonly diagnostics: ReadonlyArray<WorkspaceDoctorDiagnostic>;
  readonly warned: number;
  readonly failed: number;
  readonly canSync: boolean;
}

interface ConfiguredCommandEntry {
  readonly type: "command";
  readonly name: string;
  readonly source: string;
  readonly lockEntry: Option.Option<CommandLockEntry>;
}

interface ConfiguredSubagentEntry {
  readonly type: "subagent";
  readonly name: string;
  readonly source: string;
  readonly lockEntry: Option.Option<SubagentLockEntry>;
}

interface ConfiguredMcpServerEntry {
  readonly type: "mcp-server";
  readonly name: string;
  readonly source: string;
  readonly lockEntry: Option.Option<McpServerLockEntry>;
}

interface ConfiguredPackEntry {
  readonly type: "pack";
  readonly name: string;
  readonly source: string;
  readonly lockEntry: Option.Option<ExtensionPackLockEntry>;
}

type ConfiguredExtensionEntry =
  | ConfiguredCommandEntry
  | ConfiguredSubagentEntry
  | ConfiguredMcpServerEntry
  | ConfiguredPackEntry;

interface ResolvedConfiguredExtension {
  readonly _tag: "resolved";
  readonly type: NonSkillDoctorExtensionType;
  readonly name: string;
  readonly source: string;
  readonly canonicalPath: string;
}

interface InvalidConfiguredExtension {
  readonly _tag: "invalid";
  readonly type: NonSkillDoctorExtensionType;
  readonly name: string;
  readonly source: string;
}

type ConfiguredExtensionResolution = ResolvedConfiguredExtension | InvalidConfiguredExtension;

const DECLARATION_RESOLUTION_TIMEOUT = "2 seconds";

const lockfileSubject = `lockfile:${LOCKFILE_NAME}`;

const extensionSubject = (type: DoctorExtensionType, name: string) => `${type}:${name}`;

const skillSubject = (name: string) => extensionSubject("skill", name);

const agentSubject = (agentId: string) => `agent:${agentId}`;

const sortByName = <T extends { readonly name: string }>(items: ReadonlyArray<T>): T[] =>
  [...items].sort((left, right) => left.name.localeCompare(right.name));

const getAgentIssueReason = (issue: WorkspaceSkillAgentIssue): string => {
  switch (issue._tag) {
    case "unknown-agent":
      return "unknown agent";
    case "misconfigured-agent":
      return issue.reason;
  }
};

const summarizeDiagnostics = (
  diagnostics: ReadonlyArray<WorkspaceDoctorDiagnostic>,
): WorkspaceDoctorDiagnosis => ({
  diagnostics,
  warned: diagnostics.filter((diagnostic) => diagnostic.severity === "warn").length,
  failed: diagnostics.filter((diagnostic) => diagnostic.severity === "fail").length,
  canSync: diagnostics.every((diagnostic) => !blockingDiagnosticCodes.has(diagnostic.code)),
});

const unresolvedSkillMessage = (skill: WorkspaceUnresolvedSkill) => {
  switch (skill.reason._tag) {
    case "multiple-matches":
      return `The source "${skill.source}" matches more than one skill.`;
    case "timeout":
      return `Timed out while checking "${skill.source}".`;
    case "skill-not-found":
      return `No installable skill named "${skill.name}" was found at "${skill.source}".`;
    case "resolution-failed":
      return `Could not determine an installable skill from "${skill.source}": ${skill.reason.message}`;
  }
};

const unresolvedSkillHint = (skill: WorkspaceUnresolvedSkill) => {
  switch (skill.reason._tag) {
    case "multiple-matches":
      return `Narrow the source for "${skill.name}" in settings.json so it identifies exactly one skill.`;
    case "timeout":
      return `Check that "${skill.source}" is reachable, then run \`axm doctor\` again.`;
    case "skill-not-found":
    case "resolution-failed":
      return `Check that "${skill.source}" points to the correct skill, or remove "${skill.name}" from settings.json.`;
  }
};

const invalidEntryMessage = (type: NonSkillDoctorExtensionType, name: string) =>
  `The ${extensionTypeSentenceLabels[type]} entry "${name}" is invalid.`;

const invalidEntryHint = (type: NonSkillDoctorExtensionType) =>
  `Use a name like "@owner/${toInstallableExtensionTypePlural(type)}/name".`;

const lockfileDiagnostic = (
  code: LockfileCode,
  message: string,
  hint: string,
): WorkspaceDoctorDiagnostic => ({
  code,
  severity: "fail",
  subject: lockfileSubject,
  message,
  hint,
});

const missingInstallMessage = (type: DoctorExtensionType) =>
  `The ${extensionTypeSentenceLabels[type]} is declared in settings.json but not installed in the workspace.`;

const missingInstallHint = (name: string) => `Run \`axm install\` to install "${name}".`;

const resolvedConfiguredExtension = (
  entry: ConfiguredExtensionEntry,
  canonicalPath: string,
): ResolvedConfiguredExtension => ({
  _tag: "resolved",
  type: entry.type,
  name: entry.name,
  source: entry.source,
  canonicalPath,
});

const invalidConfiguredExtension = (
  entry: ConfiguredExtensionEntry,
): InvalidConfiguredExtension => ({
  _tag: "invalid",
  type: entry.type,
  name: entry.name,
  source: entry.source,
});

const isInvalidConfiguredExtension = (
  resolution: ConfiguredExtensionResolution,
): resolution is InvalidConfiguredExtension => resolution._tag === "invalid";

const buildUnresolvedSkillDiagnostics = (
  skills: ReadonlyArray<WorkspaceSkillState>,
): ReadonlyArray<WorkspaceDoctorDiagnostic> =>
  sortByName(
    skills.filter((skill): skill is WorkspaceUnresolvedSkill => skill._tag === "unresolved"),
  ).map((skill) => ({
    code: sourceUnresolvableCodeByType.skill,
    severity: "fail",
    subject: skillSubject(skill.name),
    message: unresolvedSkillMessage(skill),
    hint: unresolvedSkillHint(skill),
  }));

const buildMissingInstallDiagnostics = (
  skills: ReadonlyArray<WorkspaceSkillState>,
): ReadonlyArray<WorkspaceDoctorDiagnostic> =>
  sortByName(
    skills.filter(
      (skill): skill is WorkspaceResolvedSkill =>
        isResolvedWorkspaceSkill(skill) && !skill.installed,
    ),
  ).map((skill) => ({
    code: notInstalledCodeByType.skill,
    severity: "fail",
    subject: skillSubject(skill.name),
    message: missingInstallMessage("skill"),
    hint: missingInstallHint(skill.name),
  }));

export const isWorkspaceDoctorSyncBlockingDiagnostic = (
  diagnostic: WorkspaceDoctorDiagnostic,
): boolean => blockingDiagnosticCodes.has(diagnostic.code);

const buildAgentConfigurationDiagnostics = (
  skills: ReadonlyArray<WorkspaceSkillState>,
  agentSnapshot: WorkspaceSkillAgentSnapshot,
): ReadonlyArray<WorkspaceDoctorDiagnostic> => {
  if (skills.length === 0) {
    return [];
  }

  return [...agentSnapshot.issues]
    .sort((left, right) => left.agentId.localeCompare(right.agentId))
    .map((issue) => {
      return {
        code: "AGENT_CONFIGURATION_ISSUE",
        severity: "warn",
        subject: agentSubject(issue.agentId),
        message: `Configured agent skills directory could not be checked (${getAgentIssueReason(issue)}).`,
        hint: "Fix the configured agent setup or remove unsupported agents from settings.json.",
      } satisfies WorkspaceDoctorDiagnostic;
    });
};

const buildEnablementDiagnostics = (
  skills: ReadonlyArray<WorkspaceSkillState>,
  agentSnapshot: WorkspaceSkillAgentSnapshot,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<ReadonlyArray<WorkspaceDoctorDiagnostic>, never> =>
  Effect.gen(function* () {
    if (skills.length === 0 || agentSnapshot.supportedDirs.length === 0) {
      return [];
    }

    const installedSkills = sortByName(
      skills.filter(
        (skill): skill is WorkspaceResolvedSkill =>
          isResolvedWorkspaceSkill(skill) && skill.installed,
      ),
    );

    const diagnostics = yield* Effect.forEach(
      installedSkills,
      (skill) => {
        const artifactName = sanitizeName(skill.ref.skill.name);
        return Effect.forEach(
          agentSnapshot.supportedDirs,
          ({ agentId, dir }) =>
            fs.exists(path.join(dir, artifactName)).pipe(
              Effect.orElseSucceed(() => false),
              Effect.map((exists) => {
                if (skill.enabled && !exists) {
                  return {
                    code: "SKILL_ENABLEMENT_MISMATCH",
                    severity: "fail",
                    subject: `${skillSubject(skill.name)}@${agentId}`,
                    message: `The enabled skill is missing from agent "${agentId}".`,
                    hint: `Run \`axm sync\` to reconcile "${skill.name}" for "${agentId}".`,
                  } satisfies WorkspaceDoctorDiagnostic;
                }

                if (!skill.enabled && exists) {
                  return {
                    code: "SKILL_ENABLEMENT_MISMATCH",
                    severity: "fail",
                    subject: `${skillSubject(skill.name)}@${agentId}`,
                    message: `The disabled skill is still present in agent "${agentId}".`,
                    hint: `Run \`axm sync\` to reconcile "${skill.name}" for "${agentId}".`,
                  } satisfies WorkspaceDoctorDiagnostic;
                }

                return undefined;
              }),
            ),
          { concurrency: "unbounded" },
        ).pipe(
          Effect.map((maybeDiagnostics) =>
            maybeDiagnostics.flatMap((diagnostic) =>
              diagnostic === undefined ? [] : [diagnostic],
            ),
          ),
        );
      },
      { concurrency: "unbounded" },
    ).pipe(Effect.map(Array.flatten));

    return diagnostics;
  });

interface ConfiguredExtensionLockEntries {
  readonly commands: CommandsLockMap;
  readonly subagents: SubagentsLockMap;
  readonly mcpServers: McpServersLockMap;
  readonly packs: ExtensionPacksLockMap;
}

const emptyConfiguredExtensionLockEntries: ConfiguredExtensionLockEntries = {
  commands: {},
  subagents: {},
  mcpServers: {},
  packs: {},
};

const readWorkspaceSettings = (workspacePath: string, fs: FileSystem.FileSystem, path: Path.Path) =>
  readSettings(workspacePath).pipe(
    Effect.map(Option.getOrElse(() => createDefaultSettings())),
    Effect.provideService(Path.Path, path),
    Effect.provideService(FileSystem.FileSystem, fs),
  );

const buildLockfileDiagnostics = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const state = yield* ws.getLockfileState();

    switch (state) {
      case "ok":
        return { state, diagnostics: [] } as const;
      case "missing":
        return {
          state,
          diagnostics: [
            lockfileDiagnostic(
              "LOCKFILE_MISSING",
              `${LOCKFILE_NAME} is missing.`,
              "Run `axm sync` to recreate it.",
            ),
          ],
        } as const;
      case "invalid":
        return {
          state,
          diagnostics: [
            lockfileDiagnostic(
              "LOCKFILE_INVALID",
              `${LOCKFILE_NAME} is invalid.`,
              "Run `axm sync` to rebuild it.",
            ),
          ],
        } as const;
    }
  });

const refName = (ref: ExtensionRef): string => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "command":
      return ref.command.name;
    case "subagent":
      return ref.subagent.name;
    case "mcp-server":
      return ref.server.name;
    case "pack":
      return ref.pack.name;
  }
};

const validateConfiguredRegistryRef = <TRef extends ExtensionRef>(args: {
  readonly type: NonSkillDoctorExtensionType;
  readonly source: string;
  readonly parsed: RegistrySourceRefParts;
  readonly match: (ref: ExtensionRef) => ref is TRef;
}) =>
  Effect.gen(function* () {
    const providers = yield* SourceHostProviders;
    const sourceRef = yield* resolveSource(args.source).pipe(Effect.mapError(() => "invalid"));
    const refs = yield* providers
      .find(sourceRef, {
        skillNames: [args.parsed.name],
        type: args.type,
        owner: Option.some(args.parsed.owner),
        versionConstraint: Option.fromUndefinedOr(args.parsed.versionConstraint),
      })
      .pipe(
        Effect.scoped,
        Effect.map((resolvedRefs) => resolvedRefs.filter(args.match)),
        Effect.mapError(() => "invalid"),
      );

    const exactMatches = refs.filter((ref) => refName(ref) === args.parsed.name);
    if (exactMatches.length === 1) {
      return true;
    }

    return yield* Effect.fail("invalid");
  }).pipe(
    Effect.timeoutOrElse({
      duration: DECLARATION_RESOLUTION_TIMEOUT,
      orElse: () => Effect.fail("invalid"),
    }),
  );

const matchesParsedCommandLockEntry = (
  parsed: RegistrySourceRefParts,
  lockEntry: CommandLockEntry,
): boolean =>
  lockEntry.type === "registry" &&
  lockEntry.owner === parsed.owner &&
  lockEntry.name === parsed.name;

const matchesParsedSubagentLockEntry = (
  parsed: RegistrySourceRefParts,
  lockEntry: SubagentLockEntry,
): boolean =>
  lockEntry.type === "registry" &&
  lockEntry.owner === parsed.owner &&
  lockEntry.name === parsed.name;

const matchesParsedMcpServerLockEntry = (
  parsed: RegistrySourceRefParts,
  lockEntry: McpServerLockEntry,
): boolean =>
  lockEntry.type === "registry" &&
  lockEntry.owner === parsed.owner &&
  lockEntry.name === parsed.name;

const matchesParsedPackLockEntry = (
  parsed: RegistrySourceRefParts,
  lockEntry: ExtensionPackLockEntry,
): boolean =>
  lockEntry.type === "registry" &&
  lockEntry.owner === parsed.owner &&
  lockEntry.name === parsed.name;

const commandCanonicalPathFromParsed = (
  baseDir: string,
  path: Path.Path,
  parsed: RegistrySourceRefParts,
): string => path.join(baseDir, REGISTRY_EXTENSIONS_DIR, parsed.owner, "commands", parsed.name);

const commandCanonicalPathFromLockEntry = (
  baseDir: string,
  path: Path.Path,
  name: string,
  lockEntry: CommandLockEntry,
): string =>
  lockEntry.type === "registry"
    ? path.join(baseDir, REGISTRY_EXTENSIONS_DIR, lockEntry.owner, "commands", lockEntry.name)
    : path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, "commands", name);

const subagentCanonicalPathFromParsed = (
  baseDir: string,
  path: Path.Path,
  parsed: RegistrySourceRefParts,
): string =>
  computeSubagentPaths(
    path.join,
    baseDir,
    { refType: "registry", owner: parsed.owner },
    sanitizeName(parsed.name),
  ).canonicalPath;

const subagentCanonicalPathFromLockEntry = (
  baseDir: string,
  path: Path.Path,
  name: string,
  lockEntry: SubagentLockEntry,
): string =>
  computeSubagentPaths(
    path.join,
    baseDir,
    lockEntry.type === "registry"
      ? { refType: "registry", owner: lockEntry.owner }
      : {
          refType: lockEntry.type === "local" ? "local" : "git-hosted",
        },
    sanitizeName(name),
  ).canonicalPath;

const mcpServerCanonicalPathFromParsed = (
  baseDir: string,
  path: Path.Path,
  parsed: RegistrySourceRefParts,
): Option.Option<string> =>
  Option.some(
    path.join(baseDir, REGISTRY_EXTENSIONS_DIR, parsed.owner, "mcp-servers", parsed.name),
  );

const mcpServerCanonicalPathFromLockEntry = (
  baseDir: string,
  path: Path.Path,
  lockEntry: McpServerLockEntry,
): Option.Option<string> =>
  lockEntry.type === "registry"
    ? Option.some(
        path.join(baseDir, REGISTRY_EXTENSIONS_DIR, lockEntry.owner, "mcp-servers", lockEntry.name),
      )
    : Option.none();

const packCanonicalPathFromParsed = (
  baseDir: string,
  path: Path.Path,
  parsed: RegistrySourceRefParts,
): string => computeExtensionPackPaths(path.join, baseDir, parsed.owner, parsed.name).canonicalPath;

const packCanonicalPathFromLockEntry = (
  baseDir: string,
  path: Path.Path,
  lockEntry: ExtensionPackLockEntry,
): string =>
  computeExtensionPackPaths(path.join, baseDir, lockEntry.owner, lockEntry.name).canonicalPath;

const resolveConfiguredExtension = (
  entry: ConfiguredExtensionEntry,
  baseDir: string,
  path: Path.Path,
) => {
  const parsed = parseRegistrySourceRef(entry.source);

  if (
    parsed === undefined ||
    parsed.type !== toInstallableExtensionTypePlural(entry.type) ||
    parsed.name !== entry.name
  ) {
    return Effect.succeed(invalidConfiguredExtension(entry));
  }

  switch (entry.type) {
    case "command":
      return validateConfiguredRegistryRef({
        type: "command",
        source: entry.source,
        parsed,
        match: (ref): ref is CommandExtensionRef => ref.type === "command",
      }).pipe(
        Effect.map(() =>
          resolvedConfiguredExtension(entry, commandCanonicalPathFromParsed(baseDir, path, parsed)),
        ),
        Effect.catch(() =>
          Effect.succeed(
            Option.match(entry.lockEntry, {
              onNone: () => invalidConfiguredExtension(entry),
              onSome: (lockEntry) =>
                matchesParsedCommandLockEntry(parsed, lockEntry)
                  ? resolvedConfiguredExtension(
                      entry,
                      commandCanonicalPathFromLockEntry(baseDir, path, entry.name, lockEntry),
                    )
                  : invalidConfiguredExtension(entry),
            }),
          ),
        ),
      );
    case "subagent":
      return validateConfiguredRegistryRef({
        type: "subagent",
        source: entry.source,
        parsed,
        match: (ref): ref is SubagentExtensionRef => ref.type === "subagent",
      }).pipe(
        Effect.map(() =>
          resolvedConfiguredExtension(
            entry,
            subagentCanonicalPathFromParsed(baseDir, path, parsed),
          ),
        ),
        Effect.catch(() =>
          Effect.succeed(
            Option.match(entry.lockEntry, {
              onNone: () => invalidConfiguredExtension(entry),
              onSome: (lockEntry) =>
                matchesParsedSubagentLockEntry(parsed, lockEntry)
                  ? resolvedConfiguredExtension(
                      entry,
                      subagentCanonicalPathFromLockEntry(baseDir, path, entry.name, lockEntry),
                    )
                  : invalidConfiguredExtension(entry),
            }),
          ),
        ),
      );
    case "mcp-server":
      return validateConfiguredRegistryRef({
        type: "mcp-server",
        source: entry.source,
        parsed,
        match: (ref): ref is McpServerExtensionRef => ref.type === "mcp-server",
      }).pipe(
        Effect.map(() =>
          Option.match(mcpServerCanonicalPathFromParsed(baseDir, path, parsed), {
            onNone: () => invalidConfiguredExtension(entry),
            onSome: (canonicalPath) => resolvedConfiguredExtension(entry, canonicalPath),
          }),
        ),
        Effect.catch(() =>
          Effect.succeed(
            Option.match(entry.lockEntry, {
              onNone: () => invalidConfiguredExtension(entry),
              onSome: (lockEntry) =>
                Option.match(mcpServerCanonicalPathFromLockEntry(baseDir, path, lockEntry), {
                  onNone: () => invalidConfiguredExtension(entry),
                  onSome: (canonicalPath) =>
                    matchesParsedMcpServerLockEntry(parsed, lockEntry)
                      ? resolvedConfiguredExtension(entry, canonicalPath)
                      : invalidConfiguredExtension(entry),
                }),
            }),
          ),
        ),
      );
    case "pack":
      return validateConfiguredRegistryRef({
        type: "pack",
        source: entry.source,
        parsed,
        match: (ref): ref is ExtensionPackRef => ref.type === "pack",
      }).pipe(
        Effect.map(() =>
          resolvedConfiguredExtension(entry, packCanonicalPathFromParsed(baseDir, path, parsed)),
        ),
        Effect.catch(() =>
          Effect.succeed(
            Option.match(entry.lockEntry, {
              onNone: () => invalidConfiguredExtension(entry),
              onSome: (lockEntry) =>
                matchesParsedPackLockEntry(parsed, lockEntry)
                  ? resolvedConfiguredExtension(
                      entry,
                      packCanonicalPathFromLockEntry(baseDir, path, lockEntry),
                    )
                  : invalidConfiguredExtension(entry),
            }),
          ),
        ),
      );
  }
};

const buildConfiguredExtensionDiagnostics = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  lockfileState: "ok" | "missing" | "invalid",
) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const settings = yield* readWorkspaceSettings(ws.path, fs, path);
    const locked =
      lockfileState === "ok"
        ? yield* Effect.all(
            {
              commands: ws.getLockedCommands(),
              subagents: ws.getLockedSubagents(),
              mcpServers: ws.getLockedMcpServers(),
              packs: ws.getLockedExtensionPacks(),
            },
            { concurrency: "unbounded" },
          )
        : emptyConfiguredExtensionLockEntries;

    const entries: ReadonlyArray<ConfiguredExtensionEntry> = [
      ...Object.entries(settings.commands ?? {}).map(([name, entry]) => ({
        type: "command" as const,
        name,
        source: normalizeCommandEntry(entry).source,
        lockEntry: Option.fromUndefinedOr(locked.commands[name]),
      })),
      ...Object.entries(settings.subagents ?? {}).map(([name, entry]) => ({
        type: "subagent" as const,
        name,
        source: normalizeSubagentEntry(entry).source,
        lockEntry: Option.fromUndefinedOr(locked.subagents[name]),
      })),
      ...Object.entries(settings.mcpServers ?? {}).map(([name, entry]) => ({
        type: "mcp-server" as const,
        name,
        source: typeof entry === "string" ? entry : entry.source,
        lockEntry: Option.fromUndefinedOr(locked.mcpServers[name]),
      })),
      ...Object.entries(settings.packs ?? {}).map(([name, entry]) => ({
        type: "pack" as const,
        name,
        source: typeof entry === "string" ? entry : entry.source,
        lockEntry: Option.fromUndefinedOr(locked.packs[name]),
      })),
    ];

    const diagnostics = yield* Effect.forEach(
      sortByName(entries),
      (entry) =>
        Effect.gen(function* () {
          const resolved = yield* resolveConfiguredExtension(entry, ws.baseDir, path);

          if (isInvalidConfiguredExtension(resolved)) {
            return [
              {
                code: invalidEntryCodeByType[entry.type],
                severity: "fail",
                subject: extensionSubject(entry.type, entry.name),
                message: invalidEntryMessage(entry.type, entry.name),
                hint: invalidEntryHint(entry.type),
              } satisfies WorkspaceDoctorDiagnostic,
            ];
          }

          const installed = yield* fs
            .exists(resolved.canonicalPath)
            .pipe(Effect.orElseSucceed(() => false));

          if (installed) {
            return [];
          }

          return [
            {
              code: notInstalledCodeByType[entry.type],
              severity: "fail",
              subject: extensionSubject(entry.type, entry.name),
              message: missingInstallMessage(entry.type),
              hint: missingInstallHint(entry.name),
            } satisfies WorkspaceDoctorDiagnostic,
          ];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map(Array.flatten));

    return diagnostics;
  });

export const diagnoseWorkspaceDoctor = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lockfile = yield* buildLockfileDiagnostics();
    const skillSnapshot = yield* buildWorkspaceSkillSnapshot();

    const lockfileDiagnostics = lockfile.diagnostics;
    const unresolvedDiagnostics = buildUnresolvedSkillDiagnostics(skillSnapshot.skills);
    const missingInstallDiagnostics = buildMissingInstallDiagnostics(skillSnapshot.skills);
    const nonSkillDiagnostics = yield* buildConfiguredExtensionDiagnostics(
      fs,
      path,
      lockfile.state,
    );
    const enablementDiagnostics = yield* buildEnablementDiagnostics(
      skillSnapshot.skills,
      skillSnapshot.agents,
      fs,
      path,
    );
    const agentDiagnostics = buildAgentConfigurationDiagnostics(
      skillSnapshot.skills,
      skillSnapshot.agents,
    );

    return summarizeDiagnostics([
      ...lockfileDiagnostics,
      ...unresolvedDiagnostics,
      ...missingInstallDiagnostics,
      ...nonSkillDiagnostics,
      ...enablementDiagnostics,
      ...agentDiagnostics,
    ]);
  });
