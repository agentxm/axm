import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  extensionTypeSentenceLabels,
  parseRegistrySourceRef,
  toInstallableExtensionTypePlural,
  type InstallableExtensionType,
} from "../../../extensions/index.js";
import type {
  CommandLockEntry,
  CommandsLockMap,
  ExtensionPackLockEntry,
  ExtensionPacksLockMap,
  McpServerLockEntry,
  McpServersLockMap,
  SkillLockEntry,
  SkillsLockMap,
  SubagentLockEntry,
  SubagentsLockMap,
} from "../../../lockfile/index.js";
import { readSettingsOrDefault, type Settings } from "../../../settings/index.js";
import { computeSkillSourceHash } from "../../../skills/operations/install.js";
import { satisfiesConstraint } from "../../../version-constraints/version-constraints.js";
import { Workspace, type WorkspaceContextService } from "../../service-interface.js";
import {
  detectLockfileBlockers,
  detectSettingsEntryBlockers,
  type LockfileBlocker,
  type LockfileBlockerReason,
  type SettingsEntryBlocker,
  type SettingsEntryBlockerReason,
} from "../../settings-validation/index.js";
import { defineCheck, type DiagnosticDef } from "../check-def.js";
import { CHECK_IDS, type Action, type Finding } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemberType = Exclude<InstallableExtensionType, "pack">;

interface DeclaredEntry {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly source: string;
}

interface LockState {
  readonly skills: SkillsLockMap;
  readonly commands: CommandsLockMap;
  readonly subagents: SubagentsLockMap;
  readonly mcpServers: McpServersLockMap;
  readonly packs: ExtensionPacksLockMap;
}

interface Accumulated {
  readonly findings: ReadonlyArray<Finding>;
  readonly blocked: ReadonlySet<string>;
}

interface ExtensionsInstalledContext {
  readonly findings: ReadonlyArray<Finding>;
}

// ---------------------------------------------------------------------------
// Type-to-key mappings
// ---------------------------------------------------------------------------

const MEMBER_TYPES = [
  "skill",
  "command",
  "subagent",
  "mcp-server",
] as const satisfies ReadonlyArray<MemberType>;

const MEMBER_LOCK_KEYS = {
  skill: "skills",
  command: "commands",
  subagent: "subagents",
  "mcp-server": "mcpServers",
} as const satisfies Record<MemberType, keyof Omit<LockState, "packs">>;

const PACK_RESOLVED_KEYS = {
  skill: "resolvedSkills",
  command: "resolvedCommands",
  subagent: "resolvedSubagents",
  "mcp-server": "resolvedMcpServers",
} as const satisfies Record<
  MemberType,
  "resolvedSkills" | "resolvedCommands" | "resolvedSubagents" | "resolvedMcpServers"
>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_LOCK_STATE: LockState = {
  skills: {},
  commands: {},
  subagents: {},
  mcpServers: {},
  packs: {},
};

const EDIT_SETTINGS_ACTION: Action = {
  label: "Edit settings.json",
  description: "Fix the extension declaration and rerun doctor",
};

const SYNC_ACTION: Action = {
  label: "Run axm sync",
  description: "Reconcile installed extensions with the workspace state",
  command: "axm sync",
};

const CHECK_SOURCE_ACTION: Action = {
  label: "Check source configuration",
  description: "Resolve the extension source and rerun doctor",
};

const SETTINGS_REASON_SUFFIXES: Record<SettingsEntryBlockerReason, string> = {
  "entry-malformed": "declaration-invalid-source",
  "source-not-found": "declaration-source-not-found",
  "source-multiple-matches": "declaration-source-ambiguous",
  "source-resolution-failed": "declaration-source-resolution-failed",
  "source-timeout": "declaration-source-timeout",
};

const SETTINGS_REASON_ACTIONS: Record<SettingsEntryBlockerReason, Action> = {
  "entry-malformed": EDIT_SETTINGS_ACTION,
  "source-not-found": EDIT_SETTINGS_ACTION,
  "source-multiple-matches": EDIT_SETTINGS_ACTION,
  "source-resolution-failed": CHECK_SOURCE_ACTION,
  "source-timeout": CHECK_SOURCE_ACTION,
};

