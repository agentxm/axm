/**
 * MCP projection facts: what each configured agent's native configuration
 * holds for one desired connection, judged against the entry the target plan
 * says it should hold, and what each answer means for the workspace.
 *
 * This is the one judge of MCP projection currency. Sync, `mcps list`,
 * `mcps show`, and activation all consume it from the desired-state graph;
 * none of them decides currency from a raw settings entry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import type * as PlatformError from "effect/PlatformError";
import { isNotFound, readFileStringIfPresent } from "@agentxm/host-primitives";
import {
  AGENTS,
  type McpConfigTarget,
  type NativeConfigReadLocation,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import type { McpInspectionError } from "./errors.js";
import type { ConfiguredAgentOutcome } from "../../operations/index.js";
import { CurrentWorkspaceReadPhase, type McpServerEntry } from "../../workspace-state/index.js";
import {
  withNativeConfigReadView,
  decodeMcpServerManifestAt,
  decodeMcpServerManifestRead,
  readPluginMcpDefinition,
  resolveConfiguredMcpTargets,
  resolveConfiguredMcpTargetAdmissions,
  mcpTargetAdmissionKey,
  observeNativeMcpTargets,
  readNativeMcpValues,
  McpDefinitionInvalid,
  McpConfigIoFailed,
  planMcpServerTargets,
  unresolvedMcpAgentTargets,
  readNativeMcpConfig,
  readNativeMcpEntry,
  resolveAgentMcpConfigTargetPath,
  type ExpectedAgentEntry,
  type McpAgentTargetPlan,
  type McpServerDeclaration,
  type NativeConfigObservationDiagnostic,
  type McpTargetGroup,
  type ObservedMcpWithdrawal,
} from "../../agent-adapters/index.js";
import {
  NativeResolutionRoot,
  combineNativeLocationOutcomes,
  resolveNativeReadLocation,
  type NativeDirectoryInputs,
  type NativeLocationOutcome,
} from "../../locations/index.js";
import { diffAgentEntry } from "./drift.js";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

type AgentMcpInspectionStatus =
  "unsupported" | "unverified" | "blocked" | "absent" | "match" | "drift";

export interface AgentMcpServerInspection {
  readonly agentId: string;
  readonly path: string;
  readonly absolutePath: string;
  readonly status: AgentMcpInspectionStatus;
  readonly fields: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
  readonly reason?: string;
  readonly expected?: Readonly<Record<string, unknown>>;
  readonly actual?: Readonly<Record<string, unknown>>;
}

/** The desired-state facts an inspection reads for one MCP connection. */
interface DesiredMcpServerSubject {
  readonly name: string;
  readonly enabled?: boolean;
  /** Absent means sourced: the graph marks only inline nodes. */
  readonly authority?: "inline" | "sourced" | undefined;
}

export interface InspectDesiredMcpServerArgs {
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
  readonly node: DesiredMcpServerSubject;
  /**
   * The settings entry under the node's name: the inline transport, or the
   * preferences a sourced or Pack-supplied connection is configured with. Absent for
   * a Pack member the workspace has not configured.
   */
  readonly entry: McpServerEntry | undefined;
  /** Canonical roots a sourced connection's manifest may live under. */
  readonly canonicalPaths: ReadonlyArray<string>;
  /** `projected` reports the expected entries without reading disk; `current` reads them back. */
  readonly state?: "projected" | "current";
}

export interface DesiredMcpServerInspection {
  readonly inspections: ReadonlyArray<AgentMcpServerInspection>;
  readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
  /** The inspections restated in the workspace's per-agent outcome vocabulary. */
  readonly outcomes: ReadonlyArray<ConfiguredAgentOutcome>;
  /** Every configured agent either holds the expected entry or cannot represent it. */
  readonly current: boolean;
  /** Internal source-probe evidence. Public outcomes use only the owned safe reason. */
  readonly sourceDiagnostics?: ReadonlyArray<McpConfigIoFailed>;
  /**
   * The shared-target conflict that blocks a group of readers, when one does:
   * the connection has no native shape every reader of that file accepts, so
   * no write can make it current. Callers that plan writes refuse on it.
   */
  readonly conflict: Option.Option<string>;
}

interface NativeAgentMcpServer {
  readonly ownership: "declared" | "unowned";
  readonly agentId: string;
  readonly serverName: string;
  readonly keyPath: readonly [string, ...string[]];
  readonly path: string;
  readonly absolutePath: string;
  readonly target: McpConfigTarget;
}

export interface CollectNativeAgentMcpServersArgs {
  readonly declaredMcpNames: ReadonlySet<string>;
  readonly workspaceRoot: string;
  readonly nativeDirectoryInputs: NativeDirectoryInputs;
  readonly scope: "project" | "user";
  readonly agentIds: ReadonlyArray<string>;
}

