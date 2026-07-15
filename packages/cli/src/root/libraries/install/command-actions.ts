import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import {
  buildInstallOperation,
  buildUninstallOperation,
  formatFqn,
  parseExtensionFqnParts,
  targetFromRef,
  toLabel,
  type ExtensionName,
  type ExtensionType,
  type ExtensionRef,
  type UninstallRetentionPolicy,
} from "@agentxm/client-core/unstable/extensions";
import type {
  LibrariesLockMap,
  RegistryLibraryLockEntry,
  ResolvedExtensionMap,
} from "@agentxm/client-core/unstable/lockfile";
import {
  formatLibraryRef,
  parseLibraryRef,
  type LibraryRefParts,
} from "@agentxm/client-core/unstable/libraries";
import {
  buildRegistryCommandRef,
  CommandManager,
  type CommandExtensionRef,
} from "@agentxm/client-core/unstable/commands";
import {
  FilesManager,
  type FilesExtensionRef,
  type RegistryFilesRef,
} from "@agentxm/client-core/unstable/files";
import {
  buildRegistryHookRef,
  HookManager,
  type HookExtensionRef,
} from "@agentxm/client-core/unstable/hooks";
import {
  buildRegistryMcpServerRef,
  McpServerManager,
  type McpServerExtensionRef,
} from "@agentxm/client-core/unstable/mcps";
import {
  buildRegistryRuleRef,
  RuleManager,
  type RuleExtensionRef,
} from "@agentxm/client-core/unstable/rules";
import {
  buildRegistrySkillRef,
  SkillManager,
  type SkillExtensionRef,
} from "@agentxm/client-core/unstable/skills";
import {
  SubagentManager,
  buildRegistrySubagentRef,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import {
  createRegistryClient,
  parseMinimumReleaseAge,
} from "@agentxm/client-core/unstable/registry";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import type {
  RegistryLibraryDetail,
  RegistryLibraryMember,
  ReleaseAgePolicy,
} from "@agentxm/client-core/unstable/registry";
import type { RegistrySource, RegistrySourceHost } from "@agentxm/client-core/unstable/sources";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  WorkspaceMutations,
  type ExtensionTarget,
  type ExtensionManager,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import type { InstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type { PackageUrlParts } from "@agentxm/client-core/unstable/packaging";
import { decodeVersionSync, type Version } from "@agentxm/client-core/unstable/version-constraints";

import type { InstallLibraryCommandIntent, LiveInstallLibraryCommandIntent } from "./intent.js";

export interface InstallLibraryHandlerArgs {
  readonly source: string;
  readonly unattended?: boolean;
  readonly frozen?: boolean;
}

export interface ParsedLibraryInstallArgs {
  readonly sourceText: string;
  readonly ref: LibraryRefParts;
  readonly unattended: boolean;
  readonly frozen: boolean;
}

export interface LibrarySourceRequest {
  readonly source: RegistrySource;
  readonly sourceName: string;
  readonly sourceText: string;
  readonly ref: LibraryRefParts;
  readonly unattended: boolean;
  readonly frozen: boolean;
  readonly lockedLibrary?: RegistryLibraryLockEntry;
}

type LibraryDiscoveryResult =
  | {
      readonly mode: "live";
      readonly library: RegistryLibraryDetail;
      readonly request: LibrarySourceRequest;
      readonly diagnosticLines?: ReadonlyArray<string>;
    }
  | {
      readonly mode: "frozen";
      readonly lockedLibrary: RegistryLibraryLockEntry;
      readonly request: LibrarySourceRequest;
      readonly diagnosticLines?: ReadonlyArray<string>;
    };

interface ResolvedLibraryMembers {
  readonly refs: ReadonlyArray<ExtensionRef>;
  readonly skippedMessages: ReadonlyArray<string>;
}

type LibraryDependencyTarget = Exclude<ExtensionTarget, { readonly type: "pack" }>;

type LibraryMemberExtensionType = Exclude<ExtensionType, "pack">;

const refName = (ref: ExtensionRef): ExtensionName => {
  switch (ref.type) {
    case "skill":
      return ref.skill.name;
    case "command":
      return ref.command.name;
    case "mcp-server":
      return ref.server.name;
    case "subagent":
      return ref.subagent.name;
    case "files":
      return ref.file.name;
    case "rule":
      return ref.rule.name;
    case "hook":
      return ref.hook.name;
    case "pack":
      return ref.pack.name;
  }
};

const sourceFromHost = (
  host: Pick<RegistrySourceHost, "location">,
  owner: LibraryRefParts["owner"],
): RegistrySource => ({
  type: "registry",
  location: host.location,
  owner: Option.some(owner),
});

const decodeLockedVersion = (fqn: string, version: string) =>
  Effect.try({
    try: () => decodeVersionSync(version),
    catch: (cause) =>
      makeAppError({
        code: "validation",
        detail: `Locked Library member ${fqn} has invalid version "${version}"`,
        recover: "Regenerate the lockfile without --frozen.",
        cause,
      }),
  });

const makeLockedFilesRef = (
  owner: LibraryRefParts["owner"],
  name: ExtensionName,
  version: Version,
  source: RegistrySource,
): RegistryFilesRef => ({
  type: "files",
  refType: "registry",
  file: { name },
  source,
  owner,
  name,
  version,
  integrity: Option.none(),
  packages: [],
});

const lockedRefFromEntry = (
  expectedType: LibraryMemberExtensionType,
  fqn: string,
  versionText: string,
  source: RegistrySource,
) =>
  Effect.gen(function* () {
    const parts = parseExtensionFqnParts(fqn);
    if (parts === undefined || parts.type !== expectedType) {
      return yield* makeAppError({
        code: "validation",
        detail: `Locked Library member "${fqn}" does not match expected ${expectedType} reference`,
        recover: "Regenerate the lockfile without --frozen.",
      });
    }

    const version = yield* decodeLockedVersion(fqn, versionText);
    const packages: ReadonlyArray<PackageUrlParts> = [];
    switch (expectedType) {
      case "skill":
        return buildRegistrySkillRef(parts.owner, parts.name, version, source, packages);
      case "command":
        return buildRegistryCommandRef(parts.owner, parts.name, version, source, packages);
      case "mcp-server":
        return buildRegistryMcpServerRef(parts.owner, parts.name, version, source, packages);
      case "subagent":
        return buildRegistrySubagentRef(parts.owner, parts.name, version, source, packages);
      case "files":
        return makeLockedFilesRef(parts.owner, parts.name, version, source);
      case "rule":
        return buildRegistryRuleRef(parts.owner, parts.name, version, source, packages);
      case "hook":
        return buildRegistryHookRef(parts.owner, parts.name, version, source, packages);
    }
  });

const lockedRefsFromMap = (
  type: LibraryMemberExtensionType,
  map: ResolvedExtensionMap,
  source: RegistrySource,
) =>
  Effect.forEach(
    Object.entries(map),
    ([fqn, version]) => lockedRefFromEntry(type, fqn, version, source),
    { concurrency: "unbounded" },
  );

const lockedLibraryRefs = (locked: RegistryLibraryLockEntry, source: RegistrySource) =>
  Effect.gen(function* () {
    const refs = yield* Effect.all(
      [
        lockedRefsFromMap("skill", locked.resolvedSkills, source),
        lockedRefsFromMap("command", locked.resolvedCommands, source),
        lockedRefsFromMap("mcp-server", locked.resolvedMcpServers, source),
        lockedRefsFromMap("subagent", locked.resolvedSubagents, source),
        lockedRefsFromMap("files", locked.resolvedFiles, source),
        lockedRefsFromMap("rule", locked.resolvedRules, source),
        lockedRefsFromMap("hook", locked.resolvedHooks, source),
      ],
      { concurrency: "unbounded" },
    );

    return refs.flat();
  });

const validateFrozenPublisherEpochs = (refs: ReadonlyArray<ExtensionRef>, source: RegistrySource) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const [skills, commands, mcpServers, subagents, files, rules, hooks] = yield* Effect.all([
      ws.getLockedSkills(),
      ws.getLockedCommands(),
      ws.getLockedMcpServers(),
      ws.getLockedSubagents(),
      ws.getLockedFiles(),
      ws.getLockedRules(),
      ws.getLockedHooks(),
    ]);
    const client = yield* createRegistryClient(source.location.href);

    yield* Effect.forEach(
      refs,
      (ref) =>
        Effect.gen(function* () {
          if (ref.refType !== "registry") {
            return yield* makeAppError({
              code: "validation",
              detail: "Frozen Library replay produced a non-registry member reference",
            });
          }
          const name = refName(ref);
          const lockedEntry = (() => {
            switch (ref.type) {
              case "skill":
                return skills[name];
              case "command":
                return commands[name];
              case "mcp-server":
                return mcpServers[name];
              case "subagent":
                return subagents[name];
              case "files":
                return files[name];
              case "rule":
                return rules[name];
              case "hook":
                return hooks[name];
              case "pack":
                return undefined;
            }
          })();
          const expected =
            lockedEntry?.type === "registry" ? lockedEntry.publisherBindingId : undefined;
          const fqn = `${ref.owner}/${ref.type}/${ref.name}`;

          if (expected === undefined) {
            return yield* makeAppError({
              code: "validation",
              detail: `Frozen replay refused for ${fqn}: the lock entry predates publisher epochs`,
              recover:
                "Run the install without --frozen, review the publisher identity, and commit the refreshed lockfile.",
            });
          }

          const index = yield* client.getExtensionIndex({
            owner: ref.owner,
            type: ref.type,
            name: ref.name,
          });
          if (Option.isNone(index)) {
            return yield* makeAppError({
              code: "not_found",
              detail: `Frozen replay refused for ${fqn}: the registry coordinate no longer exists`,
            });
          }

          const actual = index.value.publisherBindingId;
          if (actual === undefined || actual !== expected) {
            return yield* makeAppError({
              code: "validation",
              detail: `Frozen replay refused for ${fqn}: publisher epoch ${actual ?? "missing"} does not match locked epoch ${expected}`,
              recover:
                "Run the install without --frozen and explicitly review the publisher change.",
            });
          }
        }),
      { concurrency: 4 },
    );
  });

