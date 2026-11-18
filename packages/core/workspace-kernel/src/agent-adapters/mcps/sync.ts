import type { McpDistribution, McpBinding, McpAuth } from "./connection.js";
/**
 * Writing MCP connections into agent-native configuration, and withdrawing
 * them: the writer side of the target plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  CONFIGURABLE_AGENT_IDS,
  type McpActivationField,
  type McpConfigTarget,
  type McpServersPath,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { resolveNativeReadLocation, type NativeDirectoryInputs } from "../../locations/index.js";
import {
  withNativeConfigObservationView,
  withNativeConfigReadView,
} from "../native-config-syntax.js";
import { preflightNativeConfigReaders } from "../native-config-readers.js";
import {
  McpConfigInvalid,
  type McpConfigIoFailed,
  McpDefinitionInvalid,
  McpSharedTargetConflict,
} from "../errors.js";
import type { CodingAgentFailure } from "../errors.js";
import { type McpServerManifest } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import type { NativeWriteAuthority } from "../native-write-authority.js";
import {
  removeAgentMcpConfigs,
  renderAgentMcpConfigRemovals,
  prepareMcpWrite,
  writePreparedAgentMcpConfig,
  type McpWritePreparation,
  type RemoveAgentMcpConfigsArgs,
} from "./config-writer.js";
import {
  readNativeMcpConfig,
  readNativeMcpValues,
  resolveAgentMcpConfigTargetPath,
} from "./native-config.js";
import {
  planMcpServerTargets,
  unresolvedMcpAgentTargets,
  type McpAgentTargetPlan,
  type McpTargetPlan,
  type McpTargetWrite,
} from "./target-plan.js";
import { resolveConfiguredMcpTargets, type McpTargetGroup } from "./targeting.js";
import type {
  AddMcpServerArgs,
  McpServerSyncOutcome,
  McpServerSyncTarget,
  RemoveMcpServerArgs,
} from "../agents/coding-agent.js";
import type { McpServerDeclaration } from "./expected-entry.js";
import { decodeMcpServerManifestAt } from "./manifest.js";
import { readPluginMcpDefinition, type PluginMcpDefinition } from "./plugin-definition.js";
import type { NativeMcpComponent } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { resolveSharedMcpContainer } from "./shared-target.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

/** Readback proves native content; running-agent selection remains unobservable here. */
const describePhysicalConsumers = (args: {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly physicalPath: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<McpServerSyncTarget>;
}) =>
  withNativeConfigReadView(
    Effect.gen(function* () {
      if (args.targets.length === 0) return args.targets;
      const raw = Option.getOrElse(yield* readNativeMcpConfig(args.physicalPath), () => "");
      const path = yield* Path.Path;
      const potentialReaders: Array<string> = [];
      const physicalPaths = new Map<string, string>();
      for (const agentId of CONFIGURABLE_AGENT_IDS) {
        const native = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"].native;
        if (!("locations" in native)) continue;
        for (const location of native.locations) {
          const resolved = resolveNativeReadLocation(
            path,
            agentId,
            location,
            args,
            args.nativeDirectoryInputs,
          );
          if (resolved === undefined) continue;
          const declared = {
            scope: location.scope,
            nativeRoot: resolved.nativeRoot,
            path: resolved.path,
            format: location.format,
            attribution: location.attribution ?? ("agent" as const),
          };
          const physical =
            physicalPaths.get(resolved.path) ??
            (yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, declared).pipe(
              Effect.option,
            ));
          const physicalPath =
            typeof physical === "string" ? physical : Option.getOrUndefined(physical);
          if (physicalPath === undefined) continue;
          physicalPaths.set(resolved.path, physicalPath);
          if (physicalPath !== args.physicalPath) continue;
          if (!args.agentIds.includes(agentId)) {
            potentialReaders.push(agentId);
            break;
          }
          if (location.keyPath !== undefined)
            yield* readNativeMcpValues({
              configPath: args.physicalPath,
              raw,
              format: location.format,
              serversPath: location.keyPath,
            });
        }
      }
      return args.targets.map((target): McpServerSyncTarget =>
        target.nativeLocation === undefined
          ? target
          : {
              ...target,
              nativeLocation: {
                ...target.nativeLocation,
                configuredConsumers: [...new Set(args.agentIds)].sort(),
                potentialReaders: potentialReaders.sort(),
                availability: [...new Set(args.agentIds)].sort().map((agentId) => ({
                  agentId,
                  state: "unverified",
                  reason:
                    "Native config readback verified; agent configuration selection is not observable",
                })),
              },
            },
      );
    }),
  );

