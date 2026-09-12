/**
 * One member of a pack graph transition.
 *
 * A member is acquired without writing its own settings entry — the pack's
 * dependency map already declares it — and without validating its observable
 * projection on its own, because the enclosing transition renders every
 * shared aggregate once at the end.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  HookManager,
  KnowledgeManager,
  NO_MATERIALIZATION_OBSERVATION,
  RuleManager,
  SkillManager,
  SubagentManager,
  type ExtensionManagerFailure,
  type ManagerRequirements,
  type MaterializationObservation,
} from "@agentxm/extension-materialization";
import { installMcpServer } from "@agentxm/workspace-reconciliation";
import {
  buildInstallOperation,
  extensionRefLifecycleWarnings,
  extensionRefRegistryLifecycle,
  toLabelWithCompanions,
} from "@agentxm/workspace-reconciliation";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { JobStepArtifact, PlannedJobStep } from "@agentxm/workspace-operations";
import { WorkspaceMutations } from "@agentxm/workspace-state";

import { lifecycleStepFailure } from "../step-failure.js";
import type { InstallStepRequirements } from "../install/vocabulary.js";
import { registrySourceArtifact } from "./artifact.js";

export type PackMemberRef =
  | SkillExtensionRef
  | McpServerExtensionRef
  | SubagentExtensionRef
  | RuleExtensionRef
  | HookExtensionRef
  | KnowledgeExtensionRef;

const registrySourceArtifactWithCoverage = (args: {
  readonly ref: ExtensionRef;
  readonly scope: JobStepArtifact["scope"];
  readonly installedBefore: boolean;
  readonly materialization: Effect.Effect<
    MaterializationObservation,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}) =>
  Effect.gen(function* () {
    const artifact = registrySourceArtifact(args);
    const materialization = yield* args.materialization;
    return { ...artifact, agents: materialization.agents } satisfies JobStepArtifact;
  });

/** Build the install closure for one pack member. */
export const buildPackMemberInstallStep: (args: {
  readonly ref: PackMemberRef;
  readonly graphComplete: boolean;
  readonly nonInteractive: boolean;
}) => Effect.Effect<
  PlannedJobStep<InstallStepRequirements>,
  never,
  HookManager | KnowledgeManager | RuleManager | SkillManager | SubagentManager | WorkspaceMutations
> = Effect.fn("InstallExtensions.buildPackMemberInstallStep")(function* (args: {
  readonly ref: PackMemberRef;
  readonly graphComplete: boolean;
  readonly nonInteractive: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const ref = args.ref;

  if (ref.type === "skill") {
    const skillManager = yield* SkillManager;
    return buildInstallOperation(skillManager, {
      toStepFailure: lifecycleStepFailure,
      ref,

      enclosingClosure: { projections: [], postconditions: [ref.type] },
      installedBefore: args.graphComplete
        ? skillManager.isInstalled({ target: { type: "skill", name: ref.skill.name } })
        : Effect.succeed(false),
      buildArtifact: ({ installedBefore, materialization }) =>
        registrySourceArtifactWithCoverage({
          ref,
          scope: ws.scope,
          installedBefore,
          materialization: Effect.succeed(
            Option.match(materialization, {
              onNone: () => NO_MATERIALIZATION_OBSERVATION,
              onSome: (facts) => facts.observation,
            }),
          ),
        }),
    });
  }

  if (ref.type === "mcp-server") {
    const base = {
      key: `mcp-server:${ref.server.name}`,
      label: toLabelWithCompanions(
        { type: "mcp-server", name: ref.server.name },
        ref.refType === "registry" ? ref.packages : [],
      ),
      run: installMcpServer({
        name: "install-mcp-server",
        args: {
          ref,
          nonInteractive: args.nonInteractive,
          force: false,

          strictAgentSync: Option.some(true),
          env: Option.none(),
        },
      }).pipe(Effect.mapError(lifecycleStepFailure)),
    };
    const warnings = extensionRefLifecycleWarnings(ref);
    const registryLifecycle = extensionRefRegistryLifecycle(ref);
    return warnings.length === 0
      ? ({
          ...base,
          readiness: "ready",
          ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
        } satisfies PlannedJobStep<InstallStepRequirements>)
      : ({
          ...base,
          readiness: "warn",
          warnMessage: warnings.join("; "),
          ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
        } satisfies PlannedJobStep<InstallStepRequirements>);
  }

  if (ref.type === "subagent") {
    const subagentManager = yield* SubagentManager;
    return buildInstallOperation(subagentManager, {
      toStepFailure: lifecycleStepFailure,
      ref,

      enclosingClosure: { projections: [], postconditions: [ref.type] },
      installedBefore: args.graphComplete
        ? subagentManager.isInstalled({ target: { type: "subagent", name: ref.subagent.name } })
        : Effect.succeed(false),
      buildArtifact: ({ installedBefore, materialization }) =>
        registrySourceArtifactWithCoverage({
          ref,
          scope: ws.scope,
          installedBefore,
          materialization: Effect.succeed(
            Option.match(materialization, {
              onNone: () => NO_MATERIALIZATION_OBSERVATION,
              onSome: (facts) => facts.observation,
            }),
          ),
        }),
    });
  }

  if (ref.type === "rule") {
    const ruleManager = yield* RuleManager;
    return buildInstallOperation(ruleManager, {
      toStepFailure: lifecycleStepFailure,
      ref,

      enclosingClosure: { projections: [ref.type], postconditions: [ref.type] },
      installedBefore: args.graphComplete
        ? ruleManager.isInstalled({ target: { type: "rule", name: ref.rule.name } })
        : Effect.succeed(false),
      buildArtifact: ({ installedBefore }) =>
        registrySourceArtifactWithCoverage({
          ref,
          scope: ws.scope,
          installedBefore,
          materialization: ruleManager.aggregateProjectionObservation,
        }),
    });
  }

  if (ref.type === "hook") {
    const hookManager = yield* HookManager;
    return buildInstallOperation(hookManager, {
      toStepFailure: lifecycleStepFailure,
      ref,

      enclosingClosure: { projections: [ref.type], postconditions: [ref.type] },
      installedBefore: args.graphComplete
        ? hookManager.isInstalled({ target: { type: "hook", name: ref.hook.name } })
        : Effect.succeed(false),
      buildArtifact: ({ installedBefore }) =>
        registrySourceArtifactWithCoverage({
          ref,
          scope: ws.scope,
          installedBefore,
          materialization: hookManager.aggregateProjectionObservation,
        }),
    });
  }

  const knowledgeManager = yield* KnowledgeManager;
  return buildInstallOperation(knowledgeManager, {
    toStepFailure: lifecycleStepFailure,
    ref,

    enclosingClosure: { projections: [ref.type], postconditions: [ref.type] },
    installedBefore: args.graphComplete
      ? knowledgeManager.isInstalled({ target: { type: "knowledge", name: ref.knowledge.name } })
      : Effect.succeed(false),
    buildArtifact: ({ installedBefore }) =>
      Effect.succeed(registrySourceArtifact({ ref, scope: ws.scope, installedBefore })),
  });
});
