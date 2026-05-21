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
  resolveInstructionsConfig,
  syncInstructions,
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
import { installMcpServer, McpServerManager } from "@agentxm/client-core/unstable/mcp-servers";
import type { McpServerExtensionRef } from "@agentxm/client-core/unstable/mcp-servers";
import {
  ContextManager,
  renderWorkspaceGeneratorRegions,
} from "@agentxm/client-core/unstable/context";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import {
  applyPlan,
  resolvePlan,
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
  resolveConfiguredContext,
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

const configuredFilesToRefs = (
  entries: Readonly<Record<string, { readonly source: string; readonly enabled?: boolean }>>,
) =>
  Effect.forEach(
    Object.entries(entries).filter(([, entry]) => entry.enabled !== false),
    ([name, entry]) =>
      resolveConfiguredContext(name, entry.source).pipe(Effect.map(({ ref }) => ref)),
    { concurrency: "unbounded" },
  );

export const collectMaterializeSteps = Effect.fn("Sync.collectMaterializeSteps")(function* () {
  const skillManager = yield* SkillManager;
  const commandManager = yield* CommandManager;
  const mcpServerManager = yield* McpServerManager;
  const subagentManager = yield* SubagentManager;
  const fileManager = yield* ContextManager;
  const packManager = yield* PackManager;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const env = { fs, path, baseDir: ws.baseDir };

  const [skillRefs, commandRefs, mcpServerRefs, subagentRefs, fileRefs, packRefs] =
    yield* Effect.all(
      [
        skillManager.listMaterializable(),
        commandManager.listMaterializable(),
        mcpServerManager.listMaterializable(),
        subagentManager.listMaterializable(),
        fileManager.listMaterializable(),
        packManager.listMaterializable(),
      ],
      { concurrency: "unbounded" },
    );

  const [packSkillRefs, packCommandRefs, packMcpServerRefs, packSubagentRefs, packFileRefs] =
    yield* Effect.all(
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
            ...packRefs.map((ref) => dependencyEntries(ref.pack.dependencies, "mcp-servers")),
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
            ...packRefs.map((ref) => enabledDependencyEntries(ref.pack.dependencies, "context")),
          ),
        ),
      ],
      { concurrency: "unbounded" },
    );

  const directSkillNames = new Set(skillRefs.map((ref) => ref.skill.name));
  const directCommandNames = new Set(commandRefs.map((ref) => ref.command.name));
  const directMcpServerNames = new Set(mcpServerRefs.map((ref) => ref.server.name));
  const directSubagentNames = new Set(subagentRefs.map((ref) => ref.subagent.name));
  const directFileNames = new Set(fileRefs.map((ref) => ref.file.name));

  const materializedSubagentRefs = [
    ...subagentRefs,
    ...packSubagentRefs.filter((ref) => !directSubagentNames.has(ref.subagent.name)),
  ];

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
      ...packMcpServerRefs
        .filter((ref) => !directMcpServerNames.has(ref.server.name))
        .map((ref) => buildMcpServerSyncOperation({ ref, fs, path, ws, renderer, agentRepo })),
      ...materializedSubagentRefs.map((ref) => buildMaterializeOperation(subagentManager, { ref })),
      ...fileRefs.map((ref) => buildMaterializeOperation(fileManager, { ref })),
      ...packFileRefs
        .filter((ref) => !directFileNames.has(ref.file.name))
        .map((ref) => buildMaterializeOperation(fileManager, { ref })),
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

const renderInstructionPhase = Effect.fn("Sync.renderInstructionPhase")(function* (
  dryRun: boolean,
) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const config = yield* ws.getInstructionsConfig();
  if (Option.isNone(config) || config.value === false) return;

  const configuredAgents = yield* ws.getConfiguredAgents();
  const result = yield* syncInstructions({
    workspaceRoot: ws.baseDir,
    configuredAgents,
    config: resolveInstructionsConfig(config.value),
    force: false,
    dryRun,
  });
  if (result.written.length === 0) return;
  if (dryRun) {
    yield* renderer.info(`Would update ${result.written.length} instruction file(s)`);
    return;
  }
  yield* renderer.success(`Updated ${result.written.length} instruction file(s)`);
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
