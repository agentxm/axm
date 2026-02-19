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
import type { InstallPackOperation } from "../../../extensions/packs/operations/install.js";

/**
 * Union of operation types produced by the pack install plan builder.
 */
export type PackInstallOp = InstallPackOperation | InstallSkillOperation;

/**
 * Arguments for building a pack install plan.
 */
export interface BuildInstallPlanArgs {
  /** The pack extension ref to install */
  readonly ref: PackExtensionRef;
  /** Already-resolved skill install operations */
  readonly skillOps: ReadonlyArray<InstallSkillOperation>;
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
  const { ref, skillOps, lockfile, name, description, versionConstraint } = args;

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

  // Combine pack + skill ops
  const ops: ReadonlyArray<PackInstallOp> = [packOp, ...skillOps];

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
                  expectedResult: { result: "no-op", message: "already installed" },
                  label: op.args.packName,
                }
              : {
                  _tag: "PlannedJobStep",
                  operation: op,
                  expectedResult: {
                    result: "success",
                    message: `Installed pack ${op.args.packName}`,
                  },
                  label: op.args.packName,
                };
          }
          // install-skill
          const installed = Object.hasOwn(lockfile.skills, op.args.ref.skill.name);
          return installed
            ? {
                _tag: "PlannedJobStep",
                operation: op,
                expectedResult: { result: "no-op", message: "already installed" },
                label: op.args.ref.skill.name,
              }
            : {
                _tag: "PlannedJobStep",
                operation: op,
                expectedResult: {
                  result: "success",
                  message: `Installed skill ${op.args.ref.skill.name}`,
                },
                label: op.args.ref.skill.name,
              };
        }),
      },
    ],
  };
};