const isMemberMature = (
  member: RegistryLibraryMember,
  policy: Option.Option<ReleaseAgePolicy>,
): boolean =>
  Option.match(policy, {
    onNone: () => true,
    onSome: (value) => {
      if (value.minimumAgeMs <= 0) return true;
      const addedAt = Date.parse(member.addedAt);
      if (!Number.isFinite(addedAt)) return false;
      return value.now.getTime() - addedAt >= value.minimumAgeMs;
    },
  });

const isTimestampMature = (
  value: string | null,
  policy: Option.Option<ReleaseAgePolicy>,
): boolean =>
  Option.match(policy, {
    onNone: () => true,
    onSome: (rule) => {
      if (rule.minimumAgeMs <= 0) return true;
      if (value === null) return false;
      const timestamp = Date.parse(value);
      if (!Number.isFinite(timestamp)) return false;
      return rule.now.getTime() - timestamp >= rule.minimumAgeMs;
    },
  });

const sortedMembers = (
  members: ReadonlyArray<RegistryLibraryMember>,
): ReadonlyArray<RegistryLibraryMember> =>
  [...members].sort((left, right) => {
    const leftKey = `${left.extensionOwner}/${left.extensionType}/${left.extensionName}`;
    const rightKey = `${right.extensionOwner}/${right.extensionType}/${right.extensionName}`;
    return leftKey.localeCompare(rightKey);
  });