const lockfileReasonSeverity = (reason: LockfileBlockerReason): "warn" | "error" =>
  reason === "lockfile-entry-orphaned" ? "warn" : "error";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const sortEntries = <T extends { readonly type: string; readonly name: string }>(
  items: ReadonlyArray<T>,
): ReadonlyArray<T> =>
  [...items].sort((left, right) =>
    left.type === right.type
      ? left.name.localeCompare(right.name)
      : left.type.localeCompare(right.type),
  );

const subjectRef = (entry: Pick<DeclaredEntry, "type" | "name">): string =>
  `${entry.type}:${entry.name}`;

const declaredEntryFromSubjectRef = (ref: string): DeclaredEntry | undefined => {
  const [type, name] = ref.split(":");
  if (name === undefined) return undefined;
  if (
    type === "skill" ||
    type === "command" ||
    type === "subagent" ||
    type === "mcp-server" ||
    type === "pack"
  ) {
    return { type, name, source: "" };
  }
  return undefined;
};

const makeFinding = (args: {
  readonly suffix: string;
  readonly severity: "info" | "warn" | "error";
  readonly message: string;
  readonly subject?: {
    readonly kind: "extension" | "agent" | "file" | "workspace";
    readonly ref: string;
  };
  readonly details?: string;
  readonly action?: Action;
}): Finding => ({
  id: `${CHECK_IDS.extensionsInstalled}.${args.suffix}`,
  severity: args.severity,
  message: args.message,
  ...(args.subject === undefined ? {} : { subject: args.subject }),
  ...(args.details === undefined ? {} : { details: args.details }),
  ...(args.action === undefined ? {} : { action: args.action }),
});

const accumulateFindings = (acc: Accumulated, findings: ReadonlyArray<Finding>): Accumulated => ({
  findings: [...acc.findings, ...findings],
  blocked: new Set([
    ...acc.blocked,
    ...findings.flatMap((f) =>
      f.severity === "error" && f.subject !== undefined ? [f.subject.ref] : [],
    ),
  ]),
});

// ---------------------------------------------------------------------------
// Source validation
// ---------------------------------------------------------------------------

const isBareNameSource = (source: string): boolean =>
  /^[a-z0-9][a-z0-9-]*(?:@[^\s/:]+)?$/i.test(source);

const isClearlyNonRegistrySource = (source: string): boolean =>
  source.startsWith("./") ||
  source.startsWith("../") ||
  source.startsWith("/") ||
  source.startsWith("file://") ||
  source.includes("://") ||
  /^[a-z][a-z0-9+.-]*:/i.test(source);

const disallowsNonRegistrySource = (type: InstallableExtensionType): boolean =>
  type === "command" || type === "mcp-server" || type === "pack";

// ---------------------------------------------------------------------------
// Declared entries
// ---------------------------------------------------------------------------

const buildDeclaredEntries = (settings: Settings): ReadonlyArray<DeclaredEntry> =>
  sortEntries([
    ...Object.entries(settings.skills ?? {}).map(([name, entry]) => ({
      type: "skill" as const,
      name,
      source: entry.source,
    })),
    ...Object.entries(settings.commands ?? {}).map(([name, entry]) => ({
      type: "command" as const,
      name,
      source: entry.source,
    })),
    ...Object.entries(settings.subagents ?? {}).map(([name, entry]) => ({
      type: "subagent" as const,
      name,
      source: entry.source,
    })),
    ...Object.entries(settings.mcpServers ?? {}).map(([name, entry]) => ({
      type: "mcp-server" as const,
      name,
      source: entry.source,
    })),
    ...Object.entries(settings.packs ?? {}).map(([name, entry]) => ({
      type: "pack" as const,
      name,
      source: entry.source,
    })),
  ]);

// ---------------------------------------------------------------------------
// Lock state helpers
// ---------------------------------------------------------------------------

