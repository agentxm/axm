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
import {
  CodingAgentRepository,
  getInstructionsGitignoreStatus,
  getInstructionsStatus,
  pruneManagedMcpServersForAgent,
  resolveInstructionsConfig,
  syncInlineMcpServerToAgent,
  syncInstructionTarget,
  syncInstructionsGitignore,
  type CodingAgentRepositoryService,
} from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import {
  buildMaterializeOperation,
  configuredCommandsToDiskRefs,
  configuredMcpServersToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
  parseRegistrySourceRef,
  targetFromRef,
  toLabelWithCompanions,
  toStepKey,
  type ExtensionTypePlural,
} from "@agentxm/client-core/unstable/extensions";
import { installMcpServer, McpServerManager } from "@agentxm/client-core/unstable/mcps";
import type { McpServerExtensionRef } from "@agentxm/client-core/unstable/mcps";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import { FilesManager, renderWorkspaceGeneratorRegions } from "@agentxm/client-core/unstable/files";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import {
  applyPlan,
  resolvePlan,
  type Operation,
  type Plan,
  type PlanResolution,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  cleanupStaleManagedSubagentFiles,
  displayPlan,
  WorkspaceMutations,
  resolveConfiguredFiles,
  resolveConfiguredHook,
  resolveConfiguredRule,
} from "@agentxm/client-core/unstable/workspace";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";

export interface HandleSyncArgs {
  readonly dryRun: boolean;
}

const PLAN_NAME = "Sync workspace";
const PLAN_DESCRIPTION = "Materialize extensions from settings and on-disk extension content";

const dependencyEntries = (
  dependencies: Readonly<Record<string, unknown>>,
  type: ExtensionTypePlural,
) => {
  const entries: Record<string, { source: string; enabled: boolean; packagingKind: "native" }> = {};
  for (const fqn of Object.keys(dependencies)) {
    const parsed = parseRegistrySourceRef(fqn);
    if (parsed !== undefined && parsed.type === type) {
      entries[parsed.name] = { source: fqn, enabled: true, packagingKind: "native" };
    }
  }
  return entries;
};

const enabledDependencyEntries = (
  dependencies: Readonly<Record<string, unknown>>,
  type: ExtensionTypePlural,
) => {
  const entries: Record<string, { source: string; enabled: boolean; packagingKind: "native" }> = {};
  for (const fqn of Object.keys(dependencies)) {
    const parsed = parseRegistrySourceRef(fqn);
    if (parsed !== undefined && parsed.type === type) {
      entries[parsed.name] = { source: fqn, enabled: true, packagingKind: "native" };
    }
  }
  return entries;
};

const buildMcpServerSyncOperation = ({
  ref,
  fs,
  path,
  ws,
  renderer,
  agentRepo,
}: {
  readonly ref: McpServerExtensionRef;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
  readonly renderer: ServiceMap.Service.Shape<typeof CliRenderer>;
  readonly agentRepo: CodingAgentRepositoryService;
}): PlannedJobStep => {
  const target = targetFromRef(ref);
  const run = installMcpServer({
    name: "install-mcp-server",
    args: {
      ref,
      force: false,
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

  return {
    key: toStepKey(target),
    label: toLabelWithCompanions(target, ref.refType === "registry" ? ref.packages : []),
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
  fs,
  path,
  ws,
}: {
  readonly name: string;
  readonly entry: McpServerEntry;
  readonly agentIds: ReadonlyArray<string>;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly ws: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
}): PlannedJobStep => ({
  key: `mcp-server:inline:${name}`,
  label: `mcp-server ${name}`,
  readiness: "ready",
  run: Effect.forEach(
    agentIds,
    (agentId) =>
      syncInlineMcpServerToAgent(agentId, {
        workspaceRoot: ws.baseDir,
        serverName: name,
        entry,
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
            ? `Synced inline MCP server ${name}`
            : `Synced inline MCP server ${name} with ${warnings.length} warning(s)`,
      };
    }),
  ),
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
            : `Pruned stale managed MCP server entries with ${warnings.length} warning(s)`,
      };
    }),
  ),
});

