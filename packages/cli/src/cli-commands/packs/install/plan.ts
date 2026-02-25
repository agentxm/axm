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
import { formatFqn } from "../../../extensions/fqn.js";
import type { Lockfile } from "../../../lockfile/schema.js";
import type { PackExtensionRef } from "../../../sources/types.js";
import { makeStep } from "../../../workspace/plan.js";
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

  const resolvedSkills = Object.fromEntries(
    skillOps.flatMap((op) =>
      op.args.ref.refType === "registry"
        ? [
            [
              formatFqn({
                namespace: op.args.ref.namespace,
                type: "skills",
                name: op.args.ref.name,
              }),
              op.args.ref.version,
            ],
          ]
        : [],
    ),
  );

  const resolvedCommands = Object.fromEntries(
    commandOps.flatMap((op) =>
      op.args.ref.refType === "registry"
        ? [
            [
              formatFqn({
                namespace: op.args.ref.namespace,
                type: "commands",
                name: op.args.ref.name,
              }),
              op.args.ref.version,
            ],
          ]
        : [],
    ),
  );

  const resolvedMcpServers = Object.fromEntries(
    mcpServerOps.flatMap((op) =>
      op.args.ref.refType === "registry"
        ? [
            [
              formatFqn({
                namespace: op.args.ref.namespace,
                type: "mcp-servers",
                name: op.args.ref.name,
              }),
              op.args.ref.version,
            ],
          ]
        : [],
    ),
  );

  // Build InstallPackOperation from the ref
  const packOp: InstallPackOperation = {
    name: "install-pack",
    args: {
      packName: ref.pack.name,
      namespace: ref.refType === "registry" ? ref.namespace : "",
      resolvedVersion: ref.refType === "registry" ? ref.version : "",
      integrity: ref.refType === "registry" ? ref.integrity : "",
      sourceName: "default",
      resolvedSkills,
      resolvedCommands,
      resolvedMcpServers,
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
            return makeStep(op, op.args.packName, !installed, "already installed");
          }
          if (op.name === "install-skill") {
            const installed = Object.hasOwn(lockfile.skills, op.args.ref.skill.name);
            return makeStep(op, op.args.ref.skill.name, !installed, "already installed");
          }
          if (op.name === "install-command") {
            const lockedCommands = lockfile.commands ?? {};
            const installed = Object.hasOwn(lockedCommands, op.args.ref.command.name);
            return makeStep(op, op.args.ref.command.name, !installed, "already installed");
          }
          // install-mcp-server
          const lockedMcpServers = lockfile.mcpServers ?? {};
          const installed = Object.hasOwn(lockedMcpServers, op.args.ref.server.name);
          return makeStep(op, op.args.ref.server.name, !installed, "already installed");
        }),
      },
    ],
  };
};
