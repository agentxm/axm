/**
 * Pack-specific uninstall plan builder.
 *
 * Diffs UninstallPackOperations against lockfile state to produce a Plan with
 * inline run closures. Installed packs become ready steps; missing packs become
 * no-op success steps. Removable skills/commands/mcp-servers (orphaned by the
 * uninstall) become ready uninstall steps.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { Lockfile, PackLockEntry } from "../../../lockfile/schema.js";
import type { Plan, PlannedJobStep, JobStepResult } from "../../../workspace/plan.js";
import type { UninstallCommandOperation } from "../../../extensions/commands/operations/uninstall.js";
import type { UninstallMcpServerOperation } from "../../../extensions/mcp-servers/operations/uninstall.js";
import type { UninstallPackOperation } from "../../../extensions/packs/operations/uninstall.js";
import type { UninstallSkillOperation } from "../../../extensions/skills/operations/uninstall.js";
import { uninstallPack } from "../../../extensions/packs/operations/uninstall.js";
import { uninstallSkill } from "../../../extensions/skills/operations/uninstall.js";
import { uninstallCommand } from "../../../extensions/commands/operations/uninstall.js";
import { uninstallMcpServer } from "../../../extensions/mcp-servers/operations/uninstall.js";
import { Workspace } from "../../../workspace/index.js";
import { Log } from "../../../tui/index.js";
import type { OperationResult } from "../../../workspace/plan.js";

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
 * Build an uninstall plan with inline run closures.
 * Captures all service dependencies during plan construction.
 */
export const buildUninstallPlan = (args: BuildUninstallPlanArgs) =>
  Effect.gen(function* () {
    const {
      ops,
      lockfile,
      configuredSkills,
      name,
      description,
      configuredCommands,
      configuredMcpServers,
    } = args;

    // Capture services for run closures
    const workspace = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const log = yield* Log;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provideServices = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(
        Effect.provideService(Workspace, workspace),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(Log, log),
      ) as Effect.Effect<A, E, never>;

    const toJobStepResult = (result: OperationResult): JobStepResult =>
      result.result === "error"
        ? { result: "error", message: result.message, error: result.error }
        : { result: "success", message: result.message };

    const lockedPacks = lockfile.packs ?? {};
    const removingNames = new Set(ops.map((op) => op.args.packName));

    // Build pack steps
    const packSteps: PlannedJobStep[] = ops.map((op): PlannedJobStep => {
      const installed = Object.hasOwn(lockedPacks, op.args.packName);
      if (!installed) {
        return {
          readiness: "ready",
          label: op.args.packName,
          run: Effect.succeed<JobStepResult>({
            result: "success",
            message: `${op.args.packName} not installed`,
          }),
        };
      }
      return {
        readiness: "ready",
        label: op.args.packName,
        run: provideServices(uninstallPack(op)).pipe(Effect.map(toJobStepResult)),
      };
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

    const skillSteps: PlannedJobStep[] = skillDisposition.removable.map((fqn): PlannedJobStep => {
      const op: UninstallSkillOperation = {
        name: "uninstall-skill",
        args: { skillName: simpleNameFromFqn(fqn), agents: [] },
      };
      return {
        readiness: "ready",
        label: fqn,
        run: provideServices(uninstallSkill(op)).pipe(Effect.map(toJobStepResult)),
      };
    });

    const commandSteps: PlannedJobStep[] = commandDisposition.removable.map(
      (fqn): PlannedJobStep => {
        const op: UninstallCommandOperation = {
          name: "uninstall-command",
          args: { commandName: simpleNameFromFqn(fqn) },
        };
        return {
          readiness: "ready",
          label: fqn,
          run: provideServices(uninstallCommand(op)).pipe(Effect.map(toJobStepResult)),
        };
      },
    );

    const mcpServerSteps: PlannedJobStep[] = mcpServerDisposition.removable.map(
      (fqn): PlannedJobStep => {
        const op: UninstallMcpServerOperation = {
          name: "uninstall-mcp-server",
          args: { serverName: simpleNameFromFqn(fqn) },
        };
        return {
          readiness: "ready",
          label: fqn,
          run: provideServices(uninstallMcpServer(op)).pipe(Effect.map(toJobStepResult)),
        };
      },
    );

    // Preserved configured extensions (no-op steps)
    const preservedSteps: PlannedJobStep[] = [
      ...skillDisposition.preservedConfigured,
      ...commandDisposition.preservedConfigured,
      ...mcpServerDisposition.preservedConfigured,
    ].map(
      (fqn): PlannedJobStep => ({
        readiness: "ready",
        label: fqn,
        run: Effect.succeed<JobStepResult>({
          result: "success",
          message: `preserved (directly configured in settings)`,
        }),
      }),
    );

    return {
      name,
      description,
      jobs: [
        {
          concurrency: 1 as const,
          steps: [
            ...packSteps,
            ...skillSteps,
            ...commandSteps,
            ...mcpServerSteps,
            ...preservedSteps,
          ],
        },
      ],
    } satisfies Plan;
  });