const memberLabel = (member: RegistryLibraryMember): string =>
  formatFqn({
    owner: member.extensionOwner,
    type: member.extensionType,
    name: member.extensionName,
  });

const targetKey = (target: LibraryDependencyTarget): string => `${target.type}:${target.name}`;

const nameFromFqn = (fqn: string): string => parseExtensionFqnParts(fqn)?.name ?? fqn;

const mapTargets = (
  type: LibraryDependencyTarget["type"],
  map: ResolvedExtensionMap,
): ReadonlyArray<LibraryDependencyTarget> =>
  Object.keys(map).map((fqn) => ({ type, name: nameFromFqn(fqn) }));

const libraryTargets = (entry: {
  readonly resolvedSkills: ResolvedExtensionMap;
  readonly resolvedCommands: ResolvedExtensionMap;
  readonly resolvedMcpServers: ResolvedExtensionMap;
  readonly resolvedSubagents: ResolvedExtensionMap;
  readonly resolvedFiles: ResolvedExtensionMap;
  readonly resolvedRules: ResolvedExtensionMap;
  readonly resolvedHooks: ResolvedExtensionMap;
}): ReadonlyArray<LibraryDependencyTarget> => [
  ...mapTargets("skill", entry.resolvedSkills),
  ...mapTargets("command", entry.resolvedCommands),
  ...mapTargets("mcp-server", entry.resolvedMcpServers),
  ...mapTargets("subagent", entry.resolvedSubagents),
  ...mapTargets("files", entry.resolvedFiles),
  ...mapTargets("rule", entry.resolvedRules),
  ...mapTargets("hook", entry.resolvedHooks),
];

const uniqueTargets = (
  targets: ReadonlyArray<LibraryDependencyTarget>,
): ReadonlyArray<LibraryDependencyTarget> => {
  const seen = new Map<string, LibraryDependencyTarget>();
  for (const target of targets) {
    const key = targetKey(target);
    if (!seen.has(key)) {
      seen.set(key, target);
    }
  }
  return [...seen.values()];
};

const targetFromMemberRef = (ref: ExtensionRef): LibraryDependencyTarget | undefined => {
  switch (ref.type) {
    case "skill":
      return { type: "skill", name: ref.skill.name };
    case "command":
      return { type: "command", name: ref.command.name };
    case "mcp-server":
      return { type: "mcp-server", name: ref.server.name };
    case "subagent":
      return { type: "subagent", name: ref.subagent.name };
    case "files":
      return { type: "files", name: ref.file.name };
    case "rule":
      return { type: "rule", name: ref.rule.name };
    case "hook":
      return { type: "hook", name: ref.hook.name };
    case "pack":
      return undefined;
  }
};

const targetKeysFromRefs = (refs: ReadonlyArray<ExtensionRef>): ReadonlySet<string> =>
  new Set(
    refs.flatMap((ref) => {
      const target = targetFromMemberRef(ref);
      return target === undefined ? [] : [targetKey(target)];
    }),
  );

const configuredTargetKeys = (args: {
  readonly skills: Readonly<Record<string, unknown>>;
  readonly commands: Readonly<Record<string, unknown>>;
  readonly mcpServers: Readonly<Record<string, unknown>>;
  readonly subagents: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, unknown>>;
  readonly rules: Readonly<Record<string, unknown>>;
  readonly hooks: Readonly<Record<string, unknown>>;
}): ReadonlySet<string> =>
  new Set([
    ...Object.keys(args.skills).map((name) => `skill:${name}`),
    ...Object.keys(args.commands).map((name) => `command:${name}`),
    ...Object.keys(args.mcpServers).map((name) => `mcp-server:${name}`),
    ...Object.keys(args.subagents).map((name) => `subagent:${name}`),
    ...Object.keys(args.files).map((name) => `files:${name}`),
    ...Object.keys(args.rules).map((name) => `rule:${name}`),
    ...Object.keys(args.hooks).map((name) => `hook:${name}`),
  ]);