export interface SyncInlineMcpServerArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly serverName: string;
  readonly entry: McpServerDeclaration;

  readonly scope?: "project" | "user";
}

export interface SyncManifestMcpServerArgs extends Omit<
  AddMcpServerArgs,
  "owner" | "resolvedVersion"
> {
  readonly agentIds: ReadonlyArray<string>;
  /**
   * The frozen manifest the caller decoded from `canonicalPath` within the
   * same operation; when absent, the sync reads and decodes it itself.
   */
  readonly manifest?: McpServerManifest;
}

export interface ValidateManifestMcpServerTargetsArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly manifest: McpServerManifest;
  readonly agentIds: ReadonlyArray<string>;
  readonly scope: "project" | "user";
  readonly serverName: string;
  readonly distribution?: McpDistribution;
  readonly bindings?: ReadonlyArray<McpBinding>;
  readonly auth?: McpAuth;
  readonly enabled: boolean;
}

/** A plan whose readers all accept their shared entries, or the conflict that stops it. */
const plannedTargets = (
  plan: McpTargetPlan,
): Effect.Effect<
  Extract<McpTargetPlan, { readonly _tag: "planned" }>,
  McpDefinitionInvalid | McpSharedTargetConflict
> => {
  if (plan._tag === "invalid") {
    return Effect.fail(new McpDefinitionInvalid({ detail: plan.detail, cause: plan.cause }));
  }
  const blocked = plan.agents.find((agent) => agent._tag === "blocked");
  return blocked !== undefined && blocked._tag === "blocked"
    ? Effect.fail(new McpSharedTargetConflict({ reason: blocked.reason }))
    : Effect.succeed(plan);
};

/** One planned write with the proposal its validation rendered, when it has no adoption preimage. */
interface ValidatedMcpWrite {
  readonly write: McpTargetWrite;
  readonly prepared: McpWritePreparation | undefined;
}

/** One adopted native entry whose source document is the preimage of a planned write. */
interface McpAdoptionPreimage {
  readonly filePath: string;
  readonly expectedEntry: Readonly<Record<string, unknown>>;
}

/** Reads one native MCP config document, absent as none. */
type NativeMcpConfigReader = (
  configPath: string,
) => Effect.Effect<Option.Option<string>, McpConfigIoFailed, FileSystem.FileSystem>;

/** Recheck every declared alias and all file contracts before the first native write. */
const validatePlannedWrites = (
  configuredAgentIds: ReadonlyArray<string>,
  workspaceRoot: string,
  serverName: string,
  writes: ReadonlyArray<McpTargetWrite>,
  authority: {
    readonly nativeDirectoryInputs: NativeDirectoryInputs;
  },
  adoptions?: ReadonlyArray<McpAdoptionPreimage>,
  readPreimage: NativeMcpConfigReader = readNativeMcpConfig,
) =>
  withNativeConfigReadView(
    Effect.gen(function* () {
      const validated: Array<ValidatedMcpWrite> = [];
      for (const write of writes) {
        for (const target of write.declaredTargets) {
          const current = yield* resolveAgentMcpConfigTargetPath(workspaceRoot, target);
          if (current !== write.path) {
            return yield* new McpConfigInvalid({
              detail: `MCP location changed before writing: ${target.path}`,
            });
          }
        }
        const raw = Option.getOrElse(yield* readPreimage(write.path), () => "");
        yield* preflightNativeConfigReaders({
          nativeDirectoryInputs: authority.nativeDirectoryInputs,
          workspaceRoot,
          scope: write.target.scope,
          physicalPath: write.path,
          configuredAgentIds,
          writerFormat: write.target.format,
          raw,
        });
        if (write.agentIds.includes("pi")) {
          const entries = yield* readNativeMcpValues({
            configPath: write.path,
            raw,
            format: write.target.format,
            serversPath: write.config.serversPath,
          });
          const normalizedName = serverName.replaceAll("-", "_");
          if (
            Object.keys(entries).some(
              (name) => name !== serverName && name.replaceAll("-", "_") === normalizedName,
            )
          ) {
            return yield* new McpConfigInvalid({
              detail: "Pi server names collide after native hyphen/underscore normalization",
            });
          }
        }
        const adoption = adoptions?.find((entry) => entry.filePath === write.path);
        const proposedRaw = yield* prepareMcpWrite(
          {
            workspaceRoot,
            serverName,
            serversPath: write.config.serversPath,
            target: write.target,
            entry: write.entry,

            ...(adoption === undefined ? {} : { adoption }),
          },
          write.path,
          raw,
        );
        yield* preflightNativeConfigReaders({
          nativeDirectoryInputs: authority.nativeDirectoryInputs,
          workspaceRoot,
          scope: write.target.scope,
          physicalPath: write.path,
          configuredAgentIds,
          writerFormat: write.target.format,
          raw,
          proposedRaw,
        });
        if (adoption !== undefined) {
          validated.push(Object.freeze({ write, prepared: undefined }));
          continue;
        }
        // The same view already parsed this preimage, so the server's presence costs no parse.
        const values = yield* readNativeMcpValues({
          configPath: write.path,
          raw,
          format: write.target.format,
          serversPath: write.config.serversPath,
        });
        const prepared: McpWritePreparation = Object.freeze({
          configPath: write.path,
          raw,
          next: proposedRaw,
          existed: Object.hasOwn(values, serverName),
          serverName,
          serversPath: write.config.serversPath,
          format: write.target.format,
          entry: write.entry,
        });
        validated.push(Object.freeze({ write, prepared }));
      }
      return Object.freeze(validated);
    }),
  );