export interface NativeAgentMcpInventory {
  readonly servers: ReadonlyArray<NativeAgentMcpServer>;
  readonly diagnostics: ReadonlyArray<NativeConfigObservationDiagnostic>;
}

type McpInspectionExpectation = ExpectedAgentEntry;

/** What an inspection status means as a configured-agent outcome. */
const mcpInspectionOutcome = (args: {
  readonly name: string;
  readonly inspection: AgentMcpServerInspection;
  readonly state: "projected" | "current";
}): ConfiguredAgentOutcome => {
  const { inspection } = args;
  return {
    extensionType: "mcp-server",
    name: args.name,
    agentId: inspection.agentId,
    outcome:
      inspection.status === "match"
        ? args.state
        : inspection.status === "unsupported"
          ? "unsupported"
          : inspection.status === "blocked" || inspection.status === "unverified"
            ? "blocked"
            : "failed",
    reasonCode:
      inspection.status === "match"
        ? "supported"
        : inspection.status === "absent"
          ? "projection-missing"
          : inspection.status === "drift"
            ? "stale-projection"
            : `mcp-${inspection.status}`,
    reason:
      inspection.reason ??
      (inspection.status === "match"
        ? `${inspection.agentId} has a matching MCP projection.`
        : inspection.status === "absent"
          ? `The expected ${inspection.agentId} projection is missing.`
          : inspection.status === "drift"
            ? `The expected ${inspection.agentId} projection is stale${
                inspection.fields.length === 0 ? "" : ` (${inspection.fields.join(", ")})`
              }.`
            : `MCP projection status is ${inspection.status}.`),
    ...(inspection.path.length === 0 ? {} : { path: inspection.path }),
  };
};

/** A connection is current when every agent matches or cannot represent it. */
const mcpInspectionsCurrent = (inspections: ReadonlyArray<AgentMcpServerInspection>): boolean =>
  inspections.every(
    (inspection) => inspection.status === "match" || inspection.status === "unsupported",
  );

const inspectActual = (args: {
  readonly target: McpConfigTarget;
  readonly configPath: string;
  /** The native file at `configPath`, absent as none. */
  readonly read: Effect.Effect<Option.Option<string>, McpInspectionError, FileSystem.FileSystem>;
  readonly serversPath: ReadonlyArray<string>;
  readonly serverName: string;
  readonly expected: McpInspectionExpectation;
}): Effect.Effect<
  {
    readonly status: Exclude<AgentMcpInspectionStatus, "unsupported" | "unverified" | "blocked">;
    readonly fields: ReadonlyArray<string>;
    readonly actual?: Readonly<Record<string, unknown>>;
  },
  McpInspectionError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const raw = yield* args.read;
    if (Option.isNone(raw)) return { status: "absent", fields: [] };

    const actual = yield* readNativeMcpEntry({
      format: args.target.format,
      configPath: args.configPath,
      raw: raw.value,
      serversPath: args.serversPath,
      serverName: args.serverName,
    });
    if (Option.isNone(actual)) return { status: "absent", fields: [] };
    const drift = diffAgentEntry(args.expected, actual.value);
    if (drift._tag === "match") return { status: "match", fields: [], actual: actual.value };
    if (drift._tag === "drift") {
      return { status: "drift", fields: drift.fields, actual: actual.value };
    }
    return { status: "absent", fields: [] };
  });

const terminalInspection = (args: {
  readonly agentId: string;
  readonly status: "unsupported" | "unverified" | "blocked";
  readonly reason: string;
  readonly target?: McpConfigTarget | undefined;
  readonly absolutePath?: string;
  readonly warnings?: ReadonlyArray<string>;
  readonly expected?: Readonly<Record<string, unknown>>;
}): AgentMcpServerInspection => ({
  agentId: args.agentId,
  path: args.target?.path ?? "",
  absolutePath: args.absolutePath ?? "",
  status: args.status,
  fields: [],
  warnings: args.warnings ?? [],
  reason: args.reason,
  ...(args.expected === undefined ? {} : { expected: args.expected }),
});

/**
 * Resolves the configured targets one inspection plans against, with the
 * admission key of every writer target its own resolution admitted live.
 * Targets that another resolution admitted carry no keys.
 */
type InspectionTargetResolver = (
  args: InspectDesiredMcpServerArgs,
) => ReturnType<typeof resolveConfiguredMcpTargetAdmissions>;

const resolveInspectionTargets: InspectionTargetResolver = (args) =>
  resolveConfiguredMcpTargetAdmissions(args);

/**
 * Re-admitting a physical target its resolution just admitted under the same
 * scope and native root yields that same path, so only a target without such
 * an admission in this inspection is admitted again.
 */
