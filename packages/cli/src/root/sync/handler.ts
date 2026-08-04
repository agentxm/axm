/**
 * Handler for `axm sync`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as semver from "semver";
import {
  CodingAgentRepository,
  getInstructionsGitignoreStatus,
  getInstructionsStatus,
  pruneManagedMcpServersForAgent,
  resolveInstructionsConfig,
  syncInlineMcpServerToAgents,
  syncInstructionTarget,
  syncInstructionsGitignore,
  type CodingAgentRepositoryService,
} from "@agentxm/client-core/unstable/agents";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import {
  buildMaterializeOperation,
  enabledConfiguredEntries,
  isConfiguredEntryEnabled,
  sanitizeName,
  parseExtensionFqnParts,
  targetFromRef,
  toStepKey,
  type ExtensionRef,
  type ExtensionType,
} from "@agentxm/client-core/unstable/extensions";
import {
  SkillManager,
  skillArtifactFromTargets,
  type SkillExtensionRef,
} from "@agentxm/client-core/unstable/skills";
import {
  inspectMcpServerAcrossAgents,
  installMcpServer,
  McpServerManager,
} from "@agentxm/client-core/unstable/mcps";
import type { McpServerExtensionRef } from "@agentxm/client-core/unstable/mcps";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import {
  FilesManager,
  renderWorkspaceGeneratorRegions,
  type FilesExtensionRef,
} from "@agentxm/client-core/unstable/files";
import { HookManager, type HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import {
  KnowledgeManager,
  type KnowledgeExtensionRef,
} from "@agentxm/client-core/unstable/knowledge";
import { RuleManager, type RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import type { CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import {
  applyPlan,
  previewOrApplyPlan,
  resolvePlan,
  type JobStepArtifact,
  type JobStepResult,
  type Operation,
  type Plan,
  type PlanResolution,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import {
  initializeWorkspaceTrustState,
  TRUST_STATE_FILENAME,
} from "@agentxm/client-core/unstable/trust";
import {
  cleanupStaleManagedSubagentFiles,
  displayPlan,
  observeCanonicalExtension,
  resolveConfiguredCommand,
  WorkspaceMutations,
  resolveConfiguredFiles,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  trustedCanonicalRef,
  type CanonicalObservationStatus,
  type DesiredExtensionNode,
  type DesiredStateGraph,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

export interface HandleSyncArgs {
  readonly target?: Option.Option<string>;
  readonly type?: Option.Option<Exclude<ExtensionType, "pack">>;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly acceptAuthorityChange?: boolean;
}

const PLAN_NAME = "Sync workspace";
const PLAN_DESCRIPTION =
  "Workspace-wide materialization from settings and on-disk extension content";

const desiredStateProblemText = (graph: DesiredStateGraph): string =>
  graph.problems
    .map((problem) => {
      switch (problem.type) {
        case "pack-manifest-unavailable":
          return `${problem.pack}: installed pack manifest is unavailable`;
        case "pack-manifest-invalid":
          return `${problem.pack}: installed pack manifest is invalid`;
        case "pack-identity-mismatch":
          return `${problem.pack}: ${problem.detail}`;
        case "pack-trust-unavailable":
          return `${problem.pack}: ${problem.detail}`;
        case "pack-canonical-unusable":
          return `${problem.pack}: canonical pack content is ${problem.status}`;
        case "projection-collision":
          return `${problem.extensionType} ${problem.name}: competing identities ${problem.identities.join(", ")}`;
        case "constraint-conflict":
          return `${problem.extensionType} ${problem.name}: incompatible constraints ${problem.constraints.join(", ")}`;
      }
    })
    .join("; ");

interface SyncSelection {
  readonly target: Option.Option<string>;
  readonly type: Option.Option<Exclude<ExtensionType, "pack">>;
}

const normalizedIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const sourceTransitionIdentity = (authority: string, identity: string): string =>
  identity.startsWith(`${authority}:`) ? identity : `${authority}:${identity}`;

const selectedDesiredNodes = (
  graph: DesiredStateGraph,
  selection: SyncSelection,
): ReadonlyArray<DesiredExtensionNode> => {
  if (Option.isSome(selection.target)) {
    const target = selection.target.value;
    const parsed = parseExtensionFqnParts(target);
    if (parsed === undefined) return [];
    if (parsed.type === "pack") {
      return graph.nodes.filter(
        (node) =>
          node.type !== "pack" &&
          node.origins.some(
            (origin) => origin.type === "pack" && normalizedIdentity(origin.pack) === target,
          ),
      );
    }
    return graph.nodes.filter(
      (node) => node.type === parsed.type && normalizedIdentity(node.identity) === target,
    );
  }
  if (Option.isSome(selection.type)) {
    const type = selection.type.value;
    return graph.nodes.filter((node) => node.type === type);
  }
  return graph.nodes;
};

const scopedProblems = (
  graph: DesiredStateGraph,
  selection: SyncSelection,
): DesiredStateGraph["problems"] => {
  if (Option.isNone(selection.target) && Option.isNone(selection.type)) return graph.problems;
  if (Option.isSome(selection.type)) {
    const type = selection.type.value;
    return graph.problems.filter(
      (problem) =>
        problem.type.startsWith("pack-") ||
        ("extensionType" in problem && problem.extensionType === type),
    );
  }
  if (Option.isNone(selection.target)) return graph.problems;
  const target = selection.target.value;
  const parsed = parseExtensionFqnParts(target);
  if (parsed === undefined) return graph.problems;
  if (parsed.type === "pack") {
    return graph.problems.filter(
      (problem) => "pack" in problem && normalizedIdentity(problem.pack) === target,
    );
  }
  return graph.problems.filter(
    (problem) =>
      "extensionType" in problem &&
      problem.extensionType === parsed.type &&
      problem.name === parsed.name,
  );
};

const resolveDesiredExtensionRef = (
  node: DesiredExtensionNode,
  canonicalStatus: CanonicalObservationStatus,
) => {
  const annotate = <A, R>(effect: Effect.Effect<A, AppError, R>) =>
    effect.pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: cause.code,
          detail: `${cause.detail} (canonical status: ${canonicalStatus})`,
          cause,
        }),
      ),
    );
  switch (node.type) {
    case "skill":
      return annotate(resolveConfiguredSkill(node.name, node.source)).pipe(
        Effect.map(({ ref }) => ref),
      );
    case "command":
      return annotate(resolveConfiguredCommand(node.name, node.source)).pipe(
        Effect.map(({ ref }) => ref),
      );
    case "mcp-server":
      return annotate(resolveConfiguredMcpServer(node.name, node.source)).pipe(
        Effect.map(({ ref }) => ref),
      );
    case "subagent":
      return annotate(resolveConfiguredSubagent(node.name, node.source)).pipe(
        Effect.map(({ ref }) => ref),
      );
    case "files":
      return annotate(resolveConfiguredFiles(node.name, node.source)).pipe(
        Effect.map(({ ref }) => ref),
      );
    case "rule":
      return annotate(resolveConfiguredRule(node.name, node.source)).pipe(
        Effect.map(({ ref }) => ref),
      );
    case "hook":
      return annotate(resolveConfiguredHook(node.name, node.source)).pipe(
        Effect.map(({ ref }) => ref),
      );
    case "knowledge":
      return annotate(resolveConfiguredKnowledge(node.name, node.source)).pipe(
        Effect.map(({ ref }) => ref),
      );
    case "pack":
      return Effect.fail(
        makeAppError({
          code: "internal",
          detail: `Pack ${node.identity} is not a projection target`,
        }),
      );
  }
};

const registryVersion = (
  ref: SkillExtensionRef | CommandExtensionRef | SubagentExtensionRef,
): string | undefined => (ref.refType === "registry" ? ref.version : undefined);

const skillSyncArtifact = (args: {
  readonly ref: SkillExtensionRef;
  readonly agentRepo: CodingAgentRepositoryService;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): Effect.Effect<JobStepArtifact, AppError, never> =>
  Effect.gen(function* () {
    const materializationAgents = yield* args.agentRepo
      .getMaterializationAgents()
      .pipe(Effect.provideService(WorkspaceMutations, args.ws));
    const resolved = yield* Effect.forEach(
      materializationAgents,
      (agent) =>
        agent.resolveEffectiveSkillsDir({ workspaceRoot: args.ws.baseDir }).pipe(
          Effect.provideService(FileSystem.FileSystem, args.fs),
          Effect.provideService(Path.Path, args.path),
          Effect.map((outcome) => ({ agent, outcome })),
        ),
      { concurrency: "unbounded" },
    );
    const targets = resolved.flatMap(({ agent, outcome }) =>
      outcome._tag === "supported" ? [{ agentId: agent.id, targetDir: outcome.dir }] : [],
    );
    const artifact = yield* skillArtifactFromTargets({
      targets,
      workspaceRoot: args.ws.baseDir,
      sanitizedName: sanitizeName(args.ref.skill.name),
      scope: args.ws.scope,
      change: "updated",
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, args.fs),
      Effect.provideService(Path.Path, args.path),
    );
    const version = registryVersion(args.ref);
    return {
      ...artifact,
      ...(version === undefined ? {} : { version }),
    };
  });

const commandSyncArtifact = (args: {
  readonly ref: CommandExtensionRef;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): Effect.Effect<JobStepArtifact, AppError, never> =>
  Effect.sync(() => {
    const version = registryVersion(args.ref);
    return {
      path: args.ref.command.name,
      scope: args.ws.scope,
      ...(version === undefined ? {} : { version }),
      change: "updated",
    };
  });

const subagentSyncArtifact = (args: {
  readonly ref: SubagentExtensionRef;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): Effect.Effect<JobStepArtifact, AppError, never> =>
  Effect.sync(() => {
    const version = registryVersion(args.ref);
    return {
      path: args.ref.subagent.name,
      scope: args.ws.scope,
      ...(version === undefined ? {} : { version }),
      change: "updated",
    };
  });

const buildMcpServerSyncOperation = ({
  ref,
  fs,
  path,
  ws,
  renderer,
  agentRepo,
  force,
  allowWorkspaceSourceTransition,
  transitionLabel,
  manager,
}: {
  readonly ref: McpServerExtensionRef;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
  readonly renderer: ServiceMap.Service.Shape<typeof CliRenderer>;
  readonly agentRepo: CodingAgentRepositoryService;
  readonly force: boolean;
  readonly allowWorkspaceSourceTransition: boolean;
  readonly transitionLabel: string;
  readonly manager: ServiceMap.Service.Shape<typeof McpServerManager>;
}): PlannedJobStep => {
  const target = targetFromRef(ref);
  const run = Effect.gen(function* () {
    if (manager.validateTrustTransition !== undefined) {
      yield* manager.validateTrustTransition({
        ref,
        allowSourceTransition: false,
        allowWorkspaceSourceTransition,
        allowDowngrade: false,
      });
    }
    return yield* installMcpServer({
      name: "install-mcp-server",
      args: {
        ref,
        force,
        allowWorkspaceSourceTransition,
        versionRange: Option.none(),
        skipSettings: Option.some(true),
      },
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
      Effect.provideService(WorkspaceMutations, ws),
      Effect.provideService(CliRenderer, renderer),
      Effect.provideService(CodingAgentRepository, agentRepo),
    );
  });

  return {
    key: toStepKey(target),
    label: transitionLabel,
    readiness: "ready",
    run,
  };
};

const isInlineMcpServerEntry = (entry: McpServerEntry): boolean =>
  entry.source === "inline" && (entry.command !== undefined || entry.url !== undefined);

const buildInlineMcpServerSyncOperation = ({
  name,
  entry,
  agentIds,
  force,
  fs,
  path,
  ws,
}: {
  readonly name: string;
  readonly entry: McpServerEntry;
  readonly agentIds: ReadonlyArray<string>;
  readonly force: boolean;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): PlannedJobStep => ({
  key: `mcp-server:inline:${name}`,
  label: `mcp-server ${name}`,
  readiness: "ready",
  run: Effect.gen(function* () {
    const inspections = yield* inspectMcpServerAcrossAgents({
      workspaceRoot: ws.baseDir,
      scope: ws.scope,
      agentIds,
      serverName: name,
      entry,
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
    const driftWarnings = inspections.flatMap((inspection) =>
      inspection.status === "drift" || inspection.status === "unmanaged"
        ? [
            `${inspection.agentId}: ${inspection.status}${
              inspection.fields.length > 0 ? ` (${inspection.fields.join(", ")})` : ""
            }`,
          ]
        : [],
    );
    if (driftWarnings.length > 0 && !force) {
      return {
        result: "error",
        message: `Inline MCP server ${name} has drifted agent configs; rerun with --force to overwrite`,
        error: makeAppError({
          code: "conflict",
          detail: `Inline MCP server ${name} has drifted agent configs`,
        }),
      } satisfies JobStepResult;
    }
    const batchOutcomes = yield* syncInlineMcpServerToAgents(agentIds, {
      workspaceRoot: ws.baseDir,
      serverName: name,
      entry,
      scope: ws.scope,
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
    const outcomes = agentIds.flatMap((agentId, index) => {
      const outcome = batchOutcomes[index];
      return outcome === undefined ? [] : [{ agentId, outcome }];
    });
    const warningDetails = outcomes.flatMap(({ agentId, outcome }) => {
      if (outcome._tag === "success") {
        return (outcome.warnings ?? []).map((warning) => `${agentId}: ${warning}`);
      }
      return [`${agentId}: ${outcome.reason}`];
    });
    const warnings = [...driftWarnings, ...warningDetails];
    return {
      result: "success",
      message:
        warnings.length === 0
          ? `Synced inline MCP server ${name}`
          : `Synced inline MCP server ${name} with ${count(warnings.length, "warning")}`,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }),
});

const buildMcpServerPruneOperation = ({
  declaredServerNames,
  agentIds,
  fs,
  path,
  ws,
}: {
  readonly declaredServerNames: ReadonlySet<string>;
  readonly agentIds: ReadonlyArray<string>;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): PlannedJobStep => ({
  key: "mcp-server:prune",
  label: "mcp-server stale managed entries",
  readiness: "ready",
  run: Effect.forEach(
    agentIds,
    (agentId) =>
      pruneManagedMcpServersForAgent(agentId, {
        workspaceRoot: ws.baseDir,
        declaredServerNames,
        scope: ws.scope,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.map((outcome) => ({ agentId, outcome })),
      ),
    { concurrency: "unbounded" },
  ).pipe(
    Effect.map((outcomes) => {
      const warnings = outcomes.filter(({ outcome }) => outcome._tag !== "success");
      return {
        result: "success",
        message:
          warnings.length === 0
            ? "Pruned stale managed MCP server entries"
            : `Pruned stale managed MCP server entries with ${count(warnings.length, "warning")}`,
      };
    }),
  ),
});

const isObservedMaterializationCurrent = (
  ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>,
  node: DesiredExtensionNode,
  configuredAgents: ReadonlyArray<string>,
): Effect.Effect<boolean, AppError> =>
  ws.records
    .getExtensionInventory(node.type, {
      includeIgnored: false,
      ...(configuredAgents.length > 0 &&
      (node.type === "skill" ||
        node.type === "command" ||
        node.type === "mcp-server" ||
        node.type === "subagent")
        ? { agents: configuredAgents }
        : {}),
    })
    .pipe(
      Effect.map((inventory) => {
        const observed = inventory.items.find(
          (item) =>
            item.name === node.name && item.classification.kind === "lifecycle" && item.installed,
        );
        if (observed === undefined) return false;
        if (
          node.type !== "skill" &&
          node.type !== "command" &&
          node.type !== "mcp-server" &&
          node.type !== "subagent"
        ) {
          return true;
        }
        const hasProjectionOrigin = (() => {
          switch (node.type) {
            case "skill":
              return observed.origins.includes("agent-skill-dir");
            case "command":
              return observed.origins.includes("agent-command-dir");
            case "subagent":
              return observed.origins.includes("agent-subagent-dir");
            case "mcp-server":
              return (
                observed.origins.includes("workspace-mcp-config") ||
                observed.origins.includes("agent-mcp-config")
              );
            default:
              return true;
          }
        })();
        if (!hasProjectionOrigin) return false;
        return configuredAgents.every((agentId) => observed.agents.includes(agentId));
      }),
    );

export const collectMaterializeSteps = Effect.fn("Sync.collectMaterializeSteps")(function* (args?: {
  readonly force: boolean;
  readonly selection: SyncSelection;
  readonly retainedOnly?: boolean;
  readonly acceptAuthorityChange?: boolean;
}) {
  const skillManager = yield* SkillManager;
  const commandManager = yield* CommandManager;
  const mcpServerManager = yield* McpServerManager;
  const subagentManager = yield* SubagentManager;
  const fileManager = yield* FilesManager;
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const knowledgeManager = yield* KnowledgeManager;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const configuredMcpServerEntries = yield* ws.getConfiguredMcpServerEntries();
  const configuredAgents = yield* ws.getConfiguredAgents();
  const desiredState = yield* ws.getDesiredStateGraph();
  const selection = args?.selection ?? { target: Option.none(), type: Option.none() };
  const isScoped = Option.isSome(selection.target) || Option.isSome(selection.type);
  const problems = scopedProblems(desiredState, selection);
  if (problems.length > 0) {
    const scopedGraph = { ...desiredState, problems };
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot reconcile the selected incomplete desired extension graph: ${desiredStateProblemText(scopedGraph)}`,
      suggestions: [
        {
          description: "Inspect and repair the affected workspace pack",
          cmd: "axm status",
        },
      ],
    });
  }
  if (
    Option.isSome(selection.target) &&
    selectedDesiredNodes(desiredState, selection).length === 0
  ) {
    return yield* makeAppError({
      code: "not_found",
      detail: `No desired extension nodes matched ${selection.target.value}`,
    });
  }

  const trustState = yield* ws.getTrustState();
  const reconciled = yield* Effect.forEach(
    selectedDesiredNodes(desiredState, selection).filter(
      (node) =>
        node.enabled &&
        node.type !== "pack" &&
        !(node.type === "mcp-server" && node.source === "inline"),
    ),
    (node) =>
      Effect.gen(function* () {
        const trust = trustState.records[`${node.type}:${node.name}`];
        const observation = yield* observeCanonicalExtension({
          baseDir: ws.baseDir,
          desired: node,
          trust,
        });
        const materializationCurrent = yield* isObservedMaterializationCurrent(
          ws,
          node,
          configuredAgents,
        );
        const materialize =
          (args?.force ?? false) || observation.status !== "usable" || !materializationCurrent;
        const force = args?.retainedOnly === true ? false : materialize;
        const ref = yield* Effect.gen(function* () {
          if (observation.status === "usable" && trust !== undefined) {
            return yield* trustedCanonicalRef({
              baseDir: ws.baseDir,
              scope: ws.scope,
              desired: node,
              trust,
            });
          }
          if (args?.retainedOnly === true) {
            return yield* makeAppError({
              code: "conflict",
              detail: `Cannot rematerialize retained ${node.type} ${node.name}: canonical content is ${observation.status}`,
              suggestions: [
                {
                  description: "Refresh the pack and its retained members",
                  cmd: "axm packs update --yes",
                },
              ],
            });
          }
          return yield* resolveDesiredExtensionRef(node, observation.status);
        });
        const allowWorkspaceSourceTransition =
          args?.acceptAuthorityChange === true &&
          ref.refType === "workspace" &&
          trust?.authority === "workspace";
        return {
          ref,
          force,
          materialize,
          allowWorkspaceSourceTransition,
          transitionLabel: [
            node.name,
            `previous source=${
              trust === undefined
                ? "none"
                : sourceTransitionIdentity(trust.authority, trust.sourceIdentity)
            }`,
            `proposed source=${sourceTransitionIdentity(ref.source.type, node.identity)}`,
            `previous version=${trust?.resolvedVersion ?? "none"}`,
            `proposed version=${ref.refType === "registry" || ref.refType === "workspace" ? ref.version : "unversioned"}`,
            `reason=${args?.force === true ? "forced" : observation.status !== "usable" ? observation.status : "stale-projection"}`,
            `downgrade=${
              trust?.resolvedVersion !== undefined &&
              (ref.refType === "registry" || ref.refType === "workspace") &&
              semver.gt(trust.resolvedVersion, ref.version)
                ? "yes"
                : "no"
            }`,
          ].join("; "),
        };
      }),
    { concurrency: "unbounded" },
  );

  type Reconciled<TRef extends ExtensionRef> = {
    readonly ref: TRef;
    readonly force: boolean;
    readonly materialize: boolean;
    readonly allowWorkspaceSourceTransition: boolean;
    readonly transitionLabel: string;
  };
  const skillRefs: Array<Reconciled<SkillExtensionRef>> = [];
  const commandRefs: Array<Reconciled<CommandExtensionRef>> = [];
  const mcpServerRefs: Array<Reconciled<McpServerExtensionRef>> = [];
  const subagentRefs: Array<Reconciled<SubagentExtensionRef>> = [];
  const fileRefs: Array<Reconciled<FilesExtensionRef>> = [];
  const ruleRefs: Array<Reconciled<RuleExtensionRef>> = [];
  const hookRefs: Array<Reconciled<HookExtensionRef>> = [];
  const knowledgeRefs: Array<Reconciled<KnowledgeExtensionRef>> = [];
  for (const item of reconciled) {
    switch (item.ref.type) {
      case "skill":
        skillRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          allowWorkspaceSourceTransition: item.allowWorkspaceSourceTransition,
          transitionLabel: item.transitionLabel,
        });
        break;
      case "command":
        commandRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          allowWorkspaceSourceTransition: item.allowWorkspaceSourceTransition,
          transitionLabel: item.transitionLabel,
        });
        break;
      case "mcp-server":
        mcpServerRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          allowWorkspaceSourceTransition: item.allowWorkspaceSourceTransition,
          transitionLabel: item.transitionLabel,
        });
        break;
      case "subagent":
        subagentRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          allowWorkspaceSourceTransition: item.allowWorkspaceSourceTransition,
          transitionLabel: item.transitionLabel,
        });
        break;
      case "files":
        fileRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          allowWorkspaceSourceTransition: item.allowWorkspaceSourceTransition,
          transitionLabel: item.transitionLabel,
        });
        break;
      case "rule":
        ruleRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          allowWorkspaceSourceTransition: item.allowWorkspaceSourceTransition,
          transitionLabel: item.transitionLabel,
        });
        break;
      case "hook":
        hookRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          allowWorkspaceSourceTransition: item.allowWorkspaceSourceTransition,
          transitionLabel: item.transitionLabel,
        });
        break;
      case "knowledge":
        knowledgeRefs.push({
          ref: item.ref,
          force: item.force,
          materialize: item.materialize,
          allowWorkspaceSourceTransition: item.allowWorkspaceSourceTransition,
          transitionLabel: item.transitionLabel,
        });
        break;
      case "pack":
        break;
    }
  }

  const declaredMcpServerNames = new Set([
    ...enabledConfiguredEntries(configuredMcpServerEntries).map(([name]) => name),
    ...mcpServerRefs.map(({ ref }) => ref.server.name),
  ]);
  const inlineMcpServerSteps = yield* Effect.forEach(
    Object.entries(configuredMcpServerEntries).filter(
      ([name, entry]) =>
        isConfiguredEntryEnabled(entry) &&
        isInlineMcpServerEntry(entry) &&
        (Option.isNone(selection.type) || selection.type.value === "mcp-server") &&
        (Option.isNone(selection.target) ||
          (parseExtensionFqnParts(selection.target.value)?.type === "mcp-server" &&
            parseExtensionFqnParts(selection.target.value)?.name === name)),
    ),
    ([name, entry]) =>
      Effect.gen(function* () {
        if (args?.force !== true) {
          const inspections = yield* inspectMcpServerAcrossAgents({
            workspaceRoot: ws.baseDir,
            scope: ws.scope,
            agentIds: configuredAgents,
            serverName: name,
            entry,
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          const current = inspections.every(
            (inspection) => inspection.status === "match" || inspection.status === "unsupported",
          );
          if (current) return Option.none<PlannedJobStep>();
        }
        return Option.some(
          buildInlineMcpServerSyncOperation({
            name,
            entry,
            agentIds: configuredAgents,
            force: args?.force ?? false,
            fs,
            path,
            ws,
          }),
        );
      }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((steps) => steps.flatMap((step) => (Option.isSome(step) ? [step.value] : []))));
  const needsMcpServerPrune =
    !isScoped &&
    configuredAgents.length > 0 &&
    (yield* Effect.forEach(
      configuredAgents,
      (agentId) =>
        pruneManagedMcpServersForAgent(agentId, {
          workspaceRoot: ws.baseDir,
          declaredServerNames: declaredMcpServerNames,
          scope: ws.scope,
          dryRun: true,
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      { concurrency: "unbounded" },
    ).pipe(
      Effect.map((outcomes) =>
        outcomes.some((outcome) => outcome._tag === "success" && outcome.targets !== undefined),
      ),
    ));
  const skillMaterializeStep = ({
    ref,
    force,
    allowWorkspaceSourceTransition,
    transitionLabel,
  }: Reconciled<SkillExtensionRef>) =>
    buildMaterializeOperation(skillManager, {
      ref,
      force,
      allowWorkspaceSourceTransition,
      label: transitionLabel,
      message: `Synced skill ${ref.skill.name}`,
      buildArtifact: () => skillSyncArtifact({ ref, agentRepo, fs, path, ws }),
    });
  const commandMaterializeStep = ({
    ref,
    force,
    allowWorkspaceSourceTransition,
    transitionLabel,
  }: Reconciled<CommandExtensionRef>) =>
    buildMaterializeOperation(commandManager, {
      ref,
      force,
      allowWorkspaceSourceTransition,
      label: transitionLabel,
      message: `Synced command ${ref.command.name}`,
      buildArtifact: () => commandSyncArtifact({ ref, ws }),
    });
  const subagentMaterializeStep = ({
    ref,
    force,
    allowWorkspaceSourceTransition,
    transitionLabel,
  }: Reconciled<SubagentExtensionRef>) =>
    buildMaterializeOperation(subagentManager, {
      ref,
      force,
      allowWorkspaceSourceTransition,
      label: transitionLabel,
      message: `Synced subagent ${ref.subagent.name}`,
      buildArtifact: () => subagentSyncArtifact({ ref, ws }),
    });
  const knowledgeMaterializeStep = ({
    ref,
    force,
    allowWorkspaceSourceTransition,
    transitionLabel,
  }: Reconciled<KnowledgeExtensionRef>) =>
    buildMaterializeOperation(knowledgeManager, {
      ref,
      force,
      allowWorkspaceSourceTransition,
      label: transitionLabel,
      message: `Synced knowledge ${ref.knowledge.name}`,
    });

  return {
    expectedSubagentNames: new Set(subagentRefs.map(({ ref }) => ref.subagent.name)),
    steps: [
      ...skillRefs.filter(({ materialize }) => materialize).map(skillMaterializeStep),
      ...commandRefs.filter(({ materialize }) => materialize).map(commandMaterializeStep),
      ...mcpServerRefs
        .filter(({ materialize }) => materialize)
        .map(({ ref, force, allowWorkspaceSourceTransition, transitionLabel }) =>
          buildMcpServerSyncOperation({
            ref,
            fs,
            path,
            ws,
            renderer,
            agentRepo,
            force,
            allowWorkspaceSourceTransition,
            transitionLabel,
            manager: mcpServerManager,
          }),
        ),
      ...inlineMcpServerSteps,
      ...(needsMcpServerPrune
        ? [
            buildMcpServerPruneOperation({
              declaredServerNames: declaredMcpServerNames,
              agentIds: configuredAgents,
              fs,
              path,
              ws,
            }),
          ]
        : []),
      ...subagentRefs.filter(({ materialize }) => materialize).map(subagentMaterializeStep),
      ...fileRefs
        .filter(({ materialize }) => materialize)
        .map(({ ref, force, allowWorkspaceSourceTransition, transitionLabel }) =>
          buildMaterializeOperation(fileManager, {
            ref,
            force,
            allowWorkspaceSourceTransition,
            label: transitionLabel,
          }),
        ),
      ...ruleRefs
        .filter(({ materialize }) => materialize)
        .map(({ ref, force, allowWorkspaceSourceTransition, transitionLabel }) =>
          buildMaterializeOperation(ruleManager, {
            ref,
            force,
            allowWorkspaceSourceTransition,
            label: transitionLabel,
          }),
        ),
      ...hookRefs
        .filter(({ materialize }) => materialize)
        .map(({ ref, force, allowWorkspaceSourceTransition, transitionLabel }) =>
          buildMaterializeOperation(hookManager, {
            ref,
            force,
            allowWorkspaceSourceTransition,
            label: transitionLabel,
          }),
        ),
      ...knowledgeRefs.filter(({ materialize }) => materialize).map(knowledgeMaterializeStep),
    ] satisfies ReadonlyArray<PlannedJobStep>,
  };
});

const makeSyncPlan = ({
  materializeSteps,
  workspaceGeneratorStep,
  trustMigrationStep,
  name = PLAN_NAME,
  description = PLAN_DESCRIPTION,
}: {
  readonly materializeSteps: ReadonlyArray<PlannedJobStep>;
  readonly workspaceGeneratorStep: Option.Option<PlannedJobStep>;
  readonly trustMigrationStep: Option.Option<PlannedJobStep>;
  readonly name?: string;
  readonly description?: string;
}): Plan => ({
  _tag: "Plan",
  name,
  description: Option.some(description),
  jobs: [
    ...(materializeSteps.length > 0
      ? [{ concurrency: "unbounded" as const, steps: materializeSteps }]
      : []),
    ...(Option.isSome(workspaceGeneratorStep)
      ? [{ concurrency: 1 as const, steps: [workspaceGeneratorStep.value] }]
      : []),
    ...(Option.isSome(trustMigrationStep)
      ? [{ concurrency: 1 as const, steps: [trustMigrationStep.value] }]
      : []),
  ],
});

const collectTrustMigrationStep = Effect.fn("Sync.collectTrustMigrationStep")(function* () {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const trustPath = path.join(ws.path, TRUST_STATE_FILENAME);
  const exists = yield* fs.exists(trustPath).pipe(
    Effect.mapError((cause) =>
      makeAppError({
        code: "internal",
        detail: `Failed to inspect workspace trust state at ${trustPath}`,
        cause,
      }),
    ),
  );
  if (exists) return Option.none<PlannedJobStep>();

  const state = yield* ws.getTrustState();
  if (Object.keys(state.records).length === 0) return Option.none<PlannedJobStep>();

  return Option.some<PlannedJobStep>({
    key: "migrate-workspace-trust",
    label: "workspace trust baseline",
    readiness: "ready",
    run: initializeWorkspaceTrustState(ws.path, state).pipe(
      Effect.map((initialized): JobStepResult => ({
        result: "success",
        message: initialized
          ? "Migrated workspace trust baseline from the legacy receipt"
          : "Workspace trust baseline already current",
      })),
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    ),
  });
});

const regionLabel = (count: number): string => (count === 1 ? "region" : "regions");

const fileLabel = (count: number): string => (count === 1 ? "file" : "files");

const collectWorkspaceGeneratorStep = Effect.fn("Sync.collectWorkspaceGeneratorStep")(function* () {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const preview = yield* renderWorkspaceGeneratorRegions({
    workspaceRoot: ws.baseDir,
    dryRun: true,
  });
  if (preview.renderedRegions === 0) return Option.none<PlannedJobStep>();

  const run = renderWorkspaceGeneratorRegions({
    workspaceRoot: ws.baseDir,
    dryRun: false,
  }).pipe(
    Effect.map((result): JobStepResult => {
      const change = result.changedFiles === 0 ? "unchanged" : "updated";
      return {
        result: "success",
        message:
          change === "unchanged"
            ? "Workspace generator regions already current"
            : `Rendered ${result.renderedRegions} workspace generator ${regionLabel(result.renderedRegions)} across ${result.changedFiles} ${fileLabel(result.changedFiles)}`,
        artifact: {
          path: "workspace generator regions",
          scope: ws.scope,
          change,
          fileCount: result.changedFiles,
          targets: [
            {
              path: "workspace generator regions",
              change,
            },
          ],
        },
      };
    }),
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
  );

  return Option.some<PlannedJobStep>({
    key: "workspace-generator-regions",
    label: "workspace generator regions",
    readiness: "ready",
    run,
  });
});

interface SyncInstructionTargetIntentArgs {
  readonly root: string;
  readonly agentId: string;
  readonly force: boolean;
}

interface SyncInstructionsGitignoreIntentArgs {
  readonly desired: boolean;
}

const collectInstructionOperations = Effect.fn("Sync.collectInstructionOperations")(function* () {
  const ws = yield* WorkspaceMutations;
  const config = yield* ws.getInstructionsConfig();
  if (Option.isNone(config) || config.value === false) return [];

  const configuredAgents = yield* ws.getConfiguredAgents();
  const resolvedConfig = resolveInstructionsConfig(config.value);
  const status = yield* getInstructionsStatus({
    workspaceRoot: ws.baseDir,
    scope: ws.scope,
    configuredAgents,
    config: resolvedConfig,
  });
  const operations: Array<Operation<string, unknown>> = [];
  for (const item of status.items) {
    const fixableHealth =
      item.health === "missing-target" || item.health === "drift" || item.health === "broken-link";
    const fixableMechanism = item.mechanism === "symlink" || item.mechanism === "copy";
    if (!fixableHealth || !fixableMechanism) continue;
    operations.push({
      name: "sync-instruction-target",
      args: {
        root: item.root,
        agentId: item.agentId,
        force: item.health === "drift",
      } satisfies SyncInstructionTargetIntentArgs,
    });
  }

  const gitignore = yield* getInstructionsGitignoreStatus({
    workspaceRoot: ws.baseDir,
    configuredAgents,
    config: resolvedConfig,
  });
  if (!gitignore.current) {
    operations.push({
      name: "sync-instructions-gitignore",
      args: { desired: gitignore.desired } satisfies SyncInstructionsGitignoreIntentArgs,
    });
  }
  return operations;
});

const buildInstructionStep = (
  op: Operation<string, unknown>,
): Effect.Effect<PlannedJobStep, never, WorkspaceMutations | FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* ws.getInstructionsConfig().pipe(Effect.orDie);
    if (Option.isNone(config) || config.value === false) {
      return {
        key: op.name,
        readiness: "error",
        label: op.name,
        errorMessage: "Instruction-file management is disabled",
      };
    }
    const resolvedConfig = resolveInstructionsConfig(config.value);
    switch (op.name) {
      case "sync-instruction-target": {
        const args = op.args;
        if (
          typeof args !== "object" ||
          args === null ||
          !("root" in args) ||
          !("agentId" in args) ||
          !("force" in args) ||
          typeof args.root !== "string" ||
          typeof args.agentId !== "string" ||
          typeof args.force !== "boolean"
        ) {
          return {
            key: op.name,
            readiness: "error",
            label: op.name,
            errorMessage: "Instruction target operation is malformed",
          };
        }
        const run = syncInstructionTarget({
          root: args.root,
          agentId: args.agentId,
          config: resolvedConfig,
          force: args.force,
          dryRun: false,
        }).pipe(
          Effect.map((written) => ({
            result: "success" as const,
            message: Option.isSome(written)
              ? `Updated ${written.value}`
              : "Instruction target already current",
          })),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
        return args.force
          ? {
              key: `instruction:${args.root}:${args.agentId}`,
              readiness: "warn",
              warnMessage: `Overwriting drifted instruction file for ${args.agentId}`,
              label: `${args.agentId} instruction file`,
              run,
            }
          : {
              key: `instruction:${args.root}:${args.agentId}`,
              readiness: "ready",
              label: `${args.agentId} instruction file`,
              run,
            };
      }
      case "sync-instructions-gitignore": {
        const args = op.args;
        if (
          typeof args !== "object" ||
          args === null ||
          !("desired" in args) ||
          typeof args.desired !== "boolean"
        ) {
          return {
            key: op.name,
            readiness: "error",
            label: op.name,
            errorMessage: "Instruction gitignore operation is malformed",
          };
        }
        const configuredAgents = yield* ws.getConfiguredAgents().pipe(Effect.orDie);
        return {
          key: "instruction:gitignore",
          readiness: "ready",
          label: "instruction gitignore entries",
          run: syncInstructionsGitignore({
            workspaceRoot: ws.baseDir,
            configuredAgents,
            config: resolvedConfig,
            desired: args.desired,
            dryRun: false,
          }).pipe(
            Effect.map((written) => ({
              result: "success" as const,
              message: Option.isSome(written)
                ? `Updated ${written.value}`
                : "Instruction gitignore entries already current",
            })),
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
        };
      }
      default:
        return {
          key: op.name,
          readiness: "error",
          label: op.name,
          errorMessage: `Unknown instruction operation: ${op.name}`,
        };
    }
  });

const renderInstructionPhase = Effect.fn("Sync.renderInstructionPhase")(function* (
  dryRun: boolean,
) {
  const operations = yield* collectInstructionOperations();
  if (operations.length === 0) return;
  const steps = yield* Effect.forEach(operations, buildInstructionStep, {
    concurrency: "unbounded",
  });
  const plan = resolvePlan({
    name: "Sync instruction files",
    description: "Propagate configured agent instruction files",
    steps,
  });
  if (dryRun) {
    yield* displayPlan(plan);
    return;
  }
  const executed = yield* applyPlan(plan);
  yield* displayPlan(executed);
});

// Context-files materialization owns the canonical AGENTS.md content; instruction
// aliases are synced only after that phase has finished.

export const handleSync = Effect.fn("Sync.handle")(function* (args: HandleSyncArgs) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const target = args.target ?? Option.none<string>();
  const type = args.type ?? Option.none<Exclude<ExtensionType, "pack">>();
  if (args.acceptAuthorityChange === true && Option.isNone(target)) {
    return yield* makeAppError({
      code: "usage",
      detail: "--accept-authority-change requires one extension FQN",
      suggestions: [
        {
          description: "Inspect the exact recovery command for the affected extension",
          cmd: "axm status",
        },
      ],
    });
  }
  const selection = { target, type };
  const scoped = Option.isSome(target) || Option.isSome(type);
  const scopeLabel = Option.isSome(target)
    ? target.value
    : Option.isSome(type)
      ? `type ${type.value}`
      : "workspace";
  const planName = scoped ? `Sync ${scopeLabel}` : PLAN_NAME;
  const planDescription = scoped ? `Scoped materialization for ${scopeLabel}` : PLAN_DESCRIPTION;
  const preflight = yield* renderer.withSpinner(
    `Resolving ${scopeLabel} sync`,
    () =>
      Effect.gen(function* () {
        const { steps, expectedSubagentNames } = yield* collectMaterializeSteps({
          force: args.force,
          selection,
          acceptAuthorityChange: args.acceptAuthorityChange === true,
        });
        const workspaceGeneratorStep = scoped
          ? Option.none<PlannedJobStep>()
          : yield* collectWorkspaceGeneratorStep();
        const trustMigrationStep = scoped
          ? Option.none<PlannedJobStep>()
          : yield* collectTrustMigrationStep();

        // A degraded lockfile is work even when nothing needs materializing: `axm sync`
        // is the command users are pointed at to recover one, so it must not short-circuit
        // to a no-op before reconciliation has had a chance to run.
        const lockfileNeedsRecovery = !scoped && (yield* ws.getLockfileState()) !== "ok";
        return {
          steps,
          expectedSubagentNames,
          workspaceGeneratorStep,
          trustMigrationStep,
          lockfileNeedsRecovery,
        };
      }),
    { successMessage: `Resolved ${scopeLabel} sync` },
  );
  const {
    steps,
    expectedSubagentNames,
    workspaceGeneratorStep,
    trustMigrationStep,
    lockfileNeedsRecovery,
  } = preflight;

  if (
    steps.length === 0 &&
    Option.isNone(workspaceGeneratorStep) &&
    Option.isNone(trustMigrationStep) &&
    !lockfileNeedsRecovery
  ) {
    if (!scoped) yield* renderInstructionPhase(args.dryRun);
    if (!scoped && !args.dryRun) {
      yield* cleanupStaleManagedSubagentFiles({ expectedSubagentNames });
    }
    yield* emitNoOpOutcome("sync", {
      planName,
      planDescription,
      message: scoped
        ? `${scopeLabel} materialization is up to date`
        : "Workspace materialization is up to date",
    });
    return;
  }

  const plan = makeSyncPlan({
    materializeSteps: steps,
    workspaceGeneratorStep,
    trustMigrationStep,
    name: planName,
    description: planDescription,
  });

  // `previewOrApplyPlan` rather than `applyPlan`: it prepends the lockfile
  // recovery job when the lockfile is missing or unreadable.
  const resolution: PlanResolution = scoped
    ? args.dryRun
      ? {
          _tag: "PreviewedPlan",
          name: plan.name,
          description: plan.description,
          jobs: plan.jobs,
        }
      : yield* renderer.withSpinner(`Applying ${plan.name}`, () => applyPlan(plan), {
          successMessage: `Finished applying ${plan.name}`,
        })
    : yield* previewOrApplyPlan(plan, {
        yes: true,
        force: args.force,
        preview: args.dryRun,
        displayApplied: false,
      });

  if (resolution._tag === "PreviewedPlan") {
    if (!scoped) yield* renderInstructionPhase(true);
    yield* emitPlanResolutionResult("sync", resolution);
    return;
  }

  if (!scoped) {
    yield* cleanupStaleManagedSubagentFiles({ expectedSubagentNames });
    yield* renderInstructionPhase(false);
  }
  yield* displayPlan(resolution);
  yield* emitPlanResolutionResult("sync", resolution);
});