/** One inline server to validate against resolved native targets. */
export interface InlineMcpServerCandidate {
  readonly serverName: string;
  readonly entry: McpServerDeclaration;
  readonly adoptions?: ReadonlyArray<McpAdoptionPreimage>;
}

type InlineMcpTargetArgs = Omit<SyncInlineMcpServerArgs, "serverName" | "entry">;

const resolveInlineMcpTargets = (agentIds: ReadonlyArray<string>, args: InlineMcpTargetArgs) =>
  resolveConfiguredMcpTargets({
    nativeDirectoryInputs: args.nativeDirectoryInputs,
    workspaceRoot: args.workspaceRoot,
    agentIds,
    scope: args.scope ?? "project",
  });

/** Plan one inline server against resolved targets and preflight every planned write. */
const validateInlineCandidateTargets = (
  agentIds: ReadonlyArray<string>,
  args: InlineMcpTargetArgs,
  groups: ReadonlyArray<McpTargetGroup>,
  candidate: InlineMcpServerCandidate,
  readPreimage?: NativeMcpConfigReader,
) =>
  Effect.gen(function* () {
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        agentIds,
        groups,
        scope: args.scope ?? "project",
        serverName: candidate.serverName,
        declaration: candidate.entry,
        resolvedCwd:
          candidate.entry.connection?.transport === "stdio" &&
          candidate.entry.connection.cwd?.base === "scope"
            ? (yield* Path.Path).resolve(args.workspaceRoot, candidate.entry.connection.cwd.path)
            : undefined,
        enabled: candidate.entry.enabled ?? true,
      }),
    );
    yield* validatePlannedWrites(
      agentIds,
      args.workspaceRoot,
      candidate.serverName,
      plan.writes,
      args,
      candidate.adoptions,
      readPreimage,
    );
    return plan;
  });

/** Resolve physical sharing and preflight inline native entries without publishing settings. */
export const validateInlineMcpServerTargets = (
  agentIds: ReadonlyArray<string>,
  args: SyncInlineMcpServerArgs & {
    readonly adoptions?: ReadonlyArray<McpAdoptionPreimage>;
  },
) =>
  Effect.gen(function* () {
    const groups = yield* resolveInlineMcpTargets(agentIds, args);
    return yield* validateInlineCandidateTargets(agentIds, args, groups, args);
  });

/**
 * Validate inline servers in order, as one `validateInlineMcpServerTargets`
 * call per server would, within one read of unchanged native state: the
 * targets are resolved once, before the first server, and each native file is
 * read once. `discovered` holds native MCP documents the caller already read in
 * the same read phase, each by the exact physical path it read; a planned write
 * at one of those paths is validated against that text instead of reading the
 * file again. Every server keeps its own plan, alias recheck and reader
 * preflights, and the first failure stops the run. The plans come back in
 * server order, each with its server name.
 */
