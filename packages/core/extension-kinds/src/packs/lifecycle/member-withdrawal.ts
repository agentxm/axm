import * as Effect from "effect/Effect";
import type { JobStepArtifact, PlannedJobStep } from "@agentxm/workspace-kernel/operations";
import {
  buildUninstallOperation,
  exclusiveMemberRetentionPolicy,
  toStepKey,
  type InstallStepRequirements,
  type StepFailureConversionService,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  HookManager,
  KnowledgeManager,
  McpServerManager,
  RuleManager,
  SkillManager,
  SubagentManager,
} from "@agentxm/workspace-kernel/materialization";
import type {
  ExtensionTarget,
  PackExtensionTarget,
} from "@agentxm/workspace-kernel/workspace-state";

/** A Pack member: any extension a Pack can require except another Pack. */
export type PackMemberTarget = Exclude<ExtensionTarget, PackExtensionTarget>;

/** The managers that withdraw each kind of Pack member. */
export type PackMemberManagers =
  SkillManager | SubagentManager | McpServerManager | RuleManager | HookManager | KnowledgeManager;

/** How a withdrawal reports itself as a member row of its closure. */
export interface MemberWithdrawalReport {
  /** Workspace-relative path of the member's acquired package. */
  readonly path: string;
  readonly scope: JobStepArtifact["scope"];
  /** The accepted version the member leaves, when it has one. */
  readonly previousVersion?: string;
}

/** What the withdrawal settled for the member's package, as the row describes it. */
const withdrawalArtifact = (
  report: MemberWithdrawalReport,
  canonical: string,
): JobStepArtifact => ({
  path: report.path,
  scope: report.scope,
  change: "removed",
  ...(report.previousVersion === undefined ? {} : { previousVersion: report.previousVersion }),
  ...(canonical === "retained-by-component"
    ? {
        references: [
          {
            path: report.path,
            state: "retained",
            reason: "another accepted resolution still uses this package",
          },
        ],
      }
    : canonical === "preserved-authored"
      ? {
          references: [
            { path: report.path, state: "retained", reason: "workspace-authored source" },
          ],
        }
      : {}),
});

interface ReportedWithdrawal {
  readonly buildArtifact?: (args: {
    readonly settlement: { readonly canonical: string };
  }) => Effect.Effect<JobStepArtifact>;
}

/** The uninstall step for one member type, through the manager that owns it. */
const withdrawalStep = Effect.fnUntraced(function* (
  target: PackMemberTarget,
  toStepFailure: StepFailureConversionService["toStepFailure"],
  reported: ReportedWithdrawal,
): Effect.fn.Return<PlannedJobStep<InstallStepRequirements>, never, PackMemberManagers> {
  switch (target.type) {
    case "skill":
      return buildUninstallOperation(yield* SkillManager, exclusiveMemberRetentionPolicy, {
        toStepFailure,
        target,
        ...reported,
      });
    case "subagent":
      return buildUninstallOperation(yield* SubagentManager, exclusiveMemberRetentionPolicy, {
        toStepFailure,
        target,
        ...reported,
      });
    case "mcp-server":
      return buildUninstallOperation(yield* McpServerManager, exclusiveMemberRetentionPolicy, {
        nativeCleanup: "retain",
        toStepFailure,
        target,
        ...reported,
      });
    case "rule":
      return buildUninstallOperation(yield* RuleManager, exclusiveMemberRetentionPolicy, {
        toStepFailure,
        target,
        enclosingClosure: { projections: [target.type] },
        ...reported,
      });
    case "hook":
      return buildUninstallOperation(yield* HookManager, exclusiveMemberRetentionPolicy, {
        nativeCleanup: "retain",
        toStepFailure,
        target,
        enclosingClosure: { projections: [target.type] },
        ...reported,
      });
    case "knowledge":
      return buildUninstallOperation(yield* KnowledgeManager, exclusiveMemberRetentionPolicy, {
        toStepFailure,
        target,
        enclosingClosure: { projections: [target.type] },
        ...reported,
      });
  }
});

/**
 * Withdraw a Pack member no other desired route reaches, as one child of its
 * Pack's closure. Uninstalling the Pack and moving it to a manifest that no
 * longer requires the member share this step, so the member leaves the same
 * way whichever change removed its last route: its owned file outputs,
 * accepted resolution, and acquired package go, while native MCP and Hook
 * registrations remain, and the closure renders aggregate instruction units
 * once. The step locates what the member owns through its Pack route, so it
 * runs before the closure retires or replaces that route. With a `report`,
 * the closure lists the withdrawal as one of its member rows.
 */
export const exclusiveMemberWithdrawal = Effect.fnUntraced(function* (
  target: PackMemberTarget,
  toStepFailure: StepFailureConversionService["toStepFailure"],
  report?: MemberWithdrawalReport,
): Effect.fn.Return<PlannedJobStep<InstallStepRequirements>, never, PackMemberManagers> {
  const reported: ReportedWithdrawal =
    report === undefined
      ? {}
      : {
          buildArtifact: ({
            settlement,
          }: {
            readonly settlement: { readonly canonical: string };
          }) => Effect.succeed(withdrawalArtifact(report, settlement.canonical)),
        };
  const step = yield* withdrawalStep(target, toStepFailure, reported);
  return { ...step, key: toStepKey(target) };
});
