/**
 * Pack-specific unpack plan builder.
 *
 * Accepts pre-built install operations and an UninstallPackOperation,
 * and constructs the full unpack plan:
 * - InstallSkillOperations for each resolved skill (skipSettings: false)
 * - InstallCommandOperations for each resolved command
 * - InstallMcpServerOperations for each resolved MCP server
 * - UninstallPackOperation to remove the pack
 *
 * Diffs operations against settings state to determine no-op vs new install.
 * Extensions already directly installed become no-op steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import {
  makeLegacyStep,
  type LegacyPlan,
  type LegacyPlannedStep,
} from "@axm.sh/core/unstable/workspace";
import type { InstallSkillOperation } from "@axm.sh/core/unstable/extension-managers";
import type { InstallCommandOperation } from "@axm.sh/core/unstable/extension-managers";
import type { InstallMcpServerOperation } from "@axm.sh/core/unstable/extension-managers";
import type { UninstallPackOperation } from "@axm.sh/core/unstable/extension-managers";

/**
 * Union of operation types produced by the pack unpack plan builder.
 */
export type PackUnpackOp =
  | InstallSkillOperation
  | InstallCommandOperation
  | InstallMcpServerOperation
  | UninstallPackOperation;

/**
 * Arguments for building a pack unpack plan.
 */
export interface BuildUnpackPlanArgs {
  /** Already-resolved skill install operations */
  readonly skillOps: ReadonlyArray<InstallSkillOperation>;
  /** Already-resolved command install operations */
  readonly commandOps: ReadonlyArray<InstallCommandOperation>;
  /** Already-resolved MCP server install operations */
  readonly mcpServerOps: ReadonlyArray<InstallMcpServerOperation>;
  /** The uninstall-pack operation */
  readonly uninstallPackOp: UninstallPackOperation;
  /** Current configured skill names (for no-op detection) */
  readonly configuredSkillNames: ReadonlyArray<string>;
  /** Current configured command names (for no-op detection) */
  readonly configuredCommandNames: ReadonlyArray<string>;
  /** Current configured MCP server names (for no-op detection) */
  readonly configuredMcpServerNames: ReadonlyArray<string>;
  /** Plan display name */
  readonly name: string;
  /** Plan description */
  readonly description: Option.Option<string>;
}

/**
 * Build a plan for unpacking a pack into direct settings entries.
 *
 * Order: install ops first (skills, commands, mcp-servers), uninstall-pack last.
 * Extensions already directly configured become no-op steps.
 *
 * Pure function — no Effect needed.
 */
export const buildUnpackPlan = (args: BuildUnpackPlanArgs): LegacyPlan<PackUnpackOp> => {
  const {
    skillOps,
    commandOps,
    mcpServerOps,
    uninstallPackOp,
    configuredSkillNames,
    configuredCommandNames,
    configuredMcpServerNames,
    name,
    description,
  } = args;

  const steps: ReadonlyArray<LegacyPlannedStep<PackUnpackOp>> = [
    // Install ops first
    ...skillOps.map((op) => {
      const alreadyConfigured = configuredSkillNames.includes(op.args.ref.skill.name);
      return makeLegacyStep<PackUnpackOp>(
        op,
        op.args.ref.skill.name,
        !alreadyConfigured,
        "already directly installed",
      );
    }),
    ...commandOps.map((op) => {
      const alreadyConfigured = configuredCommandNames.includes(op.args.ref.command.name);
      return makeLegacyStep<PackUnpackOp>(
        op,
        op.args.ref.command.name,
        !alreadyConfigured,
        "already directly installed",
      );
    }),
    ...mcpServerOps.map((op) => {
      const alreadyConfigured = configuredMcpServerNames.includes(op.args.ref.server.name);
      return makeLegacyStep<PackUnpackOp>(
        op,
        op.args.ref.server.name,
        !alreadyConfigured,
        "already directly installed",
      );
    }),
    // Uninstall-pack last
    makeLegacyStep<PackUnpackOp>(uninstallPackOp, uninstallPackOp.args.packName, true, ""),
  ];

  return {
    name,
    description,
    jobs: [{ steps, concurrency: 1 }],
  };
};
