import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { Argument, Command } from "effect/unstable/cli";

import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import {
  buildInstallOperation,
  fqnInvalidErrorToAppError,
  formatFqn,
  parseFqn,
} from "@agentxm/client-core/unstable/extensions";
import { FilesManager } from "@agentxm/client-core/unstable/files";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { KnowledgeManager } from "@agentxm/client-core/unstable/knowledge";
import { McpServerManager } from "@agentxm/client-core/unstable/mcps";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { previewOrApplyPlan } from "@agentxm/client-core/unstable/plan";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  WorkspaceMutations,
  resolveWorkspaceExtensionRef,
} from "@agentxm/client-core/unstable/workspace";

import { scopeFlag } from "../../cli-flags.js";
import { emitPlanResolutionResult } from "../../json-output.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

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
      case "command":
        return buildInstallOperation(yield* CommandManager, {
          ref,
          versionRange: Option.none(),
        });
      case "mcp-server":
        return buildInstallOperation(yield* McpServerManager, {
          ref,
          versionRange: Option.none(),
        });
      case "subagent":
        return buildInstallOperation(yield* SubagentManager, {
          ref,
          versionRange: Option.none(),
        });
      case "files":
        return buildInstallOperation(yield* FilesManager, {
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

export const handleAdopt = Effect.fn("Adopt.handle")(function* (args: {
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
    jobs: [{ concurrency: 1, steps: [step] }],
  };
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("adopt", resolution);
});

const config = {
  fqn: Argument.string("fqn").pipe(
    Argument.withDescription("Canonical extension FQN (@owner/<plural-type>/name)"),
  ),
  scope: scopeFlag,
  yes: yesFlag,
  preview: previewFlag,
} as const;

export const adoptCommand = Command.make("adopt", config, ({ fqn, scope, yes, preview }) =>
  handleAdopt({ fqn, yes, preview }).pipe(withWorkspace(scope), withRuntime("adopt")),
).pipe(
  withArgvTracking(config),
  Command.withDescription("Adopt a canonical package into workspace authorship"),
  Command.withExamples([
    {
      command: "axm adopt @acme/skills/code-review",
      description: "Adopt an unmanaged or retained package for authoring",
    },
  ]),
);
