/**
 * Pack-specific uninstall plan builder.
 *
 * Diffs UninstallPackOperations against lockfile state to produce a Plan.
 * Installed packs become expected-success steps; missing packs become expected-no-op steps.
 * Removable skills (orphaned by the uninstall) become uninstall-skill steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile, PackLockEntry } from "../../../lockfile/schema.js";
import { makeStep } from "../../../workspace/plan.js";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { UninstallCommandOperation } from "../../../extensions/commands/operations/uninstall.js";
import type { UninstallMcpServerOperation } from "../../../extensions/mcp-servers/operations/uninstall.js";
import type { UninstallPackOperation } from "../../../extensions/packs/operations/uninstall.js";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";

/**
 * Union of operation types produced by the pack uninstall plan builder.
 */
export type PackUninstallOp =
  | UninstallPackOperation
  | UninstallSkillOperation
  | UninstallCommandOperation
  | UninstallMcpServerOperation;

/**
 * Extract the simple name (last segment) from a skill FQN.
 * E.g., `@acme/skills/code-review` -> `code-review`
 */
const simpleNameFromFqn = (fqn: string): string => {
  const parts = fqn.split("/");
  return parts[parts.length - 1]!;
};

/**
 * Compute FQNs orphaned by pack removal: candidates from packs being removed,
 * minus those still referenced by remaining packs, minus directly configured ones.
 */
const computeOrphanedFqns = (
  lockedPacks: Record<string, PackLockEntry>,
  removingNames: ReadonlySet<string>,
  configured: ReadonlyArray<string>,
  getResolvedFqns: (entry: PackLockEntry) => Record<string, string>,
): {
  readonly removable: ReadonlyArray<string>;
  readonly preservedConfigured: ReadonlyArray<string>;
} => {
  const candidates = new Set<string>();
  const remaining = new Set<string>();
  for (const [packName, entry] of Object.entries(lockedPacks)) {
    if (removingNames.has(packName)) {
      for (const fqn of Object.keys(getResolvedFqns(entry))) {
        candidates.add(fqn);
      }
    } else {
      for (const fqn of Object.keys(getResolvedFqns(entry))) {
        remaining.add(fqn);
      }
    }
  }
  const configuredSet = new Set(configured);
  const removable: string[] = [];
  const preservedConfigured: string[] = [];

  for (const fqn of candidates) {
    if (remaining.has(fqn)) {
      continue;
    }
    if (configuredSet.has(simpleNameFromFqn(fqn))) {
      preservedConfigured.push(fqn);
      continue;
    }
    removable.push(fqn);
  }

  return { removable, preservedConfigured };
};

/**
 * Arguments for building a pack uninstall plan.
 */
export interface BuildUninstallPlanArgs {
  /** Uninstall operations to plan */
  readonly ops: ReadonlyArray<UninstallPackOperation>;
  /** Current lockfile state for installed-pack detection */
  readonly lockfile: Lockfile;
  /** Directly configured skill names (protected from orphan removal) */
  readonly configuredSkills: ReadonlyArray<string>;
  /** Plan display name */
  readonly name: string;
  /** Plan description */
  readonly description: Option.Option<string>;
  /** Directly configured command names (protected from orphan removal) */
  readonly configuredCommands: ReadonlyArray<string>;
  /** Directly configured MCP server names (protected from orphan removal) */
  readonly configuredMcpServers: ReadonlyArray<string>;
}

/**
 * Build an uninstall plan by comparing pack operations against the lockfile.
 * Computes removable skills, commands, and MCP servers inline and emits
 * uninstall steps for each orphaned extension.
 *
 * Pure function — no Effect needed.
 */
export const buildUninstallPlan = (args: BuildUninstallPlanArgs): Plan<PackUninstallOp> => {
  const {
    ops,
    lockfile,
    configuredSkills,
    name,
    description,
    configuredCommands,
    configuredMcpServers,
  } = args;
  const lockedPacks = lockfile.packs ?? {};
  const removingNames = new Set(ops.map((op) => op.args.packName));

  // Build pack steps
  const packSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> = ops.map((op) => {
    const installed = Object.hasOwn(lockedPacks, op.args.packName);
    return makeStep<PackUninstallOp>(op, op.args.packName, installed, "not installed");
  });

  // Compute orphaned extensions
  const skillDisposition = computeOrphanedFqns(
    lockedPacks,
    removingNames,
    configuredSkills,
    (entry) => entry.resolvedSkills,
  );
  const commandDisposition = computeOrphanedFqns(
    lockedPacks,
    removingNames,
    configuredCommands,
    (entry) => entry.resolvedCommands,
  );
  const mcpServerDisposition = computeOrphanedFqns(
    lockedPacks,
    removingNames,
    configuredMcpServers,
    (entry) => entry.resolvedMcpServers,
  );

  const removableSkillFqns = skillDisposition.removable;
  const removableCommandFqns = commandDisposition.removable;
  const removableMcpServerFqns = mcpServerDisposition.removable;

  const skillSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> = removableSkillFqns.map(
    (fqn) => {
      const op: UninstallSkillOperation = {
        name: "uninstall-skill",
        args: { skillName: simpleNameFromFqn(fqn), agents: [] },
      };
      return makeStep<PackUninstallOp>(op, fqn, true, "");
    },
  );

  const commandSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> = removableCommandFqns.map(
    (fqn) => {
      const op: UninstallCommandOperation = {
        name: "uninstall-command",
        args: { commandName: simpleNameFromFqn(fqn) },
      };
      return makeStep<PackUninstallOp>(op, fqn, true, "");
    },
  );

  const mcpServerSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> = removableMcpServerFqns.map(
    (fqn) => {
      const op: UninstallMcpServerOperation = {
        name: "uninstall-mcp-server",
        args: { serverName: simpleNameFromFqn(fqn) },
      };
      return makeStep<PackUninstallOp>(op, fqn, true, "");
    },
  );

  const preservedSkillSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> =
    skillDisposition.preservedConfigured.map((fqn) => {
      const op: UninstallSkillOperation = {
        name: "uninstall-skill",
        args: { skillName: simpleNameFromFqn(fqn), agents: [] },
      };
      return makeStep<PackUninstallOp>(
        op,
        fqn,
        false,
        "preserved (directly configured in settings)",
      );
    });

  const preservedCommandSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> =
    commandDisposition.preservedConfigured.map((fqn) => {
      const op: UninstallCommandOperation = {
        name: "uninstall-command",
        args: { commandName: simpleNameFromFqn(fqn) },
      };
      return makeStep<PackUninstallOp>(
        op,
        fqn,
        false,
        "preserved (directly configured in settings)",
      );
    });

  const preservedMcpServerSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> =
    mcpServerDisposition.preservedConfigured.map((fqn) => {
      const op: UninstallMcpServerOperation = {
        name: "uninstall-mcp-server",
        args: { serverName: simpleNameFromFqn(fqn) },
      };
      return makeStep<PackUninstallOp>(
        op,
        fqn,
        false,
        "preserved (directly configured in settings)",
      );
    });

  return {
    name,
    description,
    jobs: [
      {
        concurrency: 1,
        steps: [
          ...packSteps,
          ...skillSteps,
          ...commandSteps,
          ...mcpServerSteps,
          ...preservedSkillSteps,
          ...preservedCommandSteps,
          ...preservedMcpServerSteps,
        ],
      },
    ],
  };
};