const absolutePathFor = (
  workspaceRoot: string,
  target: McpConfigTarget | undefined,
  admitted: ReadonlyArray<string>,
): Effect.Effect<string, McpInspectionError, FileSystem.FileSystem | Path.Path> => {
  if (target === undefined) return Effect.succeed("");
  const key = mcpTargetAdmissionKey(target);
  return key !== undefined && admitted.includes(key)
    ? Effect.succeed(target.path)
    : resolveAgentMcpConfigTargetPath(workspaceRoot, target);
};

/** One lazy read per projected native file, shared by the agents of one inspection. */
type InspectionReads = ReadonlyArray<{
  readonly path: string;
  readonly read: Effect.Effect<Option.Option<string>, McpInspectionError, FileSystem.FileSystem>;
}>;

const inspectPlannedAgent = (
  args: InspectDesiredMcpServerArgs,
  agent: McpAgentTargetPlan,
  admitted: ReadonlyArray<string>,
  reads: InspectionReads,
): Effect.Effect<AgentMcpServerInspection, McpInspectionError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const absolutePath = yield* absolutePathFor(args.workspaceRoot, agent.target, admitted);
    switch (agent._tag) {
      case "unsupported":
      case "nothing-runnable":
        return terminalInspection({
          agentId: agent.agentId,
          status: "unsupported",
          reason: agent.reason,
          target: agent.target,
          absolutePath,
        });
      case "unverified":
      case "blocked":
        return terminalInspection({
          agentId: agent.agentId,
          status: agent._tag,
          reason: agent.reason,
          target: agent.target,
          absolutePath,
        });
      case "needs-input":
        return terminalInspection({
          agentId: agent.agentId,
          status: "blocked",
          reason: agent.warnings.join("; "),
          target: agent.target,
          absolutePath,
          warnings: agent.warnings,
          expected: agent.entry,
        });
      case "projected": {
        if (args.state === "projected") {
          return {
            agentId: agent.agentId,
            path: agent.target.path,
            absolutePath,
            status: "match",
            fields: [],
            warnings: agent.warnings,
            expected: agent.entry,
          };
        }
        const actual = yield* inspectActual({
          target: agent.target,
          configPath: absolutePath,
          read:
            reads.find((shared) => shared.path === absolutePath)?.read ??
            readNativeMcpConfig(absolutePath),
          serversPath: agent.config.serversPath,
          serverName: args.node.name,
          expected: { _tag: "projected", entry: agent.entry, warnings: agent.warnings },
        });
        return {
          agentId: agent.agentId,
          path: agent.target.path,
          absolutePath,
          status: actual.status,
          fields: actual.fields,
          warnings: agent.warnings,
          expected: agent.entry,
          ...(actual.actual === undefined ? {} : { actual: actual.actual }),
        };
      }
    }
  });

/** Without a source manifest, native presence cannot prove projected currency. */
const inspectUnavailableSource = (
  args: InspectDesiredMcpServerArgs,
  probeFailed: boolean,
  resolveTargets: InspectionTargetResolver,
) =>
  resolveTargets(args).pipe(
    Effect.map(({ groups }) =>
      args.agentIds.flatMap((agentId) => {
        const unresolved = unresolvedMcpAgentTargets(agentId, args.scope, groups);
        return [
          ...unresolved.map((target) =>
            terminalInspection({ agentId, status: target._tag, reason: target.reason }),
          ),
          ...groups.flatMap((group) =>
            group.members
              .filter((member) => member.agentId === agentId)
              .map((member) =>
                terminalInspection({
                  agentId,
                  status: "unverified",
                  reason: probeFailed
                    ? "The canonical MCP manifest could not be inspected; expected native values cannot be verified."
                    : "The canonical MCP manifest is unavailable; expected native values cannot be verified.",
                  target: member.target,
                }),
              ),
          ),
        ];
      }),
    ),
  );

/**
 * Every agent's declared native MCP configuration file in this scope. An
 * inventory row lists these beside a connection's package root; each names a
 * configuration file, not a directory that could hold a package manifest.
 */
const declaredMcpConfigurationFiles = (
  path: Path.Path,
  args: Pick<InspectDesiredMcpServerArgs, "workspaceRoot" | "scope" | "nativeDirectoryInputs">,
): ReadonlySet<string> =>
  new Set(
    AGENTS.flatMap((agent) => {
      const native = agent.capabilities["mcp-server"].native;
      if (!("locations" in native)) return [];
      const locations: ReadonlyArray<NativeConfigReadLocation> = native.locations;
      return locations.flatMap((location) => {
        const resolved = resolveNativeReadLocation(
          path,
          agent.id,
          location,
          args,
          args.nativeDirectoryInputs,
          { includeConditional: true },
        );
        return resolved === undefined ? [] : [resolved.path];
      });
    }),
  );

