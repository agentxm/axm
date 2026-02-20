/**
 * Pack-specific install plan builder.
 *
 * Accepts a PackExtensionRef and constructs the full install plan:
 * - An InstallPackOperation for the pack itself (built from the ref)
 * - InstallSkillOperations for resolved skill dependencies
 * Diffs operations against lockfile state to determine no-op vs new install.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { PackExtensionRef } from "../../../sources/types.js";
import type { Plan, PlannedJobStep } from "../../../workspace/plan.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { InstallCommandOperation } from "../../../extensions/commands/operations/install.js";
import type { InstallMcpServerOperation } from "../../../extensions/mcp-servers/operations/install.js";
import type { InstallPackOperation } from "../../../extensions/packs/operations/install.js";

/**
 * Union of operation types produced by the pack install plan builder.
 */
export type PackInstallOp =
  | InstallPackOperation
  | InstallSkillOperation
  | InstallCommandOperation
  | InstallMcpServerOperation;

/**
 * Arguments for building a pack install plan.
 */
export interface BuildInstallPlanArgs {
  /** The pack extension ref to install */
  readonly ref: PackExtensionRef;
  /** Already-resolved skill install operations */
  readonly skillOps: ReadonlyArray<InstallSkillOperation>;
  /** Already-resolved command install operations */
  readonly commandOps: ReadonlyArray<InstallCommandOperation>;
  /** Already-resolved MCP server install operations */
  readonly mcpServerOps: ReadonlyArray<InstallMcpServerOperation>;
  /** Current lockfile state for no-op detection */
  readonly lockfile: Lockfile;
  /** Plan display name */
  readonly name: string;
  /** Plan description */
  readonly description: Option.Option<string>;
  /** Version constraint from the original input */
  readonly versionConstraint: Option.Option<string>;
}

/**
 * Build a plan by constructing operations from a PackExtensionRef
 * and comparing against the lockfile.
 *
 * Pure function — no Effect needed.
 */
export const buildInstallPlan = (args: BuildInstallPlanArgs): Plan<PackInstallOp> => {
  const {
    ref,
    skillOps,
    commandOps,
    mcpServerOps,
    lockfile,
    name,
    description,
    versionConstraint,
  } = args;

  // Build InstallPackOperation from the ref
  const packOp: InstallPackOperation = {
    name: "install-pack",
    args: {
      packName: ref.pack.name,
      namespace: ref.refType === "registry" ? ref.namespace : "",
      resolvedVersion: ref.refType === "registry" ? ref.version : "",
      integrity: ref.refType === "registry" ? ref.integrity : "",
      sourceName: "default",
      resolvedSkills: { ...ref.pack.skills },
      resolvedCommands: { ...ref.pack.commands },
      resolvedMcpServers: { ...ref.pack.mcpServers },
      versionConstraint,
      ref,
    },
  };

  // Combine: pack first, then skills, commands, mcp-servers
  const ops: ReadonlyArray<PackInstallOp> = [packOp, ...skillOps, ...commandOps, ...mcpServerOps];

  return {
    name,
    description,
    jobs: [
      {
        concurrency: 1,
        steps: ops.map((op): PlannedJobStep<PackInstallOp> => {
          if (op.name === "install-pack") {
            const lockedPacks = lockfile.packs ?? {};
            const installed = Object.hasOwn(lockedPacks, op.args.packName);
            return installed
              ? {
                  _tag: "PlannedJobStep",
                  operation: op,
                  readiness: { status: "skip", message: "already installed" },
                  label: op.args.packName,
                }
              : {
                  _tag: "PlannedJobStep",
                  operation: op,
                  readiness: { status: "ready", message: Option.none() },
                  label: op.args.packName,
                };
          }
          if (op.name === "install-skill") {
            const installed = Object.hasOwn(lockfile.skills, op.args.ref.skill.name);
            return installed
              ? {
                  _tag: "PlannedJobStep",
                  operation: op,
                  readiness: { status: "skip", message: "already installed" },
                  label: op.args.ref.skill.name,
                }
              : {
                  _tag: "PlannedJobStep",
                  operation: op,
                  readiness: { status: "ready", message: Option.none() },
                  label: op.args.ref.skill.name,
                };
          }
          if (op.name === "install-command") {
            const lockedCommands = lockfile.commands ?? {};
            const installed = Object.hasOwn(lockedCommands, op.args.ref.command.name);
            return installed
              ? {
                  _tag: "PlannedJobStep",
                  operation: op,
                  readiness: { status: "skip", message: "already installed" },
                  label: op.args.ref.command.name,
                }
              : {
                  _tag: "PlannedJobStep",
                  operation: op,
                  readiness: { status: "ready", message: Option.none() },
                  label: op.args.ref.command.name,
                };
          }
          // install-mcp-server
          const lockedMcpServers = lockfile.mcpServers ?? {};
          const installed = Object.hasOwn(lockedMcpServers, op.args.ref.server.name);
          return installed
            ? {
                _tag: "PlannedJobStep",
                operation: op,
                readiness: { status: "skip", message: "already installed" },
                label: op.args.ref.server.name,
              }
            : {
                _tag: "PlannedJobStep",
                operation: op,
                readiness: { status: "ready", message: Option.none() },
                label: op.args.ref.server.name,
              };
        }),
      },
    ],
  };
};
