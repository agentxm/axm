import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { Argument, Command, Flag } from "effect/unstable/cli";

import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { RenderedFilePathSchema, sanitizeName } from "@agentxm/client-core/unstable/extensions";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManager } from "@agentxm/client-core/unstable/mcps";
import {
  operationPresentation,
  previewOrApplyPlan,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
} from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import {
  applyProjectionPlans,
  type ProjectionPlan,
} from "@agentxm/client-core/unstable/projection";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  findManagedSubagentFiles,
  isDesiredExtensionActive,
  WorkspaceMutations,
  type DesiredExtensionNode,
} from "@agentxm/client-core/unstable/workspace";

import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { emitOperationResolution } from "../../operation-output.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";
import { collectMaterializeSteps } from "../sync/handler.js";
import { validatePackGraphPostcondition } from "./graph-transition.js";

const decodeRenderedFilePath = Schema.decodeUnknownSync(RenderedFilePathSchema);

const normalizedPackIdentity = (identity: string): string =>
  identity.startsWith("workspace:") ? identity.slice("workspace:".length) : identity;

const packContributesTo = (node: DesiredExtensionNode, packIdentity: string): boolean =>
  node.origins.some(
    (origin) => origin.type === "pack" && normalizedPackIdentity(origin.pack) === packIdentity,
  );

const remainsActiveWithoutPack = (node: DesiredExtensionNode, packIdentity: string): boolean =>
  isDesiredExtensionActive(
    node.origins.filter(
      (origin) => origin.type !== "pack" || normalizedPackIdentity(origin.pack) !== packIdentity,
    ),
  );

const dematerializeNode = Effect.fn("PacksActivation.dematerializeNode")(function* (
  node: DesiredExtensionNode,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const agentRepo = yield* CodingAgentRepository;
  const fsPathLayer = Layer.merge(
    Layer.succeed(FileSystem.FileSystem, fs),
    Layer.succeed(Path.Path, path),
  );

  switch (node.type) {
    case "skill": {
      const manager = yield* SkillManager;
      yield* manager.materializeDeactivate({ target: { type: "skill", name: node.name } });
      return;
    }
    case "mcp-server": {
      const agents = yield* agentRepo.getConfiguredAgents();
      yield* Effect.forEach(
        agents,
        (agent) =>
          agent
            .removeMcpServer({
              workspaceRoot: ws.baseDir,
              scope: ws.scope,
              serverName: node.name,
              disableOnly: true,
            })
            .pipe(
              Effect.flatMap((outcome) =>
                outcome._tag === "disabled" ||
                outcome._tag === "nothing-runnable" ||
                outcome._tag === "needs-input" ||
                outcome._tag === "misconfigured" ||
                outcome._tag === "failed"
                  ? makeAppError({
                      code: "conflict",
                      detail: `MCP server removal failed for ${agent.id}: ${outcome.reason}`,
                    })
                  : Effect.void,
              ),
            ),
        { concurrency: "unbounded" },
      );
      return;
    }
    case "subagent": {
      const agents = yield* agentRepo.getConfiguredAgents();
      yield* Effect.forEach(
        agents,
        (agent) =>
          agent.resolveEffectiveSubagentsDir({ workspaceRoot: ws.baseDir, scope: ws.scope }).pipe(
            Effect.provide(fsPathLayer),
            Effect.flatMap((resolved) =>
              resolved._tag === "supported"
                ? findManagedSubagentFiles(resolved.dir, sanitizeName(node.name)).pipe(
                    Effect.provide(fsPathLayer),
                    Effect.flatMap((managedPaths) =>
                      agent
                        .removeSubagent({
                          workspaceRoot: ws.baseDir,
                          scope: ws.scope,
                          subagentName: node.name,
                          renderedFilePaths: managedPaths.map((filePath) =>
                            decodeRenderedFilePath(path.relative(ws.baseDir, filePath)),
                          ),
                        })
                        .pipe(
                          Effect.flatMap((outcome) =>
                            outcome._tag === "conflict"
                              ? makeAppError({
                                  code: "conflict",
                                  detail: `Subagent removal failed for ${agent.id}: ${outcome.reason}`,
                                })
                              : Effect.void,
                          ),
                        ),
                    ),
                  )
                : Effect.void,
            ),
          ),
        { concurrency: "unbounded" },
      );
      return;
    }
    case "rule":
    case "hook":
    case "knowledge": {
      // These types own only aggregate projections. Their shared trailing
      // batch renders the post-transition graph once for the whole closure.
      return;
    }
    case "pack":
      return;
  }
});