/**
 * The first canonical root holding an MCP manifest. When the caller decodes
 * that manifest, the read that finds it also supplies its text: absence moves
 * on, and only a read failing for another reason is followed by the existence
 * probe, which decides between moving on and carrying that failure to the
 * decode. Otherwise the probe alone selects the root, as it also does for a
 * candidate that is an agent's declared native configuration file, whose read
 * could only fail before the same probe.
 */
const findManifestRoot = Effect.fnUntraced(function* (
  args: Pick<InspectDesiredMcpServerArgs, "workspaceRoot" | "scope" | "nativeDirectoryInputs">,
  canonicalPaths: ReadonlyArray<string>,
  readManifest: boolean,
): Effect.fn.Return<
  {
    readonly root: Option.Option<string>;
    readonly manifest: Option.Option<Result.Result<string, PlatformError.PlatformError>>;
    readonly diagnostics: ReadonlyArray<McpConfigIoFailed>;
  },
  never,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const diagnostics: McpConfigIoFailed[] = [];
  const configurationFiles = readManifest
    ? declaredMcpConfigurationFiles(path, args)
    : new Set<string>();
  for (const candidate of canonicalPaths) {
    const resolved = path.resolve(args.workspaceRoot, candidate);
    const manifestPath = path.join(resolved, manifestFilenameForType("mcp-server"));
    const read =
      readManifest && !configurationFiles.has(resolved)
        ? yield* readFileStringIfPresent(fs, manifestPath).pipe(Effect.result)
        : undefined;
    if (read !== undefined && Result.isSuccess(read)) {
      if (Option.isNone(read.success)) continue;
      return {
        root: Option.some(resolved),
        manifest: Option.some(Result.succeed(read.success.value)),
        diagnostics,
      };
    }
    const exists = yield* fs.exists(manifestPath).pipe(Effect.result);
    if (Result.isFailure(exists)) {
      if (!isNotFound(exists.failure))
        diagnostics.push(
          new McpConfigIoFailed({
            detail: `Failed to inspect MCP server manifest: ${manifestPath}`,
            cause: exists.failure,
          }),
        );
      continue;
    }
    if (exists.success)
      return {
        root: Option.some(resolved),
        manifest: read === undefined ? Option.none() : Option.some(Result.fail(read.failure)),
        diagnostics,
      };
  }
  return { root: Option.none(), manifest: Option.none(), diagnostics };
});

/** The declaration an inspection renders: the entry as it would be projected when enabled. */
const inspectedDeclaration = (
  node: DesiredMcpServerSubject,
  entry: McpServerEntry | undefined,
): McpServerDeclaration | undefined => {
  if (entry !== undefined) return { ...entry, enabled: true };
  return node.authority === "inline" ? undefined : { kind: "configuration", enabled: true };
};

/**
 * Disabled declarations select withdrawal without depending on runnable
 * source content. The inspection also yields what it observed of each
 * target's native file, for the withdrawal it selects.
 */
const inspectDisabledMcpServer = (
  args: InspectDesiredMcpServerArgs,
  resolveTargets: InspectionTargetResolver,
) =>
  Effect.gen(function* () {
    const { groups } = yield* resolveTargets(args);
    const targets: Array<ObservedMcpWithdrawal["targets"][number]> = [];
    const inspections: AgentMcpServerInspection[] = [];
    const nativeLocations: NativeLocationOutcome[] = [];
    for (const agentId of args.agentIds) {
      inspections.push(
        ...unresolvedMcpAgentTargets(agentId, args.scope, groups).map((target) =>
          terminalInspection({ agentId, status: target._tag, reason: target.reason }),
        ),
      );
    }
    for (const group of groups) {
      const raw = yield* readNativeMcpConfig(group.path);
      targets.push({ group, raw });
      for (const member of group.members.filter((member) => member.configured)) {
        const actual = Option.isNone(raw)
          ? Option.none<Readonly<Record<string, unknown>>>()
          : yield* readNativeMcpEntry({
              format: member.target.format,
              configPath: group.path,
              raw: raw.value,
              serversPath: member.config.serversPath,
              serverName: args.node.name,
            });
        const activation = member.config.activationField.required;
        const absent = Option.isNone(actual);
        const disabled =
          absent || (activation !== null && actual.value[activation.name] === activation.disabled);
        inspections.push({
          agentId: member.agentId,
          path: member.target.path,
          absolutePath: group.path,
          status: disabled ? "match" : "drift",
          fields: disabled ? [] : ["activation"],
          warnings: [],
          reason: disabled
            ? "The declared MCP connection is absent or disabled."
            : "The declared disabled MCP connection is still active.",
          ...(Option.isSome(actual) ? { actual: actual.value } : {}),
        });
        if (absent) continue;
        nativeLocations.push({
          scope: args.scope,
          address: {
            kind: "key-path",
            path: group.path,
            keys: [...member.config.serversPath, args.node.name],
          },
          aliases: [],
          configuredConsumers: [member.agentId],
          potentialReaders: group.members
            .filter((reader) => !reader.configured)
            .map((reader) => reader.agentId),
          policyReasons: [],
          ownership: "declared",
          proof: "effective-native-declaration",
          state: disabled ? "unchanged" : activation === null ? "removed" : "updated",
          mechanism: "structured-entry",
          availability: [
            {
              agentId: member.agentId,
              state: "unverified",
              reason: "Native configuration is observed; host execution is unverified.",
            },
          ],
        });
      }
    }
    const inspection: DesiredMcpServerInspection = {
      inspections,
      nativeLocations: combineNativeLocationOutcomes(nativeLocations),
      outcomes: inspections.map((inspection) =>
        mcpInspectionOutcome({ name: args.node.name, inspection, state: args.state ?? "current" }),
      ),
      current: mcpInspectionsCurrent(inspections),
      conflict: Option.none<string>(),
    };
    const withdrawal: ObservedMcpWithdrawal = {
      workspaceRoot: args.workspaceRoot,
      nativeDirectoryInputs: args.nativeDirectoryInputs,
      scope: args.scope,
      agentIds: args.agentIds,
      serverName: args.node.name,
      targets: Object.freeze(targets),
    };
    return { inspection, withdrawal };
  });