export const validateInlineMcpServerTargetsInOrder = (
  agentIds: ReadonlyArray<string>,
  args: InlineMcpTargetArgs,
  candidates: ReadonlyArray<InlineMcpServerCandidate>,
  discovered: ReadonlyArray<{ readonly path: string; readonly raw: string }> = [],
) =>
  Effect.gen(function* () {
    if (candidates.length === 0) return [];
    const resolved = yield* resolveInlineMcpTargets(agentIds, args);
    // Read once per run; a failed read stops the run, so only successes are kept.
    const preimages = new Map<string, Option.Option<string>>(
      discovered.map(({ path, raw }) => [path, Option.some(raw)]),
    );
    const readPreimage: NativeMcpConfigReader = (configPath) => {
      const known = preimages.get(configPath);
      return known !== undefined
        ? Effect.succeed(known)
        : readNativeMcpConfig(configPath).pipe(
            Effect.tap((raw) => Effect.sync(() => preimages.set(configPath, raw))),
          );
    };
    const plans: Array<{
      readonly serverName: string;
      readonly plan: Effect.Success<ReturnType<typeof validateInlineCandidateTargets>>;
    }> = [];
    for (const candidate of candidates) {
      // Each server plans against its own copy of the resolved targets.
      const plan = yield* validateInlineCandidateTargets(
        agentIds,
        args,
        structuredClone(resolved),
        candidate,
        readPreimage,
      );
      plans.push({ serverName: candidate.serverName, plan });
    }
    return plans;
  });

/** Write every planned shared file once and report the targets each agent gained. */
const applyPlannedWrites = (
  configuredAgentIds: ReadonlyArray<string>,
  workspaceRoot: string,
  serverName: string,
  writes: ReadonlyArray<McpTargetWrite>,
  authority: {
    readonly nativeDirectoryInputs: NativeDirectoryInputs;
  },
): Effect.Effect<
  ReadonlyMap<string, ReadonlyArray<McpServerSyncTarget>>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const validated = yield* validatePlannedWrites(
      configuredAgentIds,
      workspaceRoot,
      serverName,
      writes,
      authority,
    );
    const path = yield* Path.Path;
    const targetsByAgent = new Map<string, Array<McpServerSyncTarget>>();
    for (const { write, prepared } of validated) {
      // The writer reuses the validated proposal only for an identical locked preimage.
      const result = yield* writePreparedAgentMcpConfig(
        {
          workspaceRoot,
          serverName,
          serversPath: write.config.serversPath,
          target: write.target,
          entry: write.entry,

          aliases: [
            ...new Set(
              write.declaredTargets.map((target) =>
                path.resolve(
                  workspaceRoot,
                  target.scope === "user" && target.path.startsWith("~/")
                    ? target.path.slice(2)
                    : target.path,
                ),
              ),
            ),
          ].sort(),
        },
        prepared,
      );
      const targets = yield* describePhysicalConsumers({
        nativeDirectoryInputs: authority.nativeDirectoryInputs,
        workspaceRoot,
        scope: write.target.scope,
        physicalPath: write.path,
        agentIds: write.agentIds,
        targets: result.targets,
      });
      for (const agentId of write.agentIds) {
        const existing = targetsByAgent.get(agentId) ?? [];
        targetsByAgent.set(agentId, [...existing, ...targets]);
      }
    }
    return targetsByAgent;
  });

/** Collapse all destinations into one outcome per requested agent without losing changed targets. */
export const mcpAgentSyncOutcome = (
  agents: ReadonlyArray<McpAgentTargetPlan>,
  targets: ReadonlyArray<McpServerSyncTarget>,
): McpServerSyncOutcome => {
  const warnings = [
    ...new Set(agents.flatMap((agent) => ("warnings" in agent ? agent.warnings : []))),
  ];
  const facts = { targets, ...(warnings.length === 0 ? {} : { warnings }) };
  const failures = agents.flatMap((agent) =>
    agent._tag === "unverified" || agent._tag === "blocked" ? [agent.reason] : [],
  );
  if (failures.length > 0) return { ...facts, _tag: "failed", reason: failures.join("; ") };
  if (agents.some((agent) => agent._tag === "needs-input"))
    return { ...facts, _tag: "needs-input", reason: warnings.join("; ") };
  const unavailable = agents.flatMap((agent) =>
    agent._tag === "nothing-runnable" || agent._tag === "unsupported" ? [agent.reason] : [],
  );
  if (unavailable.length > 0)
    return {
      ...facts,
      _tag: agents.some((agent) => agent._tag === "nothing-runnable")
        ? "nothing-runnable"
        : "unsupported",
      reason: unavailable.join("; "),
    };
  return { ...facts, _tag: "success" };
};