const otherLibraryTargetKeys = (
  currentLibraryName: string,
  libraries: LibrariesLockMap,
): ReadonlySet<string> =>
  new Set(
    Object.entries(libraries)
      .filter(([name]) => name !== currentLibraryName)
      .flatMap(([, entry]) => libraryTargets(entry).map(targetKey)),
  );

const collectDroppedLibraryTargets = (args: {
  readonly lockedLibrary: {
    readonly resolvedSkills: ResolvedExtensionMap;
    readonly resolvedCommands: ResolvedExtensionMap;
    readonly resolvedMcpServers: ResolvedExtensionMap;
    readonly resolvedSubagents: ResolvedExtensionMap;
    readonly resolvedFiles: ResolvedExtensionMap;
    readonly resolvedRules: ResolvedExtensionMap;
    readonly resolvedHooks: ResolvedExtensionMap;
  };
  readonly nextTargets: ReadonlySet<string>;
  readonly directlyConfigured: ReadonlySet<string>;
  readonly otherLibraryMembers: ReadonlySet<string>;
}): ReadonlyArray<LibraryDependencyTarget> =>
  uniqueTargets(libraryTargets(args.lockedLibrary)).filter((target) => {
    const key = targetKey(target);
    return (
      !args.nextTargets.has(key) &&
      !args.directlyConfigured.has(key) &&
      !args.otherLibraryMembers.has(key)
    );
  });