/** One inspection and, for a disabled connection, what its withdrawal may plan from. */
interface ObservedDesiredMcpServer {
  readonly inspection: DesiredMcpServerInspection;
  readonly withdrawal: ObservedMcpWithdrawal | undefined;
}

/**
 * Inspect one desired MCP connection on every configured agent.
 *
 * The expected entries come from the target plan the writer also renders
 * from, so a currency judgment and a write never disagree about what an
 * agent should hold.
 */
const observeDesiredMcpServer = (
  args: InspectDesiredMcpServerArgs,
  resolveTargets: InspectionTargetResolver,
): Effect.Effect<
  ObservedDesiredMcpServer,
  McpInspectionError,
  FileSystem.FileSystem | Path.Path
> =>
  args.node.enabled === false
    ? inspectDisabledMcpServer(args, resolveTargets)
    : Effect.map(inspectEnabledMcpServer(args, resolveTargets), (inspection) => ({
        inspection,
        withdrawal: undefined,
      }));

const inspectEnabledMcpServer = (
  args: InspectDesiredMcpServerArgs,
  resolveTargets: InspectionTargetResolver,
): Effect.Effect<
  DesiredMcpServerInspection,
  McpInspectionError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const state = args.state ?? "current";
    const declaration = inspectedDeclaration(args.node, args.entry);
    if (declaration === undefined) {
      return yield* new McpDefinitionInvalid({
        detail: `Inline MCP server ${args.node.name} has no settings entry to render`,
      });
    }
    const inline = declaration.connection !== undefined;
    const nativeComponent = args.entry?.kind === "sourced" ? args.entry.nativeComponent : undefined;
    const source = inline
      ? { root: Option.none<string>(), manifest: Option.none(), diagnostics: [] }
      : yield* findManifestRoot(args, args.canonicalPaths, nativeComponent === undefined);
    const manifestRoot = source.root;
    const observed = yield* Effect.gen(function* () {
      if (!inline && Option.isNone(manifestRoot))
        return {
          inspections: yield* inspectUnavailableSource(
            args,
            source.diagnostics.length > 0,
            resolveTargets,
          ),
          nativeLocations: [],
          conflict: Option.none<string>(),
        };
      const path = yield* Path.Path;
      const nativeDefinition =
        nativeComponent === undefined || Option.isNone(manifestRoot)
          ? undefined
          : yield* readPluginMcpDefinition(manifestRoot.value, nativeComponent);
      const manifest =
        Option.isNone(manifestRoot) || nativeComponent !== undefined
          ? undefined
          : yield* Option.match(source.manifest, {
              onNone: () =>
                decodeMcpServerManifestAt(
                  path.join(manifestRoot.value, manifestFilenameForType("mcp-server")),
                ),
              onSome: (read) =>
                decodeMcpServerManifestRead(
                  path.join(manifestRoot.value, manifestFilenameForType("mcp-server")),
                  Effect.fromResult(read),
                ),
            });
      const { groups, admitted } = yield* resolveTargets(args);
      const plan = planMcpServerTargets({
        groups,
        agentIds: args.agentIds,
        scope: args.scope,
        serverName: args.node.name,
        declaration,
        manifest,
        ...(nativeDefinition === undefined ? {} : { nativeDefinition }),
        resolvedCwd:
          declaration.connection?.transport === "stdio" &&
          declaration.connection.cwd?.base === "scope"
            ? path.resolve(args.workspaceRoot, declaration.connection.cwd.path)
            : undefined,
        enabled: true,
      });
      if (plan._tag === "invalid") {
        return {
          inspections: args.agentIds.map((agentId) =>
            terminalInspection({ agentId, status: "blocked", reason: plan.detail }),
          ),
          nativeLocations: [],
          conflict: Option.some(plan.detail),
        };
      }
      const conflict = Option.fromUndefinedOr(
        plan.agents.flatMap((agent) => (agent._tag === "blocked" ? [agent.reason] : []))[0],
      );
      // Agents that share a native file judge it from one read, each in its own order.
      const reads: InspectionReads =
        state === "projected"
          ? []
          : Object.freeze(
              yield* Effect.forEach(
                [
                  ...new Set(
                    plan.agents.flatMap((agent) =>
                      agent._tag === "projected" ? [agent.target.path] : [],
                    ),
                  ),
                ],
                (path) =>
                  Effect.map(Effect.cached(readNativeMcpConfig(path)), (read) =>
                    Object.freeze({ path, read }),
                  ),
              ),
            );
      const inspections = yield* Effect.forEach(
        plan.agents,
        (agent) => inspectPlannedAgent(args, agent, admitted, reads),
        {
          concurrency: 16,
        },
      );
      const nativeLocations = combineNativeLocationOutcomes(
        plan.writes.map((write): NativeLocationOutcome => {
          const members = inspections.filter(
            (inspection) => inspection.absolutePath === write.path,
          );
          const absent =
            members.length > 0 && members.every((inspection) => inspection.status === "absent");
          const current =
            members.length > 0 && members.every((inspection) => inspection.status === "match");
          const blocked = members.some((inspection) => inspection.status === "blocked");
          return {
            scope: args.scope,
            address: {
              kind: "key-path",
              path: write.path,
              keys: [...write.config.serversPath, args.node.name],
            },
            aliases: [
              ...new Set(
                write.declaredTargets.map((target) =>
                  path.resolve(
                    args.workspaceRoot,
                    target.scope === "user" && target.path.startsWith("~/")
                      ? target.path.slice(2)
                      : target.path,
                  ),
                ),
              ),
            ].sort(),
            configuredConsumers: [...new Set(write.agentIds)].sort(),
            potentialReaders: [
              ...new Set(
                groups
                  .filter((group) => group.path === write.path)
                  .flatMap((group) =>
                    group.members
                      .filter((member) => !member.configured)
                      .map((member) => member.agentId),
                  ),
              ),
            ].sort(),
            policyReasons: [],
            ownership: "declared",
            proof: "effective-native-declaration",
            state: blocked ? "blocked" : absent ? "created" : current ? "unchanged" : "updated",
            reason: current
              ? "Decoded native entry matches the declaration."
              : absent
                ? "Create the complete declared native entry."
                : `Replace the complete native entry; differing fields: ${[...new Set(members.flatMap((member) => member.fields))].sort().join(", ")}.`,
            mechanism: "structured-entry",
            availability: write.agentIds.map((agentId) => ({
              agentId,
              state: "unverified",
              reason:
                "Planned native reconciliation has not been applied; agent configuration selection is not observed",
            })),
          };
        }),
      );
      return { inspections, nativeLocations, conflict };
    });
    return {
      ...observed,
      ...(source.diagnostics.length === 0 ? {} : { sourceDiagnostics: source.diagnostics }),
      outcomes: observed.inspections.map((inspection) =>
        mcpInspectionOutcome({ name: args.node.name, inspection, state }),
      ),
      current: mcpInspectionsCurrent(observed.inspections),
    };
  });

