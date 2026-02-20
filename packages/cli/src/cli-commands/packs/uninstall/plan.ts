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
import type { Lockfile } from "../../../lockfile/schema.js";
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
 * Build an uninstall plan by comparing pack operations against the lockfile.
 * Computes removable skills, commands, and MCP servers inline and emits
 * uninstall steps for each orphaned extension.
 *
 * Pure function — no Effect needed.
 */
export const buildUninstallPlan = (
  ops: ReadonlyArray<UninstallPackOperation>,
  lockfile: Lockfile,
  configuredSkills: ReadonlyArray<string>,
  name: string,
  description: Option.Option<string>,
  configuredCommands: ReadonlyArray<string> = [],
  configuredMcpServers: ReadonlyArray<string> = [],
): Plan<PackUninstallOp> => {
  const lockedPacks = lockfile.packs ?? {};
  const removingNames = new Set(ops.map((op) => op.args.packName));

  // Build pack steps
  const packSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> = ops.map(
    (op): PlannedJobStep<PackUninstallOp> => {
      const installed = Object.hasOwn(lockedPacks, op.args.packName);
      return installed
        ? {
            _tag: "PlannedJobStep",
            operation: op,
            expectedResult: {
              result: "success",
              message: `Uninstalled pack ${op.args.packName}`,
            },
            label: op.args.packName,
          }
        : {
            _tag: "PlannedJobStep",
            operation: op,
            expectedResult: { result: "no-op", message: "not installed" },
            label: op.args.packName,
          };
    },
  );

  // --- Skill orphan computation ---
  const candidateSkillFqns = new Set<string>();
  const remainingPackSkillFqns = new Set<string>();
  for (const [packName, entry] of Object.entries(lockedPacks)) {
    if (removingNames.has(packName)) {
      for (const fqn of Object.keys(entry.resolvedSkills)) {
        candidateSkillFqns.add(fqn);
      }
    } else {
      for (const fqn of Object.keys(entry.resolvedSkills)) {
        remainingPackSkillFqns.add(fqn);
      }
    }
  }

  const configuredSkillsSet = new Set(configuredSkills);
  const removableSkillFqns = [...candidateSkillFqns].filter(
    (fqn) => !remainingPackSkillFqns.has(fqn) && !configuredSkillsSet.has(simpleNameFromFqn(fqn)),
  );

  const skillSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> = removableSkillFqns.map(
    (fqn): PlannedJobStep<PackUninstallOp> => {
      const simpleName = simpleNameFromFqn(fqn);
      const op: UninstallSkillOperation = {
        name: "uninstall-skill",
        args: { skillName: simpleName, agents: [] },
      };
      return {
        _tag: "PlannedJobStep",
        operation: op,
        expectedResult: {
          result: "success",
          message: `Uninstalled skill ${simpleName}`,
        },
        label: fqn,
      };
    },
  );

  // --- Command orphan computation ---
  const candidateCommandFqns = new Set<string>();
  const remainingPackCommandFqns = new Set<string>();
  for (const [packName, entry] of Object.entries(lockedPacks)) {
    if (removingNames.has(packName)) {
      for (const fqn of Object.keys(entry.resolvedCommands)) {
        candidateCommandFqns.add(fqn);
      }
    } else {
      for (const fqn of Object.keys(entry.resolvedCommands)) {
        remainingPackCommandFqns.add(fqn);
      }
    }
  }

  const configuredCommandsSet = new Set(configuredCommands);
  const removableCommandFqns = [...candidateCommandFqns].filter(
    (fqn) =>
      !remainingPackCommandFqns.has(fqn) && !configuredCommandsSet.has(simpleNameFromFqn(fqn)),
  );

  const commandSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> = removableCommandFqns.map(
    (fqn): PlannedJobStep<PackUninstallOp> => {
      const simpleName = simpleNameFromFqn(fqn);
      const op: UninstallCommandOperation = {
        name: "uninstall-command",
        args: { commandName: simpleName },
      };
      return {
        _tag: "PlannedJobStep",
        operation: op,
        expectedResult: {
          result: "success",
          message: `Uninstalled command ${simpleName}`,
        },
        label: fqn,
      };
    },
  );

  // --- MCP server orphan computation ---
  const candidateMcpServerFqns = new Set<string>();
  const remainingPackMcpServerFqns = new Set<string>();
  for (const [packName, entry] of Object.entries(lockedPacks)) {
    if (removingNames.has(packName)) {
      for (const fqn of Object.keys(entry.resolvedMcpServers)) {
        candidateMcpServerFqns.add(fqn);
      }
    } else {
      for (const fqn of Object.keys(entry.resolvedMcpServers)) {
        remainingPackMcpServerFqns.add(fqn);
      }
    }
  }

  const configuredMcpServersSet = new Set(configuredMcpServers);
  const removableMcpServerFqns = [...candidateMcpServerFqns].filter(
    (fqn) =>
      !remainingPackMcpServerFqns.has(fqn) && !configuredMcpServersSet.has(simpleNameFromFqn(fqn)),
  );

  const mcpServerSteps: ReadonlyArray<PlannedJobStep<PackUninstallOp>> = removableMcpServerFqns.map(
    (fqn): PlannedJobStep<PackUninstallOp> => {
      const simpleName = simpleNameFromFqn(fqn);
      const op: UninstallMcpServerOperation = {
        name: "uninstall-mcp-server",
        args: { serverName: simpleName },
      };
      return {
        _tag: "PlannedJobStep",
        operation: op,
        expectedResult: {
          result: "success",
          message: `Uninstalled MCP server ${simpleName}`,
        },
        label: fqn,
      };
    },
  );

  return {
    name,
    description,
    jobs: [
      {
        concurrency: 1,
        steps: [...packSteps, ...skillSteps, ...commandSteps, ...mcpServerSteps],
      },
    ],
  };
};