/** Project one inline server into every configured agent that shares its files. */
export const syncInlineMcpServerToAgents = (
  agentIds: ReadonlyArray<string>,
  args: SyncInlineMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const groups = yield* resolveConfiguredMcpTargets({
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      workspaceRoot: args.workspaceRoot,
      agentIds,
      scope: args.scope ?? "project",
    });
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        agentIds,
        groups,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: args.entry,
        resolvedCwd:
          args.entry.connection?.transport === "stdio" &&
          args.entry.connection.cwd?.base === "scope"
            ? (yield* Path.Path).resolve(args.workspaceRoot, args.entry.connection.cwd.path)
            : undefined,
        enabled: args.entry.enabled ?? true,
      }),
    );
    const written = yield* applyPlannedWrites(
      agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
    return agentIds.map((agentId) =>
      mcpAgentSyncOutcome(
        plan.agents.filter((agent) => agent.agentId === agentId),
        written.get(agentId) ?? [],
      ),
    );
  });

interface McpRemovalGroup {
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly path: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly declaredTargets: ReadonlyArray<McpConfigTarget>;
  readonly removal: RemoveAgentMcpConfigsArgs;
  readonly retained: ReadonlyArray<McpServerSyncTarget>;
  readonly configuredConsumers: ReadonlyArray<string>;
}

/**
 * The configured targets of one MCP connection's withdrawal and the bytes of
 * each target's native file, as one disabled-connection inspection observed
 * them within the same read of unchanged native state. Each consumer owns its
 * copy.
 */
export interface ObservedMcpWithdrawal {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
  readonly serverName: string;
  readonly targets: ReadonlyArray<{
    readonly group: McpTargetGroup;
    /** The group's native file, absent as none. */
    readonly raw: Option.Option<string>;
  }>;
}

interface McpRemovalArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly disableOnly: boolean;
  readonly configuredConsumerIds?: ReadonlySet<string>;
}

/** One container's withdrawal facts that no selected entry name changes. */
interface PreparedMcpRemovalGroup {
  readonly path: string;
  readonly agentIds: ReadonlyArray<string>;
  readonly declaredTargets: ReadonlyArray<McpConfigTarget>;
  readonly aliases: ReadonlyArray<string>;
  readonly target: McpConfigTarget;
  readonly serversPath: McpServersPath;
  readonly activationField: McpActivationField;
  readonly configuredConsumers: ReadonlyArray<string>;
}

/** A private copy of a servers path. */
const copyServersPath = ([first, ...rest]: McpServersPath): McpServersPath => [first, ...rest];

interface PreparedMcpRemovals {
  readonly groups: ReadonlyArray<PreparedMcpRemovalGroup>;
  readonly unresolved: ReadonlyArray<McpAgentTargetPlan>;
}

/**
 * Resolve the configured targets of a withdrawal and check each container
 * before any entry is selected: its readers, its shared writer, and its
 * current bytes against every co-reader. The facts are frozen, so one owner
 * may plan several selected entries from them.
 */
