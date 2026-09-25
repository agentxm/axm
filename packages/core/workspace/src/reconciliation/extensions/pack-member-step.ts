/**
 * One member of a Pack graph transition — the same step whether the Pack is
 * being installed, updated, or recovered by sync.
 *
 * A member is acquired without writing its own settings entry, because the
 * Pack's dependency map already declares it, and without validating its
 * observable projection on its own, because the enclosing transition renders
 * every shared aggregate once at the end. What differs per surface is passed
 * in: whether an agent that cannot accept the member refuses the closure, and
 * whether accepted content is re-acquired even when it is still usable.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { RuleExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/rule";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

import { WorkspaceLocation } from "../../desired-state/index.js";
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
} from "../../materialization/index.js";
import type {
  JobStepArtifact,
  PlannedJobStep,
  StepFailure,
} from "../../transitions/planning/index.js";
import { registrySourceArtifact } from "../../packs/lifecycle/artifact.js";
import { extensionRefLifecycleWarnings } from "../../lifecycle/warnings.js";
import { installMcpServer, type McpServerInstallRequirements } from "../mcps/install-operation.js";
import {
  buildInstallOperation,
  extensionRefRegistryLifecycle,
  toLabelWithCompanions,
  type CallerStepFailure,
  type InstallArtifactPresentation,
  type RecipeRequirements,
} from "./operations.js";

/** What a member step declares: its manager, the recipe, and the MCP install route. */
export type PackMemberStepRequirements =
  ManagerRequirements | RecipeRequirements | McpServerInstallRequirements;

export type PackMemberRef =
  | SkillExtensionRef
  | McpServerExtensionRef
  | SubagentExtensionRef
  | RuleExtensionRef
  | HookExtensionRef
  | KnowledgeExtensionRef;

export interface PackMemberStepArgs {
  readonly ref: PackMemberRef;
  readonly nonInteractive: boolean;
  /**
   * Whether an agent that cannot accept the member refuses the whole closure.
   * Install and update are strict; sync and recovery degrade and report.
   */
  readonly strictAgentSync: boolean;
  /** Re-acquire canonical content even when the accepted content is usable. */
  readonly force?: boolean;
  readonly toStepFailure: (failure: CallerStepFailure<ExtensionManagerFailure>) => StepFailure;
}

const memberPresentation = (args: {
  readonly ref: ExtensionRef;
  readonly scope: JobStepArtifact["scope"];
  readonly change: JobStepArtifact["change"];
  readonly observation: Effect.Effect<
    MaterializationObservation,
    ExtensionManagerFailure,
    ManagerRequirements
  >;
}): Effect.Effect<InstallArtifactPresentation, ExtensionManagerFailure, ManagerRequirements> =>
  args.observation.pipe(Effect.map(({ agents }) => ({ ...registrySourceArtifact(args), agents })));

/** Build the closure for one Pack member. */
export const buildPackMemberStep: (
  args: PackMemberStepArgs,
) => Effect.Effect<
  PlannedJobStep<PackMemberStepRequirements>,
  never,
  HookManager | KnowledgeManager | RuleManager | SkillManager | SubagentManager | WorkspaceLocation
> = Effect.fn("Reconciliation.buildPackMemberStep")(function* (args: PackMemberStepArgs) {
  const location = yield* WorkspaceLocation;
  const { ref, toStepFailure } = args;
  const common = {
    toStepFailure,
    enclosingClosure: { projections: [ref.type], postconditions: [ref.type] },
    ...(args.force === undefined ? {} : { force: args.force }),
  } as const;
  const observed = (
    observation: Effect.Effect<
      MaterializationObservation,
      ExtensionManagerFailure,
      ManagerRequirements
    >,
  ) => ({
    buildArtifact: ({ change }: { readonly change: JobStepArtifact["change"] }) =>
      memberPresentation({ ref, scope: location.scope, change, observation }),
  });
  const materialized = ({
    change,
    materialization,
  }: {
    readonly change: JobStepArtifact["change"];
    readonly materialization: Option.Option<{ readonly observation: MaterializationObservation }>;
  }) =>
    memberPresentation({
      ref,
      scope: location.scope,
      change,
      observation: Effect.succeed(
        Option.match(materialization, {
          onNone: () => NO_MATERIALIZATION_OBSERVATION,
          onSome: (facts) => facts.observation,
        }),
      ),
    });

  switch (ref.type) {
    case "skill":
      return buildInstallOperation(yield* SkillManager, {
        ...common,
        ref,
        buildArtifact: materialized,
      });
    case "subagent":
      return buildInstallOperation(yield* SubagentManager, {
        ...common,
        ref,
        buildArtifact: materialized,
      });
    case "rule": {
      const manager = yield* RuleManager;
      return buildInstallOperation(manager, {
        ...common,
        ref,
        ...observed(manager.aggregateProjectionObservation),
      });
    }
    case "hook": {
      const manager = yield* HookManager;
      return buildInstallOperation(manager, {
        ...common,
        ref,
        ...observed(manager.aggregateProjectionObservation),
      });
    }
    case "knowledge":
      return buildInstallOperation(yield* KnowledgeManager, {
        ...common,
        ref,
        buildArtifact: ({ change }) =>
          Effect.succeed(registrySourceArtifact({ ref, scope: location.scope, change })),
      });
    case "mcp-server": {
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
            force: args.force === true,
            strictAgentSync: Option.some(args.strictAgentSync),
            env: Option.none(),
          },
        }).pipe(Effect.mapError(toStepFailure)),
      };
      const warnings = extensionRefLifecycleWarnings(ref);
      const registryLifecycle = extensionRefRegistryLifecycle(ref);
      return warnings.length === 0
        ? ({
            ...base,
            readiness: "ready",
            ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
          } satisfies PlannedJobStep<PackMemberStepRequirements>)
        : ({
            ...base,
            readiness: "warn",
            warnMessage: warnings.join("; "),
            ...(registryLifecycle === undefined ? {} : { registryLifecycle }),
          } satisfies PlannedJobStep<PackMemberStepRequirements>);
    }
  }
});