/** Every native entry, classified against effective declarations, by agent. */
export const collectNativeAgentMcpServers = (
  args: CollectNativeAgentMcpServersArgs,
): Effect.Effect<NativeAgentMcpInventory, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const targets = yield* observeNativeMcpTargets(args);
    const perGroup = yield* Effect.forEach(
      targets.groups,
      (group) =>
        Effect.gen(function* () {
          const absolutePath = group.path;
          const diagnostics: Array<NativeConfigObservationDiagnostic> = [];
          const members = group.members.filter((member) => member.configured);
          const context = {
            extensionType: "mcp-server" as const,
            aliases: [
              ...new Set(
                members.map((member) => member.declaredTarget?.path ?? member.target.path),
              ),
            ].sort(),
            claimantAgentIds: [...new Set(members.map((member) => member.agentId))].sort(),
          };
          const read = yield* readFileStringIfPresent(fs, absolutePath).pipe(Effect.result);
          if (Result.isFailure(read))
            return {
              servers: [],
              diagnostics: [
                {
                  ...context,
                  address: { kind: "file", path: absolutePath },
                  stage: "read",
                  cause: read.failure,
                },
              ],
            } satisfies NativeAgentMcpInventory;
          const raw = read.success;
          if (Option.isNone(raw)) return { servers: [], diagnostics };
          const containers = new Map<string, Array<McpTargetGroup["members"][number]>>();
          const results: Array<NativeAgentMcpServer> = [];
          for (const member of members) {
            const key = JSON.stringify([member.target.format, member.config.serversPath]);
            const container = containers.get(key) ?? [];
            container.push(member);
            containers.set(key, container);
          }
          for (const container of containers.values()) {
            const first = container[0];
            if (first === undefined) continue;
            const values = yield* readNativeMcpValues({
              format: first.target.format,
              configPath: absolutePath,
              raw: raw.value,
              serversPath: first.config.serversPath,
            }).pipe(Effect.result);
            if (Result.isFailure(values)) {
              diagnostics.push({
                extensionType: "mcp-server",
                address: { kind: "key-path", path: absolutePath, keys: first.config.serversPath },
                aliases: [
                  ...new Set(
                    container.map((member) => member.declaredTarget?.path ?? member.target.path),
                  ),
                ].sort(),
                claimantAgentIds: [...new Set(container.map((member) => member.agentId))].sort(),
                stage: "decode",
                cause: values.failure,
              });
              continue;
            }
            for (const member of container)
              for (const serverName of Object.keys(values.success)) {
                if (
                  results.some(
                    (result) =>
                      result.agentId === member.agentId &&
                      result.serverName === serverName &&
                      JSON.stringify(result.keyPath) ===
                        JSON.stringify([...member.config.serversPath, serverName]) &&
                      result.target.format === member.target.format &&
                      result.target.path === member.target.path,
                  )
                )
                  continue;
                results.push({
                  ownership: args.declaredMcpNames.has(serverName) ? "declared" : "unowned",
                  agentId: member.agentId,
                  serverName,
                  keyPath: [...member.config.serversPath, serverName],
                  path: member.target.path,
                  absolutePath,
                  target: member.target,
                });
              }
          }
          return { servers: results, diagnostics };
        }),
      { concurrency: 16 },
    );
    return {
      servers: perGroup.flatMap((group) => group.servers),
      diagnostics: [...targets.diagnostics, ...perGroup.flatMap((group) => group.diagnostics)],
    };
  });