const prepareMcpRemovals = (
  agentIds: ReadonlyArray<string>,
  args: McpRemovalArgs,
  observed?: ObservedMcpWithdrawal["targets"],
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const targets =
      observed?.map(({ group, raw }) => ({ group, read: Effect.succeed(raw) })) ??
      (yield* resolveConfiguredMcpTargets({
        nativeDirectoryInputs: args.nativeDirectoryInputs,
        agentIds,
        workspaceRoot: args.workspaceRoot,
        scope: args.scope,
      })).map((group) => ({ group, read: readNativeMcpConfig(group.path) }));
    const groups = targets.map(({ group }) => group);
    const prepared: Array<PreparedMcpRemovalGroup> = [];
    for (const { group, read } of targets) {
      if (group.unverifiedReaders.length > 0)
        return yield* new McpSharedTargetConflict({ reason: group.unverifiedReaders.join("; ") });
      const consumers = group.members.filter((member) =>
        args.configuredConsumerIds === undefined
          ? member.configured
          : args.configuredConsumerIds.has(member.agentId),
      );
      // With no remaining consumers, withdrawal still needs one declared parser
      // for the selected container; potential readers do not add new constraints.
      const withdrawalWriter = [...group.members]
        .filter((member) => member.configured)
        .sort((left, right) => left.agentId.localeCompare(right.agentId))
        .slice(0, 1);
      const shared = resolveSharedMcpContainer({
        members: consumers.length > 0 ? consumers : withdrawalWriter,
        negotiateActivation: args.disableOnly,
      });
      if (shared._tag === "conflict")
        return yield* new McpSharedTargetConflict({ reason: shared.reason });
      const declaredTargets = group.members.map((member) => member.declaredTarget ?? member.target);
      const aliases = [
        ...new Set(
          declaredTargets.map((target) =>
            path.resolve(
              args.workspaceRoot,
              target.scope === "user" && target.path.startsWith("~/")
                ? target.path.slice(2)
                : target.path,
            ),
          ),
        ),
      ].sort();
      const raw = yield* read;
      yield* preflightNativeConfigReaders({
        nativeDirectoryInputs: args.nativeDirectoryInputs,
        workspaceRoot: args.workspaceRoot,
        scope: args.scope,
        physicalPath: group.path,
        configuredAgentIds:
          args.configuredConsumerIds === undefined ? agentIds : [...args.configuredConsumerIds],
        writerFormat: shared.target.format,
        raw: Option.getOrElse(raw, () => ""),
      });
      const configuredConsumers = shared.agentIds.filter(
        (agentId) =>
          agentIds.includes(agentId) &&
          (args.configuredConsumerIds === undefined || args.configuredConsumerIds.has(agentId)),
      );
      const serversPath = copyServersPath(shared.config.serversPath);
      Object.freeze(serversPath);
      prepared.push(
        Object.freeze({
          path: group.path,
          agentIds: Object.freeze(shared.agentIds.filter((agentId) => agentIds.includes(agentId))),
          configuredConsumers: Object.freeze(configuredConsumers),
          declaredTargets: Object.freeze(declaredTargets),
          aliases: Object.freeze(aliases),
          target: shared.target,
          serversPath,
          activationField: shared.config.activationField,
        }),
      );
    }
    return Object.freeze({
      groups: Object.freeze(prepared),
      unresolved: Object.freeze(
        agentIds.flatMap((agentId) => unresolvedMcpAgentTargets(agentId, args.scope, groups)),
      ),
    });
  });

/**
 * Plan withdrawing one selected entry from prepared containers. Each plan is
 * built afresh, and each declared route, render and co-reader check observes
 * live before any physical target is changed.
 */
const planPreparedMcpRemovals = (
  prepared: PreparedMcpRemovals,
  args: McpRemovalArgs,
  serverName: string,
) =>
  Effect.gen(function* () {
    const plans: Array<McpRemovalGroup> = prepared.groups.map((group) => ({
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      path: group.path,
      agentIds: [...group.agentIds],
      configuredConsumers: [...group.configuredConsumers],
      retained: [],
      declaredTargets: [...group.declaredTargets],
      removal: {
        workspaceRoot: args.workspaceRoot,
        serverNames: [serverName],
        serversPath: copyServersPath(group.serversPath),
        target: group.target,
        activationField: group.activationField,
        disableOnly: args.disableOnly,
        aliases: [...group.aliases],
      },
    }));
    // Every co-reader's common grammar and every outgoing entry is checked
    // before any physical target is changed.
    for (const plan of plans) {
      for (const declared of plan.declaredTargets) {
        if ((yield* resolveAgentMcpConfigTargetPath(args.workspaceRoot, declared)) !== plan.path)
          return yield* new McpConfigInvalid({
            detail: `MCP location changed before removal: ${declared.path}`,
          });
      }
      // One observation of this container serves its render and its co-reader check.
      yield* withNativeConfigObservationView(
        Effect.gen(function* () {
          const { raw, proposedRaw } = yield* renderAgentMcpConfigRemovals(plan.removal, plan.path);
          yield* preflightNativeConfigReaders({
            nativeDirectoryInputs: args.nativeDirectoryInputs,
            workspaceRoot: args.workspaceRoot,
            scope: args.scope,
            physicalPath: plan.path,
            configuredAgentIds: plan.configuredConsumers,
            writerFormat: plan.removal.target.format,
            raw,
            proposedRaw,
          });
        }),
      );
    }
    return { plans, unresolved: prepared.unresolved };
  });

