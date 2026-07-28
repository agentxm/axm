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
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import {
  buildMaterializeOperation,
  configuredCommandsToDiskRefs,
  enabledConfiguredEntries,
  configuredMcpServersToDiskRefs,
  configuredSkillsToDiskRefs,
  configuredSubagentsToDiskRefs,
  parseRegistrySourceRef,
  isConfiguredEntryEnabled,
  sanitizeName,
  targetFromRef,
  toLabelWithCompanions,
  toStepKey,
  type ExtensionTypePlural,
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
import { FilesManager, renderWorkspaceGeneratorRegions } from "@agentxm/client-core/unstable/files";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import type { CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import {
  applyPlan,
  previewOrApplyPlan,
  resolvePlan,
  type JobStepArtifact,
  type JobStepResult,
  type Operation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import {
  cleanupStaleManagedSubagentFiles,
  displayPlan,
  WorkspaceMutations,
  resolveConfiguredFiles,
  resolveConfiguredHook,
  resolveConfiguredRule,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

export interface HandleSyncArgs {
  readonly dryRun: boolean;
  readonly force: boolean;
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
    const outcomes = yield* Effect.forEach(
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
    );
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

const configuredFilesToRefs = (
  entries: Readonly<Record<string, { readonly source: string; readonly enabled: boolean }>>,
) =>
  Effect.forEach(
    enabledConfiguredEntries(entries),
    ([name, entry]) =>
      resolveConfiguredFiles(name, entry.source).pipe(Effect.map(({ ref }) => ref)),
    { concurrency: "unbounded" },
  );

const configuredRulesToRefs = (
  entries: Readonly<Record<string, { readonly source: string; readonly enabled: boolean }>>,
) =>
  Effect.forEach(
    enabledConfiguredEntries(entries),
    ([name, entry]) => resolveConfiguredRule(name, entry.source).pipe(Effect.map(({ ref }) => ref)),
    { concurrency: "unbounded" },
  );

const configuredHooksToRefs = (
  entries: Readonly<Record<string, { readonly source: string; readonly enabled: boolean }>>,
) =>
  Effect.forEach(
    enabledConfiguredEntries(entries),
    ([name, entry]) => resolveConfiguredHook(name, entry.source).pipe(Effect.map(({ ref }) => ref)),
    { concurrency: "unbounded" },
  );

export const collectMaterializeSteps = Effect.fn("Sync.collectMaterializeSteps")(function* (args?: {
  readonly force: boolean;
}) {
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
  const env = { fs, path, baseDir: ws.baseDir, scope: ws.scope };
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
          ...packRefs.map((ref) => dependencyEntries(ref.pack.dependencies, "skills")),
        ),
      ),
      configuredCommandsToDiskRefs(
        env,
        Object.assign(
          {},
          ...packRefs.map((ref) => dependencyEntries(ref.pack.dependencies, "commands")),
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
          ...packRefs.map((ref) => dependencyEntries(ref.pack.dependencies, "subagents")),
        ),
      ),
      configuredFilesToRefs(
        Object.assign(
          {},
          ...packRefs.map((ref) => dependencyEntries(ref.pack.dependencies, "files")),
        ),
      ),
      configuredRulesToRefs(
        Object.assign(
          {},
          ...packRefs.map((ref) => dependencyEntries(ref.pack.dependencies, "rules")),
        ),
      ),
      configuredHooksToRefs(
        Object.assign(
          {},
          ...packRefs.map((ref) => dependencyEntries(ref.pack.dependencies, "hooks")),
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
    ...enabledConfiguredEntries(configuredMcpServerEntries).map(([name]) => name),
    ...packMcpServerRefs.map((ref) => ref.server.name),
  ]);
  const skillMaterializeStep = (ref: SkillExtensionRef) =>
    buildMaterializeOperation(skillManager, {
      ref,
      message: `Synced skill ${ref.skill.name}`,
      buildArtifact: () => skillSyncArtifact({ ref, agentRepo, fs, path, ws }),
    });
  const commandMaterializeStep = (ref: CommandExtensionRef) =>
    buildMaterializeOperation(commandManager, {
      ref,
      message: `Synced command ${ref.command.name}`,
      buildArtifact: () => commandSyncArtifact({ ref, ws }),
    });
  const subagentMaterializeStep = (ref: SubagentExtensionRef) =>
    buildMaterializeOperation(subagentManager, {
      ref,
      message: `Synced subagent ${ref.subagent.name}`,
      buildArtifact: () => subagentSyncArtifact({ ref, ws }),
    });

  return {
    expectedSubagentNames: new Set(materializedSubagentRefs.map((ref) => ref.subagent.name)),
    steps: [
      ...skillRefs.map(skillMaterializeStep),
      ...packSkillRefs
        .filter((ref) => !directSkillNames.has(ref.skill.name))
        .map(skillMaterializeStep),
      ...commandRefs.map(commandMaterializeStep),
      ...packCommandRefs
        .filter((ref) => !directCommandNames.has(ref.command.name))
        .map(commandMaterializeStep),
      ...mcpServerRefs.map((ref) =>
        buildMcpServerSyncOperation({ ref, fs, path, ws, renderer, agentRepo }),
      ),
      ...Object.entries(configuredMcpServerEntries)
        .filter(([, entry]) => isConfiguredEntryEnabled(entry) && isInlineMcpServerEntry(entry))
        .map(([name, entry]) =>
          buildInlineMcpServerSyncOperation({
            name,
            entry,
            agentIds: configuredAgents,
            force: args?.force ?? false,
            fs,
            path,
            ws,
          }),
        ),
      ...packMcpServerRefs
        .filter((ref) => !directMcpServerNames.has(ref.server.name))
        .map((ref) => buildMcpServerSyncOperation({ ref, fs, path, ws, renderer, agentRepo })),
      ...(configuredAgents.length > 0
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
      ...materializedSubagentRefs.map(subagentMaterializeStep),
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

const makeSyncPlan = ({
  materializeSteps,
  workspaceGeneratorStep,
}: {
  readonly materializeSteps: ReadonlyArray<PlannedJobStep>;
  readonly workspaceGeneratorStep: Option.Option<PlannedJobStep>;
}): Plan => ({
  _tag: "Plan",
  name: PLAN_NAME,
  description: Option.some(PLAN_DESCRIPTION),
  jobs: [
    ...(materializeSteps.length > 0
      ? [{ concurrency: "unbounded" as const, steps: materializeSteps }]
      : []),
    ...(Option.isSome(workspaceGeneratorStep)
      ? [{ concurrency: 1 as const, steps: [workspaceGeneratorStep.value] }]
      : []),
  ],
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

  return Option.some({
    key: "workspace-generator-regions",
    label: "workspace generator regions",
    readiness: "ready",
    run,
  } satisfies PlannedJobStep);
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
  const ws = yield* WorkspaceMutations;
  const { steps, expectedSubagentNames } = yield* collectMaterializeSteps({ force: args.force });
  const workspaceGeneratorStep = yield* collectWorkspaceGeneratorStep();

  // A degraded lockfile is work even when nothing needs materializing: `axm sync`
  // is the command users are pointed at to recover one, so it must not short-circuit
  // to a no-op before reconciliation has had a chance to run.
  const lockfileNeedsRecovery = (yield* ws.getLockfileState()) !== "ok";

  if (steps.length === 0 && Option.isNone(workspaceGeneratorStep) && !lockfileNeedsRecovery) {
    yield* renderInstructionPhase(args.dryRun);
    if (!args.dryRun) {
      yield* cleanupStaleManagedSubagentFiles({ expectedSubagentNames });
    }
    yield* emitNoOpOutcome("sync", {
      planName: PLAN_NAME,
      planDescription: PLAN_DESCRIPTION,
      message: "Workspace materialization is up to date",
    });
    return;
  }

  const plan = makeSyncPlan({ materializeSteps: steps, workspaceGeneratorStep });

  // `previewOrApplyPlan` rather than `applyPlan`: it prepends the lockfile
  // recovery job when the lockfile is missing or unreadable.
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: true,
    force: args.force,
    preview: args.dryRun,
    displayApplied: false,
  });

  if (resolution._tag === "PreviewedPlan") {
    yield* renderInstructionPhase(true);
    yield* emitPlanResolutionResult("sync", resolution);
    return;
  }

  yield* cleanupStaleManagedSubagentFiles({ expectedSubagentNames });
  yield* renderInstructionPhase(false);
  yield* displayPlan(resolution);
  yield* emitPlanResolutionResult("sync", resolution);
});