const lockfileMaps = (ws: WorkspaceContextService) =>
  Effect.all(
    {
      skills: ws.getLockedSkills().pipe(Effect.orElseSucceed((): SkillsLockMap => ({}))),
      commands: ws.getLockedCommands().pipe(Effect.orElseSucceed((): CommandsLockMap => ({}))),
      subagents: ws.getLockedSubagents().pipe(Effect.orElseSucceed((): SubagentsLockMap => ({}))),
      mcpServers: ws
        .getLockedMcpServers()
        .pipe(Effect.orElseSucceed((): McpServersLockMap => ({}))),
      packs: ws
        .getLockedExtensionPacks()
        .pipe(Effect.orElseSucceed((): ExtensionPacksLockMap => ({}))),
    },
    { concurrency: "unbounded" },
  );

const lockEntryForDeclared = (
  locks: LockState,
  entry: DeclaredEntry,
):
  | SkillLockEntry
  | CommandLockEntry
  | SubagentLockEntry
  | McpServerLockEntry
  | ExtensionPackLockEntry
  | undefined =>
  entry.type === "pack" ? locks.packs[entry.name] : locks[MEMBER_LOCK_KEYS[entry.type]][entry.name];

const retainedByPackForSubject = (locks: LockState, ref: string): boolean => {
  const parsed = declaredEntryFromSubjectRef(ref);
  if (parsed === undefined || parsed.type === "pack") return false;
  return locks[MEMBER_LOCK_KEYS[parsed.type]][parsed.name]?.retainedByPack === true;
};

// ---------------------------------------------------------------------------
// FQN helpers
// ---------------------------------------------------------------------------

const registryFqnFromDeclared = (entry: DeclaredEntry): string | undefined => {
  const parsed = parseRegistrySourceRef(entry.source);
  return parsed === undefined ? undefined : `${parsed.owner}/${parsed.type}/${parsed.name}`;
};

const registryFqnFromLockEntry = (
  type: MemberType,
  name: string,
  entry: SkillLockEntry | CommandLockEntry | SubagentLockEntry | McpServerLockEntry,
): string | undefined => {
  if (entry.type === "registry") {
    return `${entry.owner}/${toInstallableExtensionTypePlural(type)}/${entry.name}`;
  }
  return name.startsWith("@") ? name : undefined;
};

const declaredFqnSet = (entries: ReadonlyArray<DeclaredEntry>): ReadonlySet<string> =>
  new Set(
    entries.flatMap((entry) => {
      const fqn = registryFqnFromDeclared(entry);
      return fqn === undefined ? [] : [fqn];
    }),
  );

const allLockFqns = (locks: LockState): ReadonlySet<string> =>
  new Set(
    MEMBER_TYPES.flatMap((memberType) =>
      Object.entries(locks[MEMBER_LOCK_KEYS[memberType]]).flatMap(([name, entry]) => {
        const fqn = registryFqnFromLockEntry(memberType, name, entry);
        return fqn === undefined ? [] : [fqn];
      }),
    ),
  );

const allPackRetainedFqns = (locks: LockState): ReadonlySet<string> =>
  new Set(
    MEMBER_TYPES.flatMap((memberType) =>
      Object.values(locks.packs).flatMap((packEntry) =>
        Object.keys(packEntry[PACK_RESOLVED_KEYS[memberType]]),
      ),
    ),
  );

// ---------------------------------------------------------------------------
// Finding builders
// ---------------------------------------------------------------------------

const perEntryFinding = (entry: DeclaredEntry): Finding | undefined => {
  const ref = subjectRef(entry);

  if (!entry.source.startsWith("@") && isBareNameSource(entry.source)) {
    return makeFinding({
      suffix: "declaration-bare-name",
      severity: "error",
      message: `The ${extensionTypeSentenceLabels[entry.type]} "${entry.name}" uses a bare source.`,
      subject: { kind: "extension", ref },
      details: entry.source,
      action: EDIT_SETTINGS_ACTION,
    });
  }

  if (disallowsNonRegistrySource(entry.type) && isClearlyNonRegistrySource(entry.source)) {
    return makeFinding({
      suffix: "declaration-non-registry-source",
      severity: "error",
      message: `The ${extensionTypeSentenceLabels[entry.type]} "${entry.name}" must use a registry source.`,
      subject: { kind: "extension", ref },
      details: entry.source,
      action: EDIT_SETTINGS_ACTION,
    });
  }

  return undefined;
};