const applyMcpRemovals = (
  agentIds: ReadonlyArray<string>,
  planned: {
    readonly plans: ReadonlyArray<McpRemovalGroup>;
    readonly unresolved: ReadonlyArray<McpAgentTargetPlan>;
  },
  dryRun: boolean,
) =>
  Effect.gen(function* () {
    const byAgent = new Map<string, Array<McpServerSyncTarget>>();
    for (const plan of planned.plans) {
      const changed: Array<McpServerSyncTarget> = [...plan.retained];
      for (const declared of plan.declaredTargets) {
        if (
          (yield* resolveAgentMcpConfigTargetPath(plan.removal.workspaceRoot, declared)) !==
          plan.path
        )
          return yield* new McpConfigInvalid({
            detail: `MCP location changed before removal: ${declared.path}`,
          });
      }
      const result = yield* removeAgentMcpConfigs({ ...plan.removal, dryRun });
      changed.push(
        ...(yield* describePhysicalConsumers({
          nativeDirectoryInputs: plan.nativeDirectoryInputs,
          workspaceRoot: plan.removal.workspaceRoot,
          scope: plan.removal.target.scope,
          physicalPath: plan.path,
          agentIds: plan.configuredConsumers,
          targets: result.targets,
        })),
      );
      for (const agentId of plan.agentIds) {
        const existing = byAgent.get(agentId) ?? [];
        byAgent.set(agentId, [...existing, ...changed]);
      }
    }
    return agentIds.map((agentId) =>
      mcpAgentSyncOutcome(
        planned.unresolved.filter((agent) => agent.agentId === agentId),
        byAgent.get(agentId) ?? [],
      ),
    );
  });

const manifestDeclaration = (args: {
  readonly distribution?: McpDistribution | undefined;
  readonly bindings?: ReadonlyArray<McpBinding> | undefined;
  readonly auth?: McpAuth | undefined;
  readonly enabled?: boolean | undefined;
}): McpServerDeclaration => ({
  kind: "configuration",
  distribution: args.distribution,
  bindings: args.bindings,
  auth: args.auth,
  enabled: args.enabled,
});

/** Refuse a manifest whose shared targets cannot hold one entry every reader accepts. */
export const validateManifestMcpServerTargets = (args: ValidateManifestMcpServerTargetsArgs) =>
  Effect.gen(function* () {
    const groups = yield* resolveConfiguredMcpTargets(args);
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        agentIds: args.agentIds,
        groups,
        scope: args.scope,
        serverName: args.serverName,
        declaration: manifestDeclaration(args),
        manifest: args.manifest,
        enabled: args.enabled,
      }),
    );
    yield* validatePlannedWrites(
      args.agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
  });

export interface ValidatePluginMcpServerTargetsArgs extends Omit<
  ValidateManifestMcpServerTargetsArgs,
  "manifest"
> {
  readonly source: string;
  readonly definition: PluginMcpDefinition;
}

/** Validate the selected native component with the same target plan used to write it. */
export const validatePluginMcpServerTargets = (args: ValidatePluginMcpServerTargetsArgs) =>
  Effect.gen(function* () {
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        groups: yield* resolveConfiguredMcpTargets(args),
        agentIds: args.agentIds,
        scope: args.scope,
        serverName: args.serverName,
        declaration: {
          kind: "sourced",
          source: args.source,
          ...(args.distribution === undefined ? {} : { distribution: args.distribution }),
          ...(args.bindings === undefined ? {} : { bindings: args.bindings }),
          ...(args.auth === undefined ? {} : { auth: args.auth }),
          enabled: args.enabled,
        },
        nativeDefinition: args.definition,
        enabled: args.enabled,
      }),
    );
    yield* validatePlannedWrites(
      args.agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
  });

export interface SyncPluginMcpServerArgs extends Omit<
  SyncManifestMcpServerArgs,
  "owner" | "resolvedVersion" | "manifest"
> {
  readonly source: string;
  readonly nativeComponent: NativeMcpComponent;
}

/** Project only a selected plugin connection, retaining its original package as content. */
export const syncPluginMcpServerToAgents = (args: SyncPluginMcpServerArgs) =>
  Effect.gen(function* () {
    if (args.agentIds.length === 0) return [];
    const definition = yield* readPluginMcpDefinition(args.canonicalPath, args.nativeComponent);
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        groups: yield* resolveConfiguredMcpTargets({ ...args, scope: args.scope ?? "project" }),
        agentIds: args.agentIds,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: {
          kind: "sourced",
          source: args.source,
          ...(args.distribution === undefined ? {} : { distribution: args.distribution }),
          ...(args.bindings === undefined ? {} : { bindings: args.bindings }),
          ...(args.auth === undefined ? {} : { auth: args.auth }),
          enabled: args.enabled ?? true,
        },
        nativeDefinition: definition,
        enabled: args.enabled ?? true,
      }),
    );
    const written = yield* applyPlannedWrites(
      args.agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
    return args.agentIds.map((agentId) =>
      mcpAgentSyncOutcome(
        plan.agents.filter((agent) => agent.agentId === agentId),
        written.get(agentId) ?? [],
      ),
    );
  });

