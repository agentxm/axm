import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command } from "effect/unstable/cli";
import * as HttpClient from "effect/unstable/http/HttpClient";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import {
  buildInstallOperation,
  fqnInvalidErrorToAppError,
  formatFqn,
  parseFqn,
  targetFromRef,
  toStepKey,
} from "@agentxm/client-core/unstable/extensions";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import {
  installMcpServer,
  McpServerManager,
  type WorkspaceMcpServerRef,
} from "@agentxm/client-core/unstable/mcps";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { operationPresentation, previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  WorkspaceMutations,
  resolveWorkspaceExtensionRef,
} from "@agentxm/client-core/unstable/workspace";
import { surfaceRestorationIncomplete } from "@agentxm/client-core/unstable/workspace";

import { emitOperationResolution } from "../../operation-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { makePublicPositionalPlanExecution } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";

const workspaceMcpAdoptionOperation = Effect.fn("Adopt.workspaceMcpOperation")(function* (
  ref: WorkspaceMcpServerRef,
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;
  const httpClient = yield* HttpClient.HttpClient;
  const source = `workspace:${ref.owner}/mcps/${ref.name}`;
  const transition = installMcpServer({
    name: "install-mcp-server",
    args: {
      ref,
      force: false,
      allowWorkspaceSourceTransition: true,
      versionRange: Option.none(),
      skipSettings: Option.none(),
      env: Option.none(),
    },
  }).pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.provideService(WorkspaceMutations, ws),
    Effect.provideService(CliRenderer, renderer),
    Effect.provideService(CodingAgentRepository, agentRepo),
    Effect.provideService(HttpClient.HttpClient, httpClient),
  );
  return {
    key: toStepKey(targetFromRef(ref)),
    label: `Adopt ${ref.owner}/mcps/${ref.name}`,
    readiness: "ready",
    run: ws
      .runTransaction({
        targets: [ref.location],
        transition,
        validate: () =>
          ws.getConfiguredMcpServerEntries().pipe(
            Effect.flatMap((configured) =>
              configured[ref.name]?.source === source
                ? Effect.void
                : makeAppError({
                    code: "internal",
                    detail: `Adopted MCP server ${ref.name} did not retain ${source} as its configured source`,
                  }),
            ),
          ),
      })
      .pipe(surfaceRestorationIncomplete),
  } satisfies PlannedJobStep;
});

const adoptStep = Effect.fn("Adopt.step")(function* (fqnInput: string) {
  const ws = yield* WorkspaceMutations;
  const parsed = yield* Effect.fromResult(
    Result.mapError(parseFqn(fqnInput), fqnInvalidErrorToAppError),
  );
  const fqn = formatFqn(parsed);
  const ref = yield* resolveWorkspaceExtensionRef({
    settingsName: parsed.name,
    source: `workspace:${fqn}`,
    expectedType: parsed.type,
    baseDir: ws.baseDir,
    scope: ws.scope,
  });

  const operation = yield* Effect.gen(function* () {
    switch (ref.type) {
      case "skill":
        return buildInstallOperation(yield* SkillManager, {
          ref,
          versionRange: Option.none(),
        });
      case "mcp-server":
        if (ref.refType === "workspace") {
          return yield* workspaceMcpAdoptionOperation(ref);
        }
        return buildInstallOperation(yield* McpServerManager, {
          ref,
          versionRange: Option.none(),
        });
      case "subagent":
        return buildInstallOperation(yield* SubagentManager, {
          ref,
          versionRange: Option.none(),
        });
      case "rule":
        return buildInstallOperation(yield* RuleManager, {
          ref,
          versionRange: Option.none(),
        });
      case "hook":
        return buildInstallOperation(yield* HookManager, {
          ref,
          versionRange: Option.none(),
        });
      case "knowledge":
        return buildInstallOperation(yield* KnowledgeManager, {
          ref,
          versionRange: Option.none(),
        });
      case "pack":
        return buildInstallOperation(yield* PackManager, {
          ref,
          versionRange: Option.none(),
        });
    }
  });
  if (operation.readiness === "error") {
    return yield* makeAppError({ code: "validation", detail: operation.errorMessage });
  }
  return { ...operation, label: `Adopt ${fqn}` } satisfies PlannedJobStep;
});

export const handleAdopt = (args: {
  readonly fqn: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) =>
  withOperationLifecycle(
    {
      command: "adopt",
      mode: args.preview ? "preview" : "apply",
      planName: "Adopt workspace extension",
    },
    handleAdoptBody(args),
  );

const handleAdoptBody = Effect.fn("Adopt.handle")(function* (args: {
  readonly fqn: string;
  readonly yes: boolean;
  readonly preview: boolean;
}) {
  const step = yield* adoptStep(args.fqn);
  const plan: Plan = {
    _tag: "Plan",
    name: "Adopt workspace extension",
    description: Option.some(
      "Adopt the canonical package as authoritative workspace source content",
    ),
    presentation: operationPresentation({
      imperative: "adopt",
      past: "Adopted",
      gerund: "Adopting",
    }),
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const execution = yield* makePublicPositionalPlanExecution(args, ["adopt"], [args.fqn]);
  const resolution = yield* previewOrApplyPlan(plan, { execution });
  yield* emitOperationResolution("adopt", resolution);
});

const config = {
  fqn: Argument.string("extension").pipe(
    Argument.withDescription("Canonical extension FQN (@owner/<plural-type>/name)"),
  ),
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const adoptCommand = Command.make("adopt", config, ({ fqn, yes, preview }) =>
  handleAdopt({ fqn, yes, preview }).pipe(withWorkspace("project"), withRuntime("adopt")),
).pipe(
  withArgvTracking(config),
  Command.withDescription("Adopt a canonical package into project-workspace authorship"),
  Command.withExamples([
    {
      command: "axm adopt @acme/skills/code-review",
      description: "Adopt an unmanaged or retained package for authoring",
    },
  ]),
);