type InspectDesiredMcpServer = (
  args: InspectDesiredMcpServerArgs,
) => Effect.Effect<
  DesiredMcpServerInspection,
  McpInspectionError,
  FileSystem.FileSystem | Path.Path
>;

class McpInspectionReadView extends Context.Service<
  McpInspectionReadView,
  {
    readonly observe: (
      args: InspectDesiredMcpServerArgs,
    ) => Effect.Effect<
      ObservedDesiredMcpServer,
      McpInspectionError,
      FileSystem.FileSystem | Path.Path
    >;
    readonly phase: Effect.Success<typeof CurrentWorkspaceReadPhase>;
    readonly isActive: () => boolean;
    readonly close: () => void;
  }
>()("@agentxm/workspace-kernel/projection/McpInspectionReadView") {}

/** Native document payloads belong to each consumer, not to the reusable observation. */
const copyMcpInspection = (value: DesiredMcpServerInspection): DesiredMcpServerInspection => ({
  ...value,
  inspections: structuredClone(value.inspections),
  nativeLocations: structuredClone(value.nativeLocations),
  outcomes: structuredClone(value.outcomes),
  conflict: Option.map(value.conflict, (message) => message),
  ...(value.sourceDiagnostics === undefined
    ? {}
    : { sourceDiagnostics: [...value.sourceDiagnostics] }),
});

/** Each withdrawal owns its targets; the native bytes are immutable strings. */
const copyMcpWithdrawal = (value: ObservedMcpWithdrawal): ObservedMcpWithdrawal => ({
  ...value,
  nativeDirectoryInputs: structuredClone(value.nativeDirectoryInputs),
  agentIds: [...value.agentIds],
  targets: value.targets.map(({ group, raw }) => ({
    group: structuredClone(group),
    raw: Option.map(raw, (text) => text),
  })),
});