/** Project one manifest-backed server while treating each shared file as one decision. */
export const syncManifestMcpServerToAgents = (
  args: SyncManifestMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    if (args.agentIds.length === 0) return [];
    const path = yield* Path.Path;
    const manifest =
      args.manifest ??
      (yield* decodeMcpServerManifestAt(
        path.join(args.canonicalPath, manifestFilenameForType("mcp-server")),
      ));
    const plan = yield* plannedTargets(
      planMcpServerTargets({
        groups: yield* resolveConfiguredMcpTargets({
          nativeDirectoryInputs: args.nativeDirectoryInputs,
          workspaceRoot: args.workspaceRoot,
          agentIds: args.agentIds,
          scope: args.scope ?? "project",
        }),
        agentIds: args.agentIds,
        scope: args.scope ?? "project",
        serverName: args.serverName,
        declaration: manifestDeclaration(args),
        manifest,
        enabled: args.enabled ?? true,
      }),
    );
    const written = yield* applyPlannedWrites(
      args.agentIds,
      args.workspaceRoot,
      args.serverName,
      plan.writes,
      args,
    );
    return args.agentIds.map((agentId): McpServerSyncOutcome => {
      const outcome = mcpAgentSyncOutcome(
        plan.agents.filter((agent) => agent.agentId === agentId),
        written.get(agentId) ?? [],
      );
      return outcome;
    });
  });

/**
 * Preview withdrawing a disabled connection's entries from the targets and
 * native bytes its inspection observed, instead of resolving and reading them
 * again. Every removal check still runs in order, and each container's render,
 * co-reader preflight, alias recheck and dry-run readback still observe live.
 */
export const previewMcpServerWithdrawal = (
  observed: ObservedMcpWithdrawal,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const args: McpRemovalArgs = {
      nativeDirectoryInputs: observed.nativeDirectoryInputs,
      workspaceRoot: observed.workspaceRoot,
      scope: observed.scope,
      disableOnly: true,
    };
    const prepared = yield* prepareMcpRemovals(observed.agentIds, args, observed.targets);
    const plans = yield* planPreparedMcpRemovals(prepared, args, observed.serverName);
    return yield* applyMcpRemovals(observed.agentIds, plans, true);
  });

/** Withdrawals of selected entries from the same configured agents and containers. */
export interface McpServerRemovals {
  /** Withdraw one selected entry after all configured physical consumers agree. */
  readonly remove: (
    serverName: string,
    options: { readonly dryRun: boolean },
  ) => Effect.Effect<
    ReadonlyArray<McpServerSyncOutcome>,
    CodingAgentFailure,
    FileSystem.FileSystem | Path.Path | NativeWriteAuthority
  >;
}

/**
 * Resolve and check the configured containers of one owner's withdrawals
 * once, then withdraw each selected entry from them in turn. Each withdrawal
 * still rechecks every declared route, renders and checks its co-readers
 * against the live container, and reads it back; the owner releases the
 * prepared facts when it returns.
 */
export const prepareMcpServerRemovals = (
  agentIds: ReadonlyArray<string>,
  args: Omit<RemoveMcpServerArgs, "serverName" | "dryRun">,
): Effect.Effect<McpServerRemovals, CodingAgentFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const removalArgs: McpRemovalArgs = {
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      workspaceRoot: args.workspaceRoot,
      scope: args.scope ?? "project",
      disableOnly: args.disableOnly ?? false,
    };
    const prepared = yield* prepareMcpRemovals(agentIds, removalArgs);
    return {
      remove: (serverName, options) =>
        Effect.gen(function* () {
          const plans = yield* planPreparedMcpRemovals(prepared, removalArgs, serverName);
          return yield* applyMcpRemovals(agentIds, plans, options.dryRun);
        }),
    };
  });

/** Withdraw one selected entry after all configured physical consumers agree. */
export const removeMcpServerFromAgents = (
  agentIds: ReadonlyArray<string>,
  args: RemoveMcpServerArgs,
): Effect.Effect<
  ReadonlyArray<McpServerSyncOutcome>,
  CodingAgentFailure,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.flatMap(prepareMcpServerRemovals(agentIds, args), (removals) =>
    removals.remove(args.serverName, { dryRun: args.dryRun === true }),
  );
