import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { detectAgents } from "@agentxm/client-core/unstable/agents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  forceFlag,
  previewFlag,
  Verbosity,
  yesFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import {
  type CompletedJobStep,
  type ExecutedPlan,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  isMalformedWorkspaceLockfileRead,
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { collectMaterializeSteps } from "../sync/handler.js";
import { buildPermissionSuggestions } from "./permission-suggestions.js";
import { dedupe, validateAgentIds } from "./shared.js";

const AGENT_SETTINGS_PATH = ".axm/settings.json";

export interface AgentsAddArgs {
  readonly ids: ReadonlyArray<string>;
  readonly detected: boolean;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

const addAgentStep = (ws: WorkspaceMutationsService, agentId: string): PlannedJobStep => ({
  label: `Add ${agentId}`,
  readiness: "ready",
  run: ws.addConfiguredAgent(agentId).pipe(
    Effect.as({
      result: "success",
      message: `Configured ${agentId}`,
      artifact: {
        path: AGENT_SETTINGS_PATH,
        scope: ws.scope,
        agents: [agentId],
        change: "updated",
        fileCount: 1,
        targets: [{ path: AGENT_SETTINGS_PATH, change: "updated", agentIds: [agentId] }],
      },
    } satisfies JobStepResult),
  ),
});

const materializationArtifact = (
  ws: WorkspaceMutationsService,
  agentIds: ReadonlyArray<string>,
): JobStepArtifact => ({
  path: "managed agent artifacts",
  scope: ws.scope,
  agents: agentIds,
  change: "updated",
  targets: agentIds.map((agentId) => ({
    path: `${agentId} managed agent artifacts`,
    change: "updated",
    agentIds: [agentId],
  })),
});

const collectWorkspacePathSet = (
  baseDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<Set<string>> =>
  Effect.gen(function* () {
    const paths = new Set<string>();
    const visit = (absolutePath: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const relativePath = path.relative(baseDir, absolutePath);
        if (relativePath.length > 0) {
          paths.add(relativePath);
        }
        const linkTarget = yield* fs.readLink(absolutePath).pipe(Effect.option);
        if (Option.isSome(linkTarget)) return;
        const stat = yield* fs.stat(absolutePath).pipe(Effect.option);
        if (Option.isNone(stat) || stat.value.type !== "Directory") return;
        const entries = yield* fs
          .readDirectory(absolutePath)
          .pipe(Effect.catch(() => Effect.succeed([])));
        for (const entry of entries) {
          yield* visit(path.join(absolutePath, entry));
        }
      });
    yield* visit(baseDir);
    return paths;
  });

const targetMatchesAgents = (
  targetAgents: ReadonlyArray<string> | undefined,
  agentIds: ReadonlyArray<string>,
): boolean =>
  targetAgents === undefined ||
  targetAgents.length === 0 ||
  targetAgents.some((agentId) => agentIds.includes(agentId));

const aggregateArtifactChange = (
  targets: ReadonlyArray<{ readonly change: JobStepArtifact["change"] }>,
  fallback: JobStepArtifact["change"],
): JobStepArtifact["change"] => {
  if (targets.length === 0) return fallback;
  if (targets.some((target) => target.change === "created")) return "created";
  if (targets.some((target) => target.change === "updated")) return "updated";
  if (targets.some((target) => target.change === "removed")) return "removed";
  return "unchanged";
};

const adjustMaterializationArtifact = (
  artifact: JobStepArtifact,
  agentIds: ReadonlyArray<string>,
  beforePaths: ReadonlySet<string>,
): JobStepArtifact => {
  if (artifact.change === "unchanged") {
    return artifact;
  }
  if (artifact.targets === undefined || artifact.targets.length === 0) {
    return artifact;
  }
  const targets = artifact.targets
    .filter((target) => targetMatchesAgents(target.agentIds, agentIds))
    .map((target) => {
      const change: JobStepArtifact["change"] = beforePaths.has(target.path)
        ? "updated"
        : "created";
      return {
        ...target,
        change,
      };
    });
  if (targets.length === 0) {
    return artifact;
  }
  const agents = artifact.agents?.filter((agentId) => agentIds.includes(agentId));
  return {
    ...artifact,
    path: targets[0]?.path ?? artifact.path,
    ...(agents === undefined || agents.length === 0 ? {} : { agents }),
    change: aggregateArtifactChange(targets, artifact.change),
    targets,
  };
};

const attachMaterializationArtifact = (
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  agentIds: ReadonlyArray<string>,
  step: PlannedJobStep,
): PlannedJobStep => {
  if (step.readiness === "error") return step;
  return {
    ...step,
    run: Effect.gen(function* () {
      const beforePaths = yield* collectWorkspacePathSet(ws.baseDir, fs, path);
      const result = yield* step.run;
      if (result.result === "error") return result;
      if (result.artifact !== undefined) {
        return {
          ...result,
          artifact: adjustMaterializationArtifact(result.artifact, agentIds, beforePaths),
        };
      }
      return {
        ...result,
        artifact: materializationArtifact(ws, agentIds),
      };
    }),
  };
};

const skipInstalledExtensionMaterializationStep = (
  ws: WorkspaceMutationsService,
  detail: string,
): PlannedJobStep => ({
  key: "installed-extension-materialization:skipped",
  label: "Materialize installed extensions",
  readiness: "ready",
  run: Effect.succeed({
    result: "success",
    message: `Skipped installed extension materialization: ${detail}. Run \`axm sync\` after fixing the workspace lockfile.`,
    artifact: {
      path: ".axm/axm-lock.yaml",
      scope: ws.scope,
      change: "unchanged",
      targets: [{ path: ".axm/axm-lock.yaml", change: "unchanged" }],
    },
  } satisfies JobStepResult),
});

const makePlan = (agentIds: ReadonlyArray<string>, steps: ReadonlyArray<PlannedJobStep>): Plan => ({
  _tag: "Plan",
  name: "Add coding agents",
  description: Option.some(`Configure ${agentIds.join(", ")} and materialize installed extensions`),
  jobs: [{ concurrency: 1, steps }],
});

const formatArtifactTargets = (artifact: JobStepArtifact): string => {
  if (artifact.targets === undefined || artifact.targets.length === 0) {
    return artifact.path;
  }
  return artifact.targets
    .map((target) => {
      const agents =
        target.agentIds === undefined || target.agentIds.length === 0
          ? undefined
          : ` [${target.agentIds.join(", ")}]`;
      return `${target.path} (${target.change})${agents ?? ""}`;
    })
    .join(", ");
};

const formatCompletedArtifactStep = (step: CompletedJobStep): string | undefined => {
  if (step.result.result !== "success" || step.result.artifact === undefined) return undefined;
  const artifact = step.result.artifact;
  const details = [
    artifact.change,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    formatArtifactTargets(artifact),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return `${step.label}   ${details.join("   ")}`;
};

const summarizeExecutedArtifacts = (plan: ExecutedPlan): string | undefined => {
  const rows = plan.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) => {
      const summary = formatCompletedArtifactStep(step);
      return summary === undefined ? [] : [summary];
    });
  return rows.length === 0 ? undefined : rows.join("\n");
};

export const handleAgentsAdd = Effect.fn("Agents.add")(function* (args: AgentsAddArgs) {
  const renderer = yield* CliRenderer;
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  if (args.ids.length === 0 && !args.detected) {
    return yield* makeAppError({
      code: "usage",
      detail: "Provide one or more agent IDs, or pass --detected.",
      suggestions: [
        { description: "List supported IDs.", cmd: "axm agents list --available" },
        { description: "Configure detected agents.", cmd: "axm agents add --detected" },
      ],
    });
  }

  const requested = yield* validateAgentIds(args.ids);
  const configured = yield* ws.getConfiguredAgents();
  const configuredSet = new Set(configured);
  const detected = args.detected
    ? yield* detectAgents(ws.baseDir).pipe(Effect.map((agents) => agents.map((agent) => agent.id)))
    : [];
  const detectedConfigurable = yield* validateAgentIds(detected);
  const agentIds = dedupe([...requested, ...detectedConfigurable]).filter(
    (id) => !configuredSet.has(id),
  );

  if (agentIds.length === 0) {
    yield* emitNoOpOutcome("agents.add", {
      planName: "Add coding agents",
      planDescription: "Configure coding agents and materialize installed extensions",
      message: "All requested agents are already configured",
    });
    return;
  }

  const materialize = yield* collectMaterializeSteps().pipe(
    Effect.catchIf(isMalformedWorkspaceLockfileRead, (error) =>
      Effect.succeed({
        expectedSubagentNames: new Set<string>(),
        steps: [skipInstalledExtensionMaterializationStep(ws, error.detail)],
      }),
    ),
  );
  const materializeSteps = materialize.steps.map((step) =>
    attachMaterializationArtifact(ws, fs, path, agentIds, step),
  );
  const plan = makePlan(agentIds, [
    ...agentIds.map((agentId) => addAgentStep(ws, agentId)),
    ...materializeSteps,
  ]);

  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    displayApplied: false,
  });
  const suggestions =
    resolution._tag === "ExecutedPlan" ? buildPermissionSuggestions(agentIds) : [];
  const fallbackSummary = [
    `-> ${AGENT_SETTINGS_PATH}   ${count(agentIds.length, "agent")}`,
    ...(materializeSteps.length === 0
      ? []
      : [`-> managed agent artifacts   ${count(agentIds.length, "agent")}`]),
  ].join("\n");
  const summary =
    resolution._tag === "ExecutedPlan"
      ? (summarizeExecutedArtifacts(resolution) ?? fallbackSummary)
      : fallbackSummary;
  const emitted = yield* emitPlanResolutionResult("agents.add", resolution, {
    summary,
    suggestions,
  });
  if (resolution._tag === "ExecutedPlan") {
    const verbosity = yield* Verbosity;
    yield* renderer.success(
      `Configured ${count(agentIds.length, "agent")}`,
      verbosity.level === "quiet"
        ? undefined
        : {
            summary,
            suggestions,
            withoutSuggestions: emitted,
          },
    );
  }
});

const addConfig = {
  ids: Argument.string("id").pipe(
    Argument.withDescription("Coding-agent IDs to configure, such as claude-code or cursor"),
    Argument.atLeast(0),
  ),
  scope: scopeFlag.pipe(
    Flag.withDescription("Add agents to project (default) or user-level configuration"),
  ),
  detected: Flag.boolean("detected").pipe(Flag.withDescription("Add detected agents")),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Apply even if the plan has unresolved warnings")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
} as const;

export const addCommand = Command.make(
  "add",
  addConfig,
  ({ ids, scope, detected, yes, force, preview }) =>
    handleAgentsAdd({ ids: [...ids], detected, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("agents add"),
    ),
).pipe(
  withArgvTracking(addConfig),
  Command.withDescription("Configure coding-agent harnesses and materialize installed extensions"),
  Command.withExamples([
    { command: "axm agents add cursor", description: "Add Cursor to this workspace" },
    {
      command: "axm agents add cursor codex --preview",
      description: "Preview configuring multiple agents",
    },
    { command: "axm agents add --detected", description: "Configure all detected agents" },
  ]),
);