// Shared aggregate units render once per closure from the complete
// desired-state contributor set, after the pack's activation change commits.
const reconcileAggregateProjections = Effect.fn("PacksActivation.reconcileAggregateProjections")(
  function* (types: ReadonlySet<string>) {
    const plans: Array<ProjectionPlan> = [];
    if (types.has("rule")) {
      const manager = yield* RuleManager;
      plans.push(...(yield* manager.projectionPlans()));
    }
    if (types.has("hook")) {
      const manager = yield* HookManager;
      plans.push(...(yield* manager.projectionPlans()));
    }
    if (types.has("knowledge")) {
      const manager = yield* KnowledgeManager;
      plans.push(...(yield* manager.projectionPlans()));
    }
    yield* applyProjectionPlans(plans);
  },
);

const AGGREGATE_UNIT_TYPES = new Set(["rule", "hook", "knowledge"]);

const runMaterializeSteps = Effect.fn("PacksActivation.runMaterializeSteps")(function* (
  packIdentity: string,
) {
  const ws = yield* WorkspaceMutations;
  const graph = yield* ws.getDesiredStateGraph();
  const hasMembers = graph.nodes.some(
    (node) => node.type !== "pack" && packContributesTo(node, packIdentity),
  );
  if (!hasMembers) return;
  const { steps } = yield* collectMaterializeSteps({
    retainedOnly: true,
    selection: { target: Option.some(packIdentity), type: Option.none() },
  });
  yield* Effect.forEach(
    steps,
    (step) =>
      step.readiness === "error"
        ? makeAppError({
            code: "conflict",
            detail: step.errorMessage,
          })
        : step.run.pipe(Effect.asVoid),
    { concurrency: 1 },
  );
});

interface PackActivationArgs {
  readonly name: string;
  readonly enabled: boolean;
  readonly yes: boolean;
  readonly preview: boolean;
}

export const handlePackActivation = (args: PackActivationArgs) =>
  withOperationLifecycle(
    {
      command: args.enabled ? "packs.enable" : "packs.disable",
      mode: args.preview ? "preview" : "apply",
      planName: args.enabled ? "Enable pack" : "Disable pack",
    },
    handlePackActivationBody(args),
  );