const registryGroupKey = (entry: DeclaredEntry): string | undefined => {
  const parsed = parseRegistrySourceRef(entry.source);
  return parsed === undefined
    ? undefined
    : `${entry.type}:${parsed.owner}/${parsed.type}/${parsed.name}`;
};

const buildDeclarationFindings = (
  declaredEntries: ReadonlyArray<DeclaredEntry>,
): {
  readonly findings: ReadonlyArray<Finding>;
  readonly blockedSubjects: ReadonlySet<string>;
} => {
  const entryFindings = declaredEntries.flatMap((entry) => {
    const finding = perEntryFinding(entry);
    return finding === undefined ? [] : [finding];
  });
  const earlyBlocked = new Set(
    entryFindings.flatMap((f) => (f.subject !== undefined ? [f.subject.ref] : [])),
  );

  const groups = new Map<string, Array<DeclaredEntry>>();
  for (const entry of declaredEntries) {
    if (earlyBlocked.has(subjectRef(entry))) continue;
    const key = registryGroupKey(entry);
    if (key === undefined) continue;
    const group = groups.get(key);
    if (group !== undefined) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  const duplicateFindings = [...groups.values()].flatMap((group) => {
    if (group.length < 2) return [];
    const names = group.map((entry) => entry.name).sort();
    return group.map((entry) =>
      makeFinding({
        suffix: "declaration-duplicate",
        severity: "error",
        message: `The ${extensionTypeSentenceLabels[entry.type]} "${entry.name}" is declared more than once.`,
        subject: { kind: "extension", ref: subjectRef(entry) },
        details: names.join(", "),
        action: EDIT_SETTINGS_ACTION,
      }),
    );
  });

  return {
    findings: [...entryFindings, ...duplicateFindings],
    blockedSubjects: new Set([
      ...earlyBlocked,
      ...duplicateFindings.flatMap((f) => (f.subject !== undefined ? [f.subject.ref] : [])),
    ]),
  };
};

const buildVersionUnsatisfiedFindings = (
  declaredEntries: ReadonlyArray<DeclaredEntry>,
  locks: LockState,
  blocked: ReadonlySet<string>,
): ReadonlyArray<Finding> =>
  declaredEntries.flatMap((entry) => {
    const ref = subjectRef(entry);
    if (blocked.has(ref)) return [];

    const parsed = parseRegistrySourceRef(entry.source);
    if (parsed?.versionConstraint === undefined) return [];

    const lockEntry = lockEntryForDeclared(locks, entry);
    if (lockEntry === undefined || lockEntry.type !== "registry") return [];

    if (satisfiesConstraint(lockEntry.resolvedVersion, parsed.versionConstraint)) return [];

    return [
      makeFinding({
        suffix: "version-unsatisfied",
        severity: "error",
        message: `The ${extensionTypeSentenceLabels[entry.type]} "${entry.name}" does not satisfy its declared version constraint.`,
        subject: { kind: "extension", ref },
        details: `Declared ${parsed.versionConstraint}, installed ${lockEntry.resolvedVersion}`,
        action: SYNC_ACTION,
      }),
    ];
  });

const buildIntegrityMismatchFindings = (
  locks: LockState,
  blocked: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<Finding>, never, FileSystem.FileSystem | Path.Path | Workspace> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const ws = yield* Workspace;

    const findings = yield* Effect.forEach(
      Object.entries(locks.skills),
      ([name, entry]) =>
        Effect.gen(function* () {
          const ref = `skill:${name}`;
          if (blocked.has(ref) || entry.sourceHash === undefined || entry.type !== "registry") {
            return [];
          }

          const { canonicalPath } = yield* ws.getSkillDir(entry.name, {
            refType: "registry",
            owner: entry.owner,
          });
          const exists = yield* fs.exists(canonicalPath).pipe(Effect.orElseSucceed(() => false));
          if (!exists) return [];

          const actualHash = yield* computeSkillSourceHash(canonicalPath).pipe(
            Effect.orElseSucceed(() => entry.sourceHash),
          );
          if (actualHash === entry.sourceHash) return [];

          return [
            makeFinding({
              suffix: "integrity-mismatch",
              severity: "error",
              message: `The skill "${name}" does not match its recorded installed contents.`,
              subject: { kind: "extension", ref },
              details: `Expected ${entry.sourceHash}, got ${actualHash}`,
              action: SYNC_ACTION,
            }),
          ];
        }).pipe(
          Effect.catch((): Effect.Effect<ReadonlyArray<Finding>, never> => Effect.succeed([])),
        ),
      { concurrency: "unbounded" },
    );

    return findings.flatMap((entryFindings) => entryFindings);
  });