/** Share detailed MCP observations only for the duration of one read phase. */
export const withMcpInspectionReadView = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const phase = yield* CurrentWorkspaceReadPhase;
    const inherited = yield* Effect.serviceOption(McpInspectionReadView);
    if (Option.isSome(inherited)) {
      if (inherited.value.isActive() && inherited.value.phase === phase) return yield* effect;
      inherited.value.close();
    }
    const cells = new Map<string, ReturnType<typeof observeDesiredMcpServer>>();
    const targetCells = new Map<
      string,
      {
        readonly fs: FileSystem.FileSystem;
        readonly path: Path.Path;
        readonly groups: ReturnType<typeof resolveConfiguredMcpTargets>;
      }
    >();
    let active = true;
    const isActive = () => active && (phase === undefined || phase.isActive());
    const close = () => {
      active = false;
      cells.clear();
      targetCells.clear();
    };
    // Configured targets do not depend on the connection, so every inspection
    // in the phase plans against one resolution, each with its own copy.
    // Admissions made by another inspection's resolution are not this
    // inspection's own, so they carry no admission keys.
    const resolveTargets: InspectionTargetResolver = (args) =>
      Effect.gen(function* () {
        if (!isActive() || (yield* CurrentWorkspaceReadPhase) !== phase)
          return yield* resolveConfiguredMcpTargetAdmissions(args);
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const targetArgs = {
          workspaceRoot: args.workspaceRoot,
          scope: args.scope,
          agentIds: args.agentIds,
          nativeDirectoryInputs: args.nativeDirectoryInputs,
        };
        const key = JSON.stringify({
          ...targetArgs,
          nativeResolutionRoot: (yield* NativeResolutionRoot) ?? null,
        });
        const previous = targetCells.get(key);
        // A consumer observing through another file system resolves live.
        if (previous !== undefined && (previous.fs !== fs || previous.path !== path))
          return yield* resolveConfiguredMcpTargetAdmissions(args);
        const groups =
          previous?.groups ?? (yield* Effect.cached(resolveConfiguredMcpTargets(targetArgs)));
        if (previous === undefined && isActive()) targetCells.set(key, { fs, path, groups });
        return { groups: structuredClone(yield* groups), admitted: Object.freeze([]) };
      });
    const observe = (args: InspectDesiredMcpServerArgs) =>
      Effect.gen(function* () {
        if (!isActive() || (yield* CurrentWorkspaceReadPhase) !== phase)
          return yield* observeDesiredMcpServer(args, resolveInspectionTargets);
        const key = JSON.stringify({
          nativeDirectoryInputs: args.nativeDirectoryInputs,
          workspaceRoot: args.workspaceRoot,
          scope: args.scope,
          agentIds: args.agentIds,
          node: args.node,
          entry: args.entry,
          canonicalPaths: args.canonicalPaths,
          state: args.state ?? "current",
        });
        const previous = cells.get(key);
        if (previous !== undefined) return yield* previous;
        const cell = yield* Effect.cached(observeDesiredMcpServer(args, resolveTargets));
        const selected = cells.get(key) ?? cell;
        if (isActive()) cells.set(key, selected);
        return yield* selected;
      });
    return yield* withNativeConfigReadView(
      effect.pipe(
        Effect.provideService(McpInspectionReadView, { observe, phase, isActive, close }),
      ),
    ).pipe(Effect.ensuring(Effect.sync(close)));
  });

/** Use the phase's detailed observation when one is explicitly in scope. */
export const inspectDesiredMcpServer: InspectDesiredMcpServer = (args) =>
  Effect.gen(function* () {
    const view = yield* Effect.serviceOption(McpInspectionReadView);
    return Option.isSome(view)
      ? copyMcpInspection((yield* view.value.observe(args)).inspection)
      : (yield* observeDesiredMcpServer(args, resolveInspectionTargets)).inspection;
  });

/**
 * Inspect a disabled connection as `inspectDesiredMcpServer` does, with what
 * the inspection observed of each configured target's native file. The
 * withdrawal copy is made only when it is requested, so a current inspection
 * copies nothing.
 */
export const inspectDisabledMcpServerForWithdrawal = (
  args: InspectDesiredMcpServerArgs & {
    readonly node: DesiredMcpServerSubject & { readonly enabled: false };
  },
) =>
  Effect.gen(function* () {
    const view = yield* Effect.serviceOption(McpInspectionReadView);
    const observed = Option.isSome(view)
      ? yield* view.value.observe(args)
      : yield* observeDesiredMcpServer(args, resolveInspectionTargets);
    const withdrawal = observed.withdrawal;
    // The observation of a disabled connection is always its disabled inspection.
    if (withdrawal === undefined)
      return yield* Effect.die(`MCP connection ${args.node.name} was not inspected as disabled`);
    return {
      inspection: Option.isSome(view)
        ? copyMcpInspection(observed.inspection)
        : observed.inspection,
      withdrawal: Effect.sync(() => copyMcpWithdrawal(withdrawal)),
    };
  });