const resolveReleaseAgePolicy = (ws: WorkspaceMutationsService, unattended: boolean) =>
  Effect.gen(function* () {
    const minimumReleaseAge = yield* ws.getMinimumReleaseAge();
    const minimumAgeMs = parseMinimumReleaseAge(minimumReleaseAge);
    if (Option.isNone(minimumAgeMs)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Invalid minimumReleaseAge "${minimumReleaseAge}"`,
        recover: "Use a duration such as 24h, 1440m, or 0s.",
      });
    }

    const configuredPolicy = {
      minimumAgeMs: minimumAgeMs.value,
      now: new Date(),
    } satisfies ReleaseAgePolicy;
    return {
      policy: unattended ? Option.some(configuredPolicy) : Option.none<ReleaseAgePolicy>(),
      warningPolicy: unattended ? Option.none<ReleaseAgePolicy>() : Option.some(configuredPolicy),
      minimumReleaseAge: Option.some(minimumReleaseAge),
    };
  });

const resolvedExtensionMaps = (refs: ReadonlyArray<ExtensionRef>) => {
  let resolvedSkills: ResolvedExtensionMap = {};
  let resolvedCommands: ResolvedExtensionMap = {};
  let resolvedMcpServers: ResolvedExtensionMap = {};
  let resolvedSubagents: ResolvedExtensionMap = {};
  let resolvedFiles: ResolvedExtensionMap = {};
  let resolvedRules: ResolvedExtensionMap = {};
  let resolvedHooks: ResolvedExtensionMap = {};

  for (const ref of refs) {
    if (ref.refType !== "registry") continue;
    const fqn = formatFqn({ owner: ref.owner, type: ref.type, name: refName(ref) });
    switch (ref.type) {
      case "skill":
        resolvedSkills = { ...resolvedSkills, [fqn]: ref.version };
        break;
      case "command":
        resolvedCommands = { ...resolvedCommands, [fqn]: ref.version };
        break;
      case "mcp-server":
        resolvedMcpServers = { ...resolvedMcpServers, [fqn]: ref.version };
        break;
      case "subagent":
        resolvedSubagents = { ...resolvedSubagents, [fqn]: ref.version };
        break;
      case "files":
        resolvedFiles = { ...resolvedFiles, [fqn]: ref.version };
        break;
      case "rule":
        resolvedRules = { ...resolvedRules, [fqn]: ref.version };
        break;
      case "hook":
        resolvedHooks = { ...resolvedHooks, [fqn]: ref.version };
        break;
      case "pack":
        break;
    }
  }

  return {
    resolvedSkills,
    resolvedCommands,
    resolvedMcpServers,
    resolvedSubagents,
    resolvedFiles,
    resolvedRules,
    resolvedHooks,
  };
};

const buildLibrarySubscriptionStep = (
  ws: WorkspaceMutationsService,
  intent: LiveInstallLibraryCommandIntent,
): PlannedJobStep => ({
  key: `library:${formatLibraryRef(intent.ref)}`,
  label: formatLibraryRef(intent.ref),
  readiness: "ready",
  run: Effect.gen(function* () {
    const locked = yield* ws.getLockedLibrary(intent.ref.name);
    const now = new Date();
    const installedAt = Option.match(locked, {
      onNone: () => now,
      onSome: (entry) => entry.installedAt,
    });
    yield* ws.setLibrary({
      source: intent.sourceText,
      owner: intent.ref.owner,
      name: intent.ref.name,
      sourceName: intent.sourceName,
      installedAt,
      updatedAt: now,
      resolvedAt: now,
      membershipDigest: intent.library.membershipDigest,
      ...resolvedExtensionMaps(intent.membersToInstall),
    });

    const warnings = intent.skippedMemberMessages;

    return {
      result: "success",
      message: "Recorded Library subscription",
      ...(warnings.length > 0 ? { warnings } : {}),
    } satisfies JobStepResult;
  }),
});

const buildInstallStep = (
  managers: {
    readonly skillMgr: ExtensionManager<SkillExtensionRef>;
    readonly commandMgr: ExtensionManager<CommandExtensionRef>;
    readonly mcpServerMgr: ExtensionManager<McpServerExtensionRef>;
    readonly subagentMgr: ExtensionManager<SubagentExtensionRef>;
    readonly filesManager: ExtensionManager<FilesExtensionRef>;
    readonly ruleManager: ExtensionManager<RuleExtensionRef>;
    readonly hookManager: ExtensionManager<HookExtensionRef>;
  },
  ref: ExtensionRef,
  installedBefore: boolean,
): PlannedJobStep => {
  if (ref.type === "skill") {
    return buildInstallOperation<SkillExtensionRef>(managers.skillMgr, {
      ref,
      versionRange: Option.none(),
      skipSettings: true,
      installedBefore: Effect.succeed(installedBefore),
    });
  }

  if (ref.type === "command") {
    return buildInstallOperation<CommandExtensionRef>(managers.commandMgr, {
      ref,
      versionRange: Option.none(),
      skipSettings: true,
      installedBefore: Effect.succeed(installedBefore),
    });
  }

  if (ref.type === "mcp-server") {
    return buildInstallOperation<McpServerExtensionRef>(managers.mcpServerMgr, {
      ref,
      versionRange: Option.none(),
      skipSettings: true,
      installedBefore: Effect.succeed(installedBefore),
    });
  }

  if (ref.type === "subagent") {
    return buildInstallOperation<SubagentExtensionRef>(managers.subagentMgr, {
      ref,
      versionRange: Option.none(),
      skipSettings: true,
      installedBefore: Effect.succeed(installedBefore),
    });
  }

  if (ref.type === "files") {
    return buildInstallOperation<FilesExtensionRef>(managers.filesManager, {
      ref,
      versionRange: Option.none(),
      skipSettings: true,
      installedBefore: Effect.succeed(installedBefore),
    });
  }

  if (ref.type === "rule") {
    return buildInstallOperation<RuleExtensionRef>(managers.ruleManager, {
      ref,
      versionRange: Option.none(),
      skipSettings: true,
      installedBefore: Effect.succeed(installedBefore),
    });
  }

  if (ref.type === "hook") {
    return buildInstallOperation<HookExtensionRef>(managers.hookManager, {
      ref,
      versionRange: Option.none(),
      skipSettings: true,
      installedBefore: Effect.succeed(installedBefore),
    });
  }

  const target = targetFromRef(ref);
  return {
    key: `unsupported:${toLabel(target)}`,
    label: toLabel(target),
    readiness: "error",
    errorMessage: "Libraries cannot install pack members",
  };
};

const buildUninstallStep = (
  managers: {
    readonly skillMgr: ExtensionManager<SkillExtensionRef>;
    readonly commandMgr: ExtensionManager<CommandExtensionRef>;
    readonly mcpServerMgr: ExtensionManager<McpServerExtensionRef>;
    readonly subagentMgr: ExtensionManager<SubagentExtensionRef>;
    readonly filesManager: ExtensionManager<FilesExtensionRef>;
    readonly ruleManager: ExtensionManager<RuleExtensionRef>;
    readonly hookManager: ExtensionManager<HookExtensionRef>;
  },
  retentionPolicy: UninstallRetentionPolicy,
  target: LibraryDependencyTarget,
): PlannedJobStep => {
  if (target.type === "skill") {
    return buildUninstallOperation<SkillExtensionRef>(managers.skillMgr, retentionPolicy, {
      target,
    });
  }

  if (target.type === "command") {
    return buildUninstallOperation<CommandExtensionRef>(managers.commandMgr, retentionPolicy, {
      target,
    });
  }

  if (target.type === "mcp-server") {
    return buildUninstallOperation<McpServerExtensionRef>(managers.mcpServerMgr, retentionPolicy, {
      target,
    });
  }

  if (target.type === "subagent") {
    return buildUninstallOperation<SubagentExtensionRef>(managers.subagentMgr, retentionPolicy, {
      target,
    });
  }

  if (target.type === "files") {
    return buildUninstallOperation<FilesExtensionRef>(managers.filesManager, retentionPolicy, {
      target,
    });
  }

  if (target.type === "rule") {
    return buildUninstallOperation<RuleExtensionRef>(managers.ruleManager, retentionPolicy, {
      target,
    });
  }

  return buildUninstallOperation<HookExtensionRef>(managers.hookManager, retentionPolicy, {
    target,
  });
};

export class InstallLibraryCommandWorkflowActions extends ServiceMap.Service<
  InstallLibraryCommandWorkflowActions,
  InstallExtensionCommandWorkflowActions<
    InstallLibraryHandlerArgs,
    ParsedLibraryInstallArgs,
    LibrarySourceRequest,
    LibraryDiscoveryResult,
    InstallLibraryCommandIntent
  >
>()("axm.sh/root/libraries/install/command-actions/InstallLibraryCommandWorkflowActions") {}

export const InstallLibraryCommandWorkflowActionsLive = Layer.effect(
  InstallLibraryCommandWorkflowActions,
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const ws = yield* WorkspaceMutations;
    const fsSvc = yield* FileSystem.FileSystem;
    const pathSvc = yield* Path.Path;
    const skillMgr = yield* SkillManager;
    const commandMgr = yield* CommandManager;
    const filesManager = yield* FilesManager;
    const ruleManager = yield* RuleManager;
    const hookManager = yield* HookManager;
    const mcpServerMgr = yield* McpServerManager;
    const subagentMgr = yield* SubagentManager;
    const verbosityOption = yield* Effect.serviceOption(Verbosity);
    const verbose = Option.match(verbosityOption, {
      onNone: () => false,
      onSome: (verbosity) => verbosity.isAtLeast("verbose"),
    });

    const envLayer = Layer.mergeAll(
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(FileSystem.FileSystem, fsSvc),
      Layer.succeed(Path.Path, pathSvc),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const parseArgs = (args: InstallLibraryHandlerArgs) =>
      Effect.gen(function* () {
        const sourceText = args.source.trim();
        const ref = parseLibraryRef(sourceText);
        if (ref === undefined) {
          return yield* makeAppError({
            code: "usage",
            detail: "Library source must use @owner/libraries/name format",
            suggestions: [
              {
                description: "Use a Library ref such as @acme/libraries/frontend.",
              },
            ],
          });
        }

        return {
          sourceText,
          ref,
          unattended: args.unattended ?? false,
          frozen: args.frozen ?? false,
        } satisfies ParsedLibraryInstallArgs;
      });

    const resolveSourceRequests = (parsed: ParsedLibraryInstallArgs) =>
      provide(
        Effect.gen(function* () {
          if (parsed.frozen) {
            const locked = yield* ws.getLockedLibrary(parsed.ref.name);
            if (Option.isNone(locked)) {
              return yield* makeAppError({
                code: "not_found",
                detail: `Library "${formatLibraryRef(parsed.ref)}" is not locked; cannot install with --frozen`,
                suggestions: [
                  {
                    description:
                      "Run the install without --frozen to resolve the Library before replaying it.",
                  },
                ],
              });
            }

            if (locked.value.owner !== parsed.ref.owner || locked.value.name !== parsed.ref.name) {
              return yield* makeAppError({
                code: "validation",
                detail: `Locked Library "${formatLibraryRef({
                  owner: locked.value.owner,
                  name: locked.value.name,
                })}" does not match requested "${formatLibraryRef(parsed.ref)}"`,
                recover: "Regenerate the lockfile without --frozen.",
              });
            }

            const configuredSource = yield* ws.getConfiguredSourceByName(locked.value.sourceName);
            if (Option.isNone(configuredSource) || configuredSource.value.type !== "registry") {
              return yield* makeAppError({
                code: "validation",
                detail: `Locked Library source "${locked.value.sourceName}" is not a configured registry source`,
                recover: "Restore the registry source configuration or regenerate the lockfile.",
              });
            }

            return [
              {
                source: sourceFromHost(configuredSource.value, parsed.ref.owner),
                sourceName: locked.value.sourceName,
                sourceText: parsed.sourceText,
                ref: parsed.ref,
                unattended: parsed.unattended,
                frozen: true,
                lockedLibrary: locked.value,
              },
            ];
          }

          const registrySources = yield* ws.getRegistrySourceHosts();
          const registrySource = registrySources[0];
          if (registrySource === undefined) {
            return yield* makeAppError({
              code: "validation",
              detail: `No registry source configured for owner "${parsed.ref.owner}"`,
            });
          }

          return [
            {
              source: sourceFromHost(registrySource, parsed.ref.owner),
              sourceName: registrySource.name,
              sourceText: parsed.sourceText,
              ref: parsed.ref,
              unattended: parsed.unattended,
              frozen: false,
            },
          ];
        }),
      );

    const discoverRefs = (reqs: ReadonlyArray<LibrarySourceRequest>) =>
      provide(
        Effect.scoped(
          Effect.gen(function* () {
            const req = reqs[0];
            if (req === undefined) {
              return yield* makeAppError({
                code: "usage",
                detail: "No Library source request provided",
              });
            }

            if (req.frozen) {
              if (req.lockedLibrary === undefined) {
                return yield* makeAppError({
                  code: "validation",
                  detail: "Frozen Library install requires a locked Library snapshot",
                });
              }

              const diagnosticLines = verbose
                ? [
                    `Library: ${formatLibraryRef(req.ref)}`,
                    `Registry source: ${req.sourceName} (${req.source.location.href})`,
                    `Frozen snapshot resolved at: ${req.lockedLibrary.resolvedAt.toISOString()}`,
                  ]
                : undefined;

              return [
                {
                  mode: "frozen" as const,
                  lockedLibrary: req.lockedLibrary,
                  request: req,
                  ...(diagnosticLines === undefined ? {} : { diagnosticLines }),
                },
              ];
            }

            const client = yield* createRegistryClient(req.source.location.href);
            const libraryOption = yield* client.getLibrary({
              owner: req.ref.owner,
              name: req.ref.name,
            });

            if (Option.isNone(libraryOption)) {
              const lockedLibrary = yield* ws.getLockedLibrary(req.ref.name);
              if (
                req.unattended &&
                Option.isSome(lockedLibrary) &&
                lockedLibrary.value.owner === req.ref.owner &&
                lockedLibrary.value.name === req.ref.name
              ) {
                return [
                  {
                    mode: "frozen" as const,
                    lockedLibrary: lockedLibrary.value,
                    request: req,
                    diagnosticLines: [
                      `Warning: Library "${formatLibraryRef(req.ref)}" is currently inaccessible; retaining its previous locked resolution.`,
                    ],
                  },
                ];
              }
              return yield* makeAppError({
                code: "not_found",
                detail: `Library "${formatLibraryRef(req.ref)}" not found in registry`,
                suggestions: [{ description: "Verify the Library name and registry access." }],
              });
            }

            const diagnosticLines = verbose
              ? [
                  `Library: ${formatLibraryRef(req.ref)}`,
                  `Registry source: ${req.sourceName} (${req.source.location.href})`,
                  `Visible members: ${libraryOption.value.members.length}`,
                  "Resolution is viewer-relative",
                ]
              : undefined;

            return [
              {
                mode: "live" as const,
                library: libraryOption.value,
                request: req,
                ...(diagnosticLines === undefined ? {} : { diagnosticLines }),
              },
            ];
          }),
        ),
      );

    const resolveMemberRefs = (
      library: RegistryLibraryDetail,
      source: RegistrySource,
      releaseAgePolicy: Option.Option<ReleaseAgePolicy>,
      warningAgePolicy: Option.Option<ReleaseAgePolicy>,
      minimumReleaseAge: Option.Option<string>,
    ): Effect.Effect<ResolvedLibraryMembers, AppError, never> =>
      provide(
        Effect.scoped(
          Effect.gen(function* () {
            const refs: Array<ExtensionRef> = [];
            const skippedMessages: Array<string> = [];

            for (const member of sortedMembers(library.members)) {
              const memberType = member.extensionType;
              if (memberType === "pack") {
                return yield* makeAppError({
                  code: "validation",
                  detail: `Library member ${memberLabel(member)} is a pack; Libraries can only include installable extension members.`,
                });
              }

              if (!isMemberMature(member, releaseAgePolicy)) {
                const ageText = Option.match(minimumReleaseAge, {
                  onNone: () => "the configured minimumReleaseAge",
                  onSome: (value) => value,
                });
                skippedMessages.push(
                  `${memberLabel(member)} was added to the Library more recently than minimumReleaseAge ${ageText} and was skipped.`,
                );
                continue;
              }

              if (
                !isMemberMature(member, warningAgePolicy) ||
                !isTimestampMature(member.publishedAt, warningAgePolicy)
              ) {
                const ageText = Option.match(minimumReleaseAge, {
                  onNone: () => "the configured minimumReleaseAge",
                  onSome: (value) => value,
                });
                skippedMessages.push(
                  `${memberLabel(member)} is newer than minimumReleaseAge ${ageText}; attended install is continuing.`,
                );
              }

              const found = yield* sources.find(source, {
                names: [member.extensionName],
                type: memberType,
                owner: Option.some(member.extensionOwner),
                versionRange: Option.some(member.resolvedVersion),
                releaseAgePolicy,
              });
              const ref = found.find(
                (entry) =>
                  entry.type === memberType &&
                  entry.refType === "registry" &&
                  entry.owner === member.extensionOwner &&
                  refName(entry) === member.extensionName,
              );

              if (ref === undefined) {
                if (Option.isSome(releaseAgePolicy)) {
                  skippedMessages.push(
                    `${memberLabel(member)} has no version old enough for the configured minimumReleaseAge and was skipped.`,
                  );
                  continue;
                }

                return yield* makeAppError({
                  code: "not_found",
                  detail: `Library member ${memberLabel(member)} could not be resolved`,
                  suggestions: [
                    {
                      description:
                        "Verify the member extension is published and visible to the current registry credentials.",
                    },
                  ],
                });
              }

              refs.push(ref);
            }

            return { refs, skippedMessages } satisfies ResolvedLibraryMembers;
          }),
        ),
      );

    const finalizeIntent = (
      _parsed: ParsedLibraryInstallArgs,
      refs: ReadonlyArray<LibraryDiscoveryResult>,
    ) =>
      Effect.gen(function* () {
        const discovery = refs[0];
        if (discovery === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: "No Library reference found",
          });
        }

        if (discovery.mode === "frozen") {
          const refsToInstall = yield* lockedLibraryRefs(
            discovery.lockedLibrary,
            discovery.request.source,
          );
          yield* provide(validateFrozenPublisherEpochs(refsToInstall, discovery.request.source));

          return {
            mode: "frozen",
            ref: discovery.request.ref,
            source: discovery.request.source,
            sourceName: discovery.request.sourceName,
            sourceText: discovery.request.sourceText,
            membersToInstall: refsToInstall,
            skippedMemberMessages: [],
            ...(discovery.diagnosticLines === undefined
              ? {}
              : { diagnosticLines: discovery.diagnosticLines }),
          } satisfies InstallLibraryCommandIntent;
        }

        const { policy, warningPolicy, minimumReleaseAge } = yield* resolveReleaseAgePolicy(
          ws,
          discovery.request.unattended,
        );
        const resolvedMembers = yield* resolveMemberRefs(
          discovery.library,
          discovery.request.source,
          policy,
          warningPolicy,
          minimumReleaseAge,
        );

        return {
          mode: "live",
          library: discovery.library,
          ref: discovery.request.ref,
          source: discovery.request.source,
          sourceName: discovery.request.sourceName,
          sourceText: discovery.request.sourceText,
          releaseAgePolicy: policy,
          minimumReleaseAge,
          membersToInstall: resolvedMembers.refs,
          skippedMemberMessages: resolvedMembers.skippedMessages,
          ...(discovery.diagnosticLines === undefined
            ? {}
            : { diagnosticLines: discovery.diagnosticLines }),
        } satisfies InstallLibraryCommandIntent;
      });

    const buildPlan = (intent: InstallLibraryCommandIntent) =>
      Effect.gen(function* () {
        const [
          configuredSkills,
          configuredCommands,
          configuredMcpServers,
          configuredSubagents,
          configuredFiles,
          configuredRules,
          configuredHooks,
          lockedLibrary,
          lockedLibraries,
          lockedSkills,
          lockedCommands,
          lockedMcpServers,
          lockedSubagents,
          lockedFiles,
          lockedRules,
          lockedHooks,
        ] = yield* Effect.all(
          [
            ws.records.getConfiguredSkills(),
            ws.records.getConfiguredCommands(),
            ws.records.getConfiguredMcpServers(),
            ws.records.getConfiguredSubagents(),
            ws.getConfiguredFilesEntries(),
            ws.getConfiguredRuleEntries(),
            ws.getConfiguredHookEntries(),
            ws.getLockedLibrary(intent.ref.name),
            ws.getLockedLibraries(),
            ws.getLockedSkills(),
            ws.getLockedCommands(),
            ws.getLockedMcpServers(),
            ws.getLockedSubagents(),
            ws.getLockedFiles(),
            ws.getLockedRules(),
            ws.getLockedHooks(),
          ],
          { concurrency: "unbounded" },
        );

        const installedBefore = (ref: ExtensionRef): boolean => {
          switch (ref.type) {
            case "skill":
              return Object.hasOwn(lockedSkills, ref.skill.name);
            case "command":
              return Object.hasOwn(lockedCommands, ref.command.name);
            case "mcp-server":
              return Object.hasOwn(lockedMcpServers, ref.server.name);
            case "subagent":
              return Object.hasOwn(lockedSubagents, ref.subagent.name);
            case "files":
              return Object.hasOwn(lockedFiles, ref.file.name);
            case "rule":
              return Object.hasOwn(lockedRules, ref.rule.name);
            case "hook":
              return Object.hasOwn(lockedHooks, ref.hook.name);
            case "pack":
              return false;
          }
        };

        const managers = {
          skillMgr,
          commandMgr,
          mcpServerMgr,
          subagentMgr,
          filesManager,
          ruleManager,
          hookManager,
        };
        const installSteps = intent.membersToInstall.map((ref) =>
          buildInstallStep(managers, ref, installedBefore(ref)),
        );

        if (intent.mode === "frozen") {
          return {
            _tag: "Plan",
            name: "Install Library",
            description:
              intent.diagnosticLines === undefined
                ? Option.none()
                : Option.some(intent.diagnosticLines.join("\n")),
            jobs: [
              {
                concurrency: 1 as const,
                steps: installSteps,
              },
            ],
          } satisfies Plan;
        }

        const subscriptionStep = buildLibrarySubscriptionStep(ws, intent);
        const directlyConfigured = configuredTargetKeys({
          skills: configuredSkills,
          commands: configuredCommands,
          mcpServers: configuredMcpServers,
          subagents: configuredSubagents,
          files: configuredFiles,
          rules: configuredRules,
          hooks: configuredHooks,
        });
        const droppedTargets = Option.match(lockedLibrary, {
          onNone: () => [],
          onSome: (entry) =>
            collectDroppedLibraryTargets({
              lockedLibrary: entry,
              nextTargets: targetKeysFromRefs(intent.membersToInstall),
              directlyConfigured,
              otherLibraryMembers: otherLibraryTargetKeys(intent.ref.name, lockedLibraries),
            }),
        });
        const retentionPolicy = makeWorkspaceRetentionPolicy(ws);
        const uninstallSteps = droppedTargets.map((target) =>
          buildUninstallStep(managers, retentionPolicy, target),
        );

        return {
          _tag: "Plan",
          name: "Install Library",
          description:
            intent.diagnosticLines === undefined
              ? Option.none()
              : Option.some(intent.diagnosticLines.join("\n")),
          jobs: [
            {
              concurrency: 1 as const,
              steps: [...installSteps, subscriptionStep, ...uninstallSteps],
            },
          ],
        } satisfies Plan;
      });

    return {
      parseArgs,
      resolveSourceRequests,
      discoverRefs,
      finalizeIntent,
      buildPlan,
    };
  }),
);