const buildPackUnknownDependencyFindings = (
  locks: LockState,
  blocked: ReadonlySet<string>,
): ReadonlyArray<Finding> => {
  const knownFqns = allLockFqns(locks);

  return Object.entries(locks.packs).flatMap(([name, packEntry]) => {
    const ref = `pack:${name}`;
    if (blocked.has(ref)) return [];

    return MEMBER_TYPES.flatMap((memberType) =>
      Object.keys(packEntry[PACK_RESOLVED_KEYS[memberType]])
        .filter((fqn) => !knownFqns.has(fqn))
        .map((fqn) =>
          makeFinding({
            suffix: "declaration-pack-unknown-dep",
            severity: "error",
            message: `The extension pack "${name}" references a dependency that is not installed.`,
            subject: { kind: "extension", ref },
            details: fqn,
            action: SYNC_ACTION,
          }),
        ),
    );
  });
};

const buildPackMemberDroppedFindings = (
  declaredEntries: ReadonlyArray<DeclaredEntry>,
  locks: LockState,
  blocked: ReadonlySet<string>,
): ReadonlyArray<Finding> => {
  const directFqns = declaredFqnSet(declaredEntries);
  const retainedFqns = allPackRetainedFqns(locks);

  return MEMBER_TYPES.flatMap((memberType) =>
    Object.entries(locks[MEMBER_LOCK_KEYS[memberType]]).flatMap(([name, entry]) => {
      if (!entry.retainedByPack) return [];
      const ref = `${memberType}:${name}`;
      const fqn = registryFqnFromLockEntry(memberType, name, entry);
      if (fqn === undefined || blocked.has(ref) || directFqns.has(fqn) || retainedFqns.has(fqn)) {
        return [];
      }
      return [
        makeFinding({
          suffix: "pack-member-dropped",
          severity: "warn",
          message: `The ${extensionTypeSentenceLabels[memberType]} "${name}" is still retained from a pack, but no installed pack declares it anymore.`,
          subject: { kind: "extension", ref },
          action: SYNC_ACTION,
        }),
      ];
    }),
  );
};

const mapLockfileBlocker = (blocker: LockfileBlocker): Finding =>
  makeFinding({
    suffix: blocker.reason,
    severity: lockfileReasonSeverity(blocker.reason),
    message: blocker.message,
    subject: blocker.subject,
    action: SYNC_ACTION,
  });

// ---------------------------------------------------------------------------
// Phase helpers (scoped mutation for within-phase deduplication only)
// ---------------------------------------------------------------------------

const buildSettingsPhaseFindings = (
  blockers: ReadonlyArray<SettingsEntryBlocker>,
  locks: LockState,
  blocked: ReadonlySet<string>,
): ReadonlyArray<Finding> => {
  const seen = new Set(blocked);
  return blockers.flatMap((blocker) => {
    if (seen.has(blocker.subject.ref)) return [];
    const entry = declaredEntryFromSubjectRef(blocker.subject.ref);
    if (
      blocker.reason === "source-not-found" &&
      entry !== undefined &&
      lockEntryForDeclared(locks, entry) !== undefined
    ) {
      return [];
    }
    seen.add(blocker.subject.ref);
    return [
      makeFinding({
        suffix: SETTINGS_REASON_SUFFIXES[blocker.reason],
        severity: "error",
        message: blocker.message,
        subject: blocker.subject,
        action: SETTINGS_REASON_ACTIONS[blocker.reason],
      }),
    ];
  });
};

