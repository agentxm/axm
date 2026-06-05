/**
 * Pack-specific unpack plan builder.
 *
 * Accepts pre-built install operations and an UninstallPackOperation,
 * and constructs the full unpack plan with inline run closures:
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

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { installSkill, type InstallSkillOperation } from "@agentxm/client-core/unstable/skills";
import {
  installCommand,
  type InstallCommandOperation,
} from "@agentxm/client-core/unstable/commands";
import {
  installMcpServer,
  type InstallMcpServerOperation,
} from "@agentxm/client-core/unstable/mcps";
import { uninstallPack, type UninstallPackOperation } from "@agentxm/client-core/unstable/packs";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";

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
 * Captures workspace services and constructs inline run closures.
 * Order: install ops first (skills, commands, mcps), uninstall-pack last.
 * Extensions already directly configured become no-op steps.
 */
export const buildUnpackPlan = (args: BuildUnpackPlanArgs) =>
  Effect.gen(function* () {
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

    // Capture services for run closures
    const workspace = yield* WorkspaceMutations;
    const sources = yield* SourceHostProviders;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const renderer = yield* CliRenderer;
    const agentRepo = yield* CodingAgentRepository;

    const provideServices = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        | WorkspaceMutations
        | SourceHostProviders
        | FileSystem.FileSystem
        | Path.Path
        | CliRenderer
        | CodingAgentRepository
      >,
    ): Effect.Effect<A, E, never> =>
      effect.pipe(
        Effect.provideService(WorkspaceMutations, workspace),
        Effect.provideService(SourceHostProviders, sources),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(CliRenderer, renderer),
        Effect.provideService(CodingAgentRepository, agentRepo),
      );

    const makeRunClosure = (op: PackUnpackOp): Effect.Effect<JobStepResult, AppError, never> => {
      const runOperation = (() => {
        switch (op.name) {
          case "install-skill":
            return installSkill(op);
          case "install-command":
            return installCommand(op);
          case "install-mcp-server":
            return installMcpServer(op);
          case "uninstall-pack":
            return uninstallPack(op);
        }
      })();

      return provideServices(runOperation).pipe(
        Effect.map(
          (result): JobStepResult =>
            result.result === "error"
              ? { result: "error", message: result.message, error: result.error }
              : result,
        ),
      );
    };

    const steps: ReadonlyArray<PlannedJobStep> = [
      // Install ops first
      ...skillOps.map((op): PlannedJobStep => {
        const alreadyConfigured = configuredSkillNames.includes(op.args.ref.skill.name);
        if (alreadyConfigured) {
          return {
            readiness: "ready",
            label: op.args.ref.skill.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              message: "already directly installed",
            }),
          };
        }
        return { readiness: "ready", label: op.args.ref.skill.name, run: makeRunClosure(op) };
      }),
      ...commandOps.map((op): PlannedJobStep => {
        const alreadyConfigured = configuredCommandNames.includes(op.args.ref.command.name);
        if (alreadyConfigured) {
          return {
            readiness: "ready",
            label: op.args.ref.command.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              message: "already directly installed",
            }),
          };
        }
        return { readiness: "ready", label: op.args.ref.command.name, run: makeRunClosure(op) };
      }),
      ...mcpServerOps.map((op): PlannedJobStep => {
        const alreadyConfigured = configuredMcpServerNames.includes(op.args.ref.server.name);
        if (alreadyConfigured) {
          return {
            readiness: "ready",
            label: op.args.ref.server.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              message: "already directly installed",
            }),
          };
        }
        return { readiness: "ready", label: op.args.ref.server.name, run: makeRunClosure(op) };
      }),
      // Uninstall-pack last
      {
        readiness: "ready",
        label: uninstallPackOp.args.packName,
        run: makeRunClosure(uninstallPackOp),
      },
    ];

    return {
      _tag: "Plan",
      name,
      description,
      jobs: [{ steps, concurrency: 1 as const }],
    } satisfies Plan;
  });