const handlePackActivationBody = Effect.fn("PacksActivation.handle")(function* (
  args: PackActivationArgs,
) {
  const ws = yield* WorkspaceMutations;
  const runServices = yield* Effect.context<
    | Scope.Scope
    | HttpClient.HttpClient
    | CliRenderer
    | SourceHostProviders
    | WorkspaceMutations
    | CodingAgentRepository
    | FileSystem.FileSystem
    | HookManager
    | KnowledgeManager
    | McpServerManager
    | Path.Path
    | RuleManager
    | SkillManager
    | SubagentManager
  >();
  const entries = yield* ws.getConfiguredPackEntries();
  const entry = entries[args.name];
  const verb = args.enabled ? "enable" : "disable";
  const titleVerb = args.enabled ? "Enable" : "Disable";

  if (entry === undefined) {
    return yield* makeAppError({
      code: "not_found",
      detail: `Pack "${args.name}" is not configured`,
      suggestions: [{ description: "Inspect installed packs", cmd: "axm packs list" }],
    });
  }
  if (entry.enabled === args.enabled) {
    yield* emitNoOpOutcome(`packs.${verb}`, {
      planName: `${titleVerb} pack`,
      planDescription: `${titleVerb} ${args.name}`,
      message: `Pack "${args.name}" is already ${args.enabled ? "enabled" : "disabled"}`,
    });
    return;
  }

  const graph = yield* ws.getDesiredStateGraph();
  if (!graph.complete) {
    return yield* makeAppError({
      code: "conflict",
      detail: `Cannot ${verb} the pack while desired state is unresolved`,
      suggestions: [{ description: "Inspect workspace facts", cmd: "axm lint" }],
    });
  }
  const packNode = graph.nodes.find((node) => node.type === "pack" && node.name === args.name);
  if (packNode === undefined) {
    return yield* makeAppError({ code: "not_found", detail: `Pack "${args.name}" was not found` });
  }
  const packIdentity = normalizedPackIdentity(packNode.identity);
  const affected = graph.nodes.filter(
    (node) =>
      node.type !== "pack" &&
      node.enabled &&
      packContributesTo(node, packIdentity) &&
      !remainsActiveWithoutPack(node, packIdentity),
  );
  const previewItems = args.enabled
    ? graph.nodes
        .filter((node) => node.type !== "pack" && packContributesTo(node, packIdentity))
        .map((node) => `${node.type}: ${node.name}`)
    : affected.map((node) => `${node.type}: ${node.name}`);
  const memberTargets: ReadonlyArray<JobStepArtifactTarget> = args.enabled
    ? previewItems.map((item) => ({
        path: `.axm/extensions/${item.slice(item.indexOf(": ") + 2)}`,
        change: "unchanged",
      }))
    : affected.map((node) => ({
        path: `.axm/extensions/${normalizedPackIdentity(node.identity)}`,
        change: "unchanged",
      }));
  const activationArtifact = {
    path: ".axm/settings.json",
    scope: ws.scope,
    change: "updated",
    fileCount: memberTargets.length + 1,
    targets: [{ path: ".axm/settings.json", change: "updated" }, ...memberTargets],
  } satisfies JobStepArtifact;

  const plan: Plan = {
    _tag: "Plan",
    name: `${titleVerb} pack`,
    description: Option.some(`${titleVerb} ${packIdentity} without changing locked versions`),
    presentation: operationPresentation(
      args.enabled
        ? { imperative: "enable", past: "Enabled", gerund: "Enabling" }
        : { imperative: "disable", past: "Disabled", gerund: "Disabling" },
      "pack",
    ),
    jobs: [
      {
        concurrency: 1,
        steps: [
          {
            readiness: "ready",
            label: packIdentity,
            artifact: activationArtifact,
            run: Effect.gen(function* () {
              yield* ws.runTransaction({
                transition: Effect.gen(function* () {
                  yield* ws.setPackEntry(args.name, { ...entry, enabled: args.enabled });
                  const memberTypes = args.enabled
                    ? new Set(
                        graph.nodes
                          .filter(
                            (node) => node.type !== "pack" && packContributesTo(node, packIdentity),
                          )
                          .map((node) => node.type),
                      )
                    : new Set(affected.map((node) => node.type));
                  if (args.enabled) {
                    yield* runMaterializeSteps(packIdentity);
                  } else {
                    // Aggregate units are re-rendered once below instead of
                    // per contributor.
                    yield* Effect.forEach(
                      affected.filter((node) => !AGGREGATE_UNIT_TYPES.has(node.type)),
                      dematerializeNode,
                      { concurrency: 1 },
                    );
                  }
                  yield* reconcileAggregateProjections(memberTypes);
                }).pipe(Effect.provide(runServices)),
                validate: () =>
                  validatePackGraphPostcondition({
                    requiredPacks: [
                      {
                        name: args.name,
                        identity: packIdentity,
                        enabled: args.enabled,
                      },
                    ],
                    ...(args.enabled
                      ? {}
                      : {
                          inactive: affected.map((node) => ({
                            type: node.type,
                            name: node.name,
                          })),
                        }),
                  }).pipe(Effect.provideService(WorkspaceMutations, ws)),
              });
              return {
                result: "success",
                message: `${titleVerb}d ${packIdentity}`,
                artifact: activationArtifact,
              } satisfies JobStepResult;
            }).pipe(Effect.provide(runServices)),
          },
        ],
      },
    ],
  };

  const execution = yield* makePublicPositionalPlanExecution(args, ["packs", verb], [args.name]);
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution(`packs.${verb}`, resolution, {
    suggestions: [
      { description: "Inspect installed packs", cmd: "axm packs list" },
      { description: "Undo", cmd: `axm packs ${args.enabled ? "disable" : "enable"} ${args.name}` },
    ],
  });
});

const activationConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the pack")),
  scope: scopeFlag.pipe(Flag.withDescription("Use project (default) or user-level configuration")),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
} as const;

const makeActivationCommand = (enabled: boolean) => {
  const verb = enabled ? "enable" : "disable";
  return Command.make(verb, activationConfig, ({ name, scope, yes, preview }) =>
    handlePackActivation({ name, enabled, yes, preview }).pipe(
      withWorkspace(scope),
      withRuntime(`packs ${verb}`),
    ),
  ).pipe(
    withArgvTracking(activationConfig),
    Command.withDescription(
      `${enabled ? "Enable" : "Disable"} a pack without changing locked versions`,
    ),
    Command.withExamples([
      {
        command: `axm packs ${verb} frontend-tools --preview`,
        description: `Preview ${verb} effects and dependency provenance`,
      },
    ]),
  );
};

export const enableCommand = makeActivationCommand(true);
export const disableCommand = makeActivationCommand(false);