const buildLockfilePhaseFindings = (
  blockers: ReadonlyArray<LockfileBlocker>,
  locks: LockState,
  blocked: ReadonlySet<string>,
): ReadonlyArray<Finding> => {
  const seen = new Set(blocked);
  return blockers.flatMap((blocker) => {
    if (seen.has(blocker.subject.ref)) return [];
    if (
      blocker.reason === "lockfile-entry-orphaned" &&
      retainedByPackForSubject(locks, blocker.subject.ref)
    ) {
      return [];
    }
    const finding = mapLockfileBlocker(blocker);
    if (finding.severity === "error") {
      seen.add(blocker.subject.ref);
    }
    return [finding];
  });
};

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

const prepareContext = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const settings = yield* readSettingsOrDefault(ws.path).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
    const declaredEntries = buildDeclaredEntries(settings);
    const lockfileState = yield* ws
      .getLockfileState()
      .pipe(Effect.orElseSucceed((): "invalid" => "invalid"));
    const locks = lockfileState === "ok" ? yield* lockfileMaps(ws) : EMPTY_LOCK_STATE;
    const settingsBlockers = yield* detectSettingsEntryBlockers();

    const declaration = buildDeclarationFindings(declaredEntries);
    const afterDecl: Accumulated = {
      findings: declaration.findings,
      blocked: declaration.blockedSubjects,
    };

    const settingsFindings = buildSettingsPhaseFindings(settingsBlockers, locks, afterDecl.blocked);
    const afterSettings = accumulateFindings(afterDecl, settingsFindings);

    const relevantEntries = declaredEntries.filter(
      (e) => !afterSettings.blocked.has(subjectRef(e)),
    );
    if (lockfileState !== "ok" && relevantEntries.length > 0) {
      return {
        findings: [
          ...afterSettings.findings,
          makeFinding({
            suffix: lockfileState === "missing" ? "lockfile-missing" : "lockfile-invalid",
            severity: "error",
            message:
              lockfileState === "missing"
                ? "The workspace lockfile is missing."
                : "The workspace lockfile could not be read.",
            subject: { kind: "workspace", ref: ws.path },
            action: SYNC_ACTION,
          }),
        ],
      } satisfies ExtensionsInstalledContext;
    }

    const lockfileBlockers = lockfileState === "ok" ? yield* detectLockfileBlockers() : [];
    const lockfileFindings = buildLockfilePhaseFindings(
      lockfileBlockers,
      locks,
      afterSettings.blocked,
    );
    const afterLockfile = accumulateFindings(afterSettings, lockfileFindings);

    const versionFindings = buildVersionUnsatisfiedFindings(
      declaredEntries,
      locks,
      afterLockfile.blocked,
    );
    const afterVersion = accumulateFindings(afterLockfile, versionFindings);

    const integrityFindings = yield* buildIntegrityMismatchFindings(locks, afterVersion.blocked);
    const afterIntegrity = accumulateFindings(afterVersion, integrityFindings);

    const packDepFindings = buildPackUnknownDependencyFindings(locks, afterIntegrity.blocked);
    const afterPackDeps = accumulateFindings(afterIntegrity, packDepFindings);

    const packDroppedFindings = buildPackMemberDroppedFindings(
      declaredEntries,
      locks,
      afterPackDeps.blocked,
    );

    return {
      findings: [...afterPackDeps.findings, ...packDroppedFindings],
    } satisfies ExtensionsInstalledContext;
  });

const extensionsInstalledDiagnostic: DiagnosticDef<ExtensionsInstalledContext, never> = {
  id: "extensions-installed.findings",
  run: (ctx) => Effect.succeed(ctx.findings),
};

export const extensionsInstalledCheck = defineCheck({
  id: CHECK_IDS.extensionsInstalled,
  title: "Extensions are installed",
  description:
    "Verifies extension declarations, lockfile state, and installed extension contents are consistent.",
  dependsOn: [CHECK_IDS.workspaceReady],
  prepareContext: prepareContext(),
  diagnostics: [extensionsInstalledDiagnostic],
});