const configuredFilesToRefs = (
  entries: Readonly<Record<string, { readonly source: string; readonly enabled?: boolean }>>,
) =>
  Effect.forEach(
    Object.entries(entries).filter(([, entry]) => entry.enabled !== false),
    ([name, entry]) =>
      resolveConfiguredFiles(name, entry.source).pipe(Effect.map(({ ref }) => ref)),
    { concurrency: "unbounded" },
  );

const configuredRulesToRefs = (
  entries: Readonly<Record<string, { readonly source: string; readonly enabled?: boolean }>>,
) =>
  Effect.forEach(
    Object.entries(entries).filter(([, entry]) => entry.enabled !== false),
    ([name, entry]) => resolveConfiguredRule(name, entry.source).pipe(Effect.map(({ ref }) => ref)),
    { concurrency: "unbounded" },
  );

const configuredHooksToRefs = (
  entries: Readonly<Record<string, { readonly source: string; readonly enabled?: boolean }>>,
) =>
  Effect.forEach(
    Object.entries(entries).filter(([, entry]) => entry.enabled !== false),
    ([name, entry]) => resolveConfiguredHook(name, entry.source).pipe(Effect.map(({ ref }) => ref)),
    { concurrency: "unbounded" },
  );

export const collectMaterializeSteps = Effect.fn("Sync.collectMaterializeSteps")(function* () {
  const skillManager = yield* SkillManager;
  const commandManager = yield* CommandManager;
  const mcpServerManager = yield* McpServerManager;
  const subagentManager = yield* SubagentManager;
  const fileManager = yield* FilesManager;
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const packManager = yield* PackManager;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const env = { fs, path, baseDir: ws.baseDir };
  const configuredMcpServerEntries = yield* ws.getConfiguredMcpServerEntries();
  const configuredAgents = yield* ws.getConfiguredAgents();

  const [
    skillRefs,
    commandRefs,
    mcpServerRefs,
    subagentRefs,
    fileRefs,
    ruleRefs,
    hookRefs,
    packRefs,
  ] = yield* Effect.all(
    [
      skillManager.listMaterializable(),
      commandManager.listMaterializable(),
      mcpServerManager.listMaterializable(),
      subagentManager.listMaterializable(),
      fileManager.listMaterializable(),
      ruleManager.listMaterializable(),
      hookManager.listMaterializable(),
      packManager.listMaterializable(),
    ],
    { concurrency: "unbounded" },
  );

  const [
    packSkillRefs,
    packCommandRefs,
    packMcpServerRefs,
    packSubagentRefs,
    packFileRefs,
    packRuleRefs,
    packHookRefs,
  ] = yield* Effect.all(
    [
      configuredSkillsToDiskRefs(
        env,
        Object.assign(
          {},
          ...packRefs.map((ref) => enabledDependencyEntries(ref.pack.dependencies, "skills")),
        ),
      ),
      configuredCommandsToDiskRefs(
        env,
        Object.assign(
          {},
          ...packRefs.map((ref) => enabledDependencyEntries(ref.pack.dependencies, "commands")),
        ),
      ),
      configuredMcpServersToDiskRefs(
        env,
        Object.assign(
          {},
          ...packRefs.map((ref) => dependencyEntries(ref.pack.dependencies, "mcps")),
        ),
      ),
      configuredSubagentsToDiskRefs(
        env,
        Object.assign(
          {},
          ...packRefs.map((ref) => enabledDependencyEntries(ref.pack.dependencies, "subagents")),
        ),
      ),
      configuredFilesToRefs(
        Object.assign(
          {},
          ...packRefs.map((ref) => enabledDependencyEntries(ref.pack.dependencies, "files")),
        ),
      ),
      configuredRulesToRefs(
        Object.assign(
          {},
          ...packRefs.map((ref) => enabledDependencyEntries(ref.pack.dependencies, "rules")),
        ),
      ),
      configuredHooksToRefs(
        Object.assign(
          {},
          ...packRefs.map((ref) => enabledDependencyEntries(ref.pack.dependencies, "hooks")),
        ),
      ),
    ],
    { concurrency: "unbounded" },
  );

  const directSkillNames = new Set(skillRefs.map((ref) => ref.skill.name));
  const directCommandNames = new Set(commandRefs.map((ref) => ref.command.name));
  const directMcpServerNames = new Set(mcpServerRefs.map((ref) => ref.server.name));
  const directSubagentNames = new Set(subagentRefs.map((ref) => ref.subagent.name));
  const directFilesNames = new Set(fileRefs.map((ref) => ref.file.name));
  const directRuleNames = new Set(ruleRefs.map((ref) => ref.rule.name));
  const directHookNames = new Set(hookRefs.map((ref) => ref.hook.name));

  const materializedSubagentRefs = [
    ...subagentRefs,
    ...packSubagentRefs.filter((ref) => !directSubagentNames.has(ref.subagent.name)),
  ];
  const declaredMcpServerNames = new Set([
    ...Object.entries(configuredMcpServerEntries)
      .filter(([, entry]) => entry.enabled)
      .map(([name]) => name),
    ...packMcpServerRefs.map((ref) => ref.server.name),
  ]);

  return {
    expectedSubagentNames: new Set(materializedSubagentRefs.map((ref) => ref.subagent.name)),
    steps: [
      ...skillRefs.map((ref) => buildMaterializeOperation(skillManager, { ref })),
      ...packSkillRefs
        .filter((ref) => !directSkillNames.has(ref.skill.name))
        .map((ref) => buildMaterializeOperation(skillManager, { ref })),
      ...commandRefs.map((ref) => buildMaterializeOperation(commandManager, { ref })),
      ...packCommandRefs
        .filter((ref) => !directCommandNames.has(ref.command.name))
        .map((ref) => buildMaterializeOperation(commandManager, { ref })),
      ...mcpServerRefs.map((ref) =>
        buildMcpServerSyncOperation({ ref, fs, path, ws, renderer, agentRepo }),
      ),
      ...Object.entries(configuredMcpServerEntries)
        .filter(([, entry]) => entry.enabled && isInlineMcpServerEntry(entry))
        .map(([name, entry]) =>
          buildInlineMcpServerSyncOperation({
            name,
            entry,
            agentIds: configuredAgents,
            fs,
            path,
            ws,
          }),
        ),
      ...packMcpServerRefs
        .filter((ref) => !directMcpServerNames.has(ref.server.name))
        .map((ref) => buildMcpServerSyncOperation({ ref, fs, path, ws, renderer, agentRepo })),
      ...(configuredAgents.length > 0 && declaredMcpServerNames.size > 0
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
      ...materializedSubagentRefs.map((ref) => buildMaterializeOperation(subagentManager, { ref })),
      ...fileRefs.map((ref) => buildMaterializeOperation(fileManager, { ref })),
      ...packFileRefs
        .filter((ref) => !directFilesNames.has(ref.file.name))
        .map((ref) => buildMaterializeOperation(fileManager, { ref })),
      ...ruleRefs.map((ref) => buildMaterializeOperation(ruleManager, { ref })),
      ...packRuleRefs
        .filter((ref) => !directRuleNames.has(ref.rule.name))
        .map((ref) => buildMaterializeOperation(ruleManager, { ref })),
      ...hookRefs.map((ref) => buildMaterializeOperation(hookManager, { ref })),
      ...packHookRefs
        .filter((ref) => !directHookNames.has(ref.hook.name))
        .map((ref) => buildMaterializeOperation(hookManager, { ref })),
    ] satisfies ReadonlyArray<PlannedJobStep>,
  };
});

const makeSyncPlan = (steps: ReadonlyArray<PlannedJobStep>): Plan =>
  resolvePlan({
    name: PLAN_NAME,
    description: PLAN_DESCRIPTION,
    steps,
    concurrency: "unbounded",
  });

const previewPlan = (plan: Plan): PlanResolution => ({
  _tag: "PreviewedPlan",
  name: plan.name,
  description: plan.description,
  jobs: plan.jobs,
});

const regionLabel = (count: number): string => (count === 1 ? "region" : "regions");

const fileLabel = (count: number): string => (count === 1 ? "file" : "files");

const renderWorkspaceGeneratorRegionPhase = Effect.fn("Sync.renderWorkspaceGeneratorRegionPhase")(
  function* (dryRun: boolean) {
    const ws = yield* WorkspaceMutations;
    return yield* renderWorkspaceGeneratorRegions({
      workspaceRoot: ws.baseDir,
      dryRun,
    });
  },
);

const reportWorkspaceGeneratorDryRun = Effect.fn("Sync.reportWorkspaceGeneratorDryRun")(function* (
  changedFiles: number,
  renderedRegions: number,
) {
  if (renderedRegions === 0) return;
  const renderer = yield* CliRenderer;
  yield* renderer.info(
    `Would render ${renderedRegions} workspace generator ${regionLabel(renderedRegions)} across ${changedFiles} ${fileLabel(changedFiles)}`,
  );
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
  const renderer = yield* CliRenderer;
  const { steps, expectedSubagentNames } = yield* collectMaterializeSteps();

  if (steps.length === 0) {
    const workspaceRegions = yield* renderWorkspaceGeneratorRegionPhase(args.dryRun);
    if (workspaceRegions.renderedRegions > 0) {
      if (args.dryRun) {
        yield* reportWorkspaceGeneratorDryRun(
          workspaceRegions.changedFiles,
          workspaceRegions.renderedRegions,
        );
      } else {
        yield* renderer.success(
          `Rendered ${workspaceRegions.renderedRegions} workspace generator ${regionLabel(workspaceRegions.renderedRegions)} across ${workspaceRegions.changedFiles} ${fileLabel(workspaceRegions.changedFiles)}`,
        );
      }
      yield* renderInstructionPhase(args.dryRun);
      return;
    }
    yield* renderInstructionPhase(args.dryRun);
    if (!args.dryRun) {
      yield* cleanupStaleManagedSubagentFiles({ expectedSubagentNames });
    }
    if (
      yield* emitNoOpResult("sync", {
        planName: PLAN_NAME,
        planDescription: PLAN_DESCRIPTION,
        message: "Nothing to materialize",
      })
    ) {
      return;
    }
    yield* renderer.success("Nothing to materialize");
    return;
  }

  const plan = makeSyncPlan(steps);

  if (args.dryRun) {
    yield* displayPlan(plan);
    const workspaceRegions = yield* renderWorkspaceGeneratorRegionPhase(true);
    yield* reportWorkspaceGeneratorDryRun(
      workspaceRegions.changedFiles,
      workspaceRegions.renderedRegions,
    );
    yield* renderInstructionPhase(true);
    yield* emitPlanResolutionResult("sync", previewPlan(plan));
    return;
  }

  const executed = yield* applyPlan(plan);
  yield* cleanupStaleManagedSubagentFiles({ expectedSubagentNames });
  const workspaceRegions = yield* renderWorkspaceGeneratorRegionPhase(false);
  if (workspaceRegions.renderedRegions > 0) {
    yield* renderer.success(
      `Rendered ${workspaceRegions.renderedRegions} workspace generator ${regionLabel(workspaceRegions.renderedRegions)} across ${workspaceRegions.changedFiles} ${fileLabel(workspaceRegions.changedFiles)}`,
    );
  }
  yield* renderInstructionPhase(false);
  yield* displayPlan(executed);
  yield* emitPlanResolutionResult("sync", executed);
});
