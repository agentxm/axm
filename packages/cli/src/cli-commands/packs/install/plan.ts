/**
 * Pack-specific install plan builder.
 *
 * Accepts a PackExtensionRef and constructs the full install plan with inline
 * run closures that capture workspace services and materialization dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { formatFqn } from "@axm.sh/core/unstable/extensions";
import type { Lockfile } from "@axm.sh/core/unstable/lockfile";
import type { PackExtensionRef } from "@axm.sh/core/unstable/sources";
import type { Plan, PlannedJobStep, JobStepResult } from "../../../workspace/plan.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { InstallCommandOperation } from "../../../extensions/commands/operations/install.js";
import type { InstallMcpServerOperation } from "../../../extensions/mcp-servers/operations/install.js";
import type { InstallPackOperation } from "../../../extensions/packs/operations/install.js";
import { installSkill } from "../../../extensions/skills/operations/install.js";
import { installCommand } from "../../../extensions/commands/operations/install.js";
import { installMcpServer } from "../../../extensions/mcp-servers/operations/install.js";
import { installPack } from "../../../extensions/packs/operations/install.js";
import { Workspace } from "../../../workspace/index.js";
import { SourceHostProviders } from "../../../sources/index.js";
import { Output } from "@axm.sh/core/unstable/output";

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
 * Build a plan with inline run closures.
 * Captures all service dependencies during plan construction.
 */
export const buildInstallPlan = (args: BuildInstallPlanArgs) =>
  Effect.gen(function* () {
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

    // Capture services for run closures
    const workspace = yield* Workspace;
    const sources = yield* SourceHostProviders;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const output = yield* Output;

    const provideServices = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        Workspace | SourceHostProviders | FileSystem.FileSystem | Path.Path | Output
      >,
    ): Effect.Effect<A, E, never> =>
      effect.pipe(
        Effect.provideService(Workspace, workspace),
        Effect.provideService(SourceHostProviders, sources),
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.provideService(Output, output),
      );

    const resolvedSkills = Object.fromEntries(
      skillOps.flatMap((op) =>
        op.args.ref.refType === "registry"
          ? [
              [
                formatFqn({ handle: op.args.ref.profile, type: "skills", name: op.args.ref.name }),
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
                  handle: op.args.ref.profile,
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
                  handle: op.args.ref.profile,
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
        profile: ref.refType === "registry" ? ref.profile : "",
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

    const makeRunClosure = (
      op: PackInstallOp,
    ): Effect.Effect<JobStepResult, import("@axm.sh/core/unstable/app-error").AppError, never> => {
      const handler =
        op.name === "install-pack"
          ? installPack
          : op.name === "install-skill"
            ? installSkill
            : op.name === "install-command"
              ? installCommand
              : installMcpServer;

      return provideServices(
        // Assertion needed: handler union loses specific type after dynamic dispatch

        (
          handler as (
            op: PackInstallOp,
          ) => Effect.Effect<
            import("../../../workspace/plan.js").OperationResult,
            import("@axm.sh/core/unstable/app-error").AppError,
            never
          >
        )(op),
      ).pipe(
        Effect.map(
          (result): JobStepResult =>
            result.result === "error"
              ? { result: "error", message: result.message, error: result.error }
              : { result: "success", message: result.message },
        ),
      );
    };

    // Combine: pack first, then skills, commands, mcp-servers
    const ops: ReadonlyArray<PackInstallOp> = [packOp, ...skillOps, ...commandOps, ...mcpServerOps];

    const steps: PlannedJobStep[] = ops.map((op): PlannedJobStep => {
      if (op.name === "install-pack") {
        const lockedPacks = lockfile.packs ?? {};
        const installed = Object.hasOwn(lockedPacks, op.args.packName);
        if (installed) {
          return {
            readiness: "ready",
            label: op.args.packName,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              message: `${op.args.packName} already installed`,
            }),
          };
        }
        return { readiness: "ready", label: op.args.packName, run: makeRunClosure(op) };
      }
      if (op.name === "install-skill") {
        const installed = Object.hasOwn(lockfile.skills, op.args.ref.skill.name);
        if (installed) {
          return {
            readiness: "ready",
            label: op.args.ref.skill.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              message: `${op.args.ref.skill.name} already installed`,
            }),
          };
        }
        return { readiness: "ready", label: op.args.ref.skill.name, run: makeRunClosure(op) };
      }
      if (op.name === "install-command") {
        const lockedCommands = lockfile.commands ?? {};
        const installed = Object.hasOwn(lockedCommands, op.args.ref.command.name);
        if (installed) {
          return {
            readiness: "ready",
            label: op.args.ref.command.name,
            run: Effect.succeed<JobStepResult>({
              result: "success",
              message: `${op.args.ref.command.name} already installed`,
            }),
          };
        }
        return { readiness: "ready", label: op.args.ref.command.name, run: makeRunClosure(op) };
      }
      // install-mcp-server
      const lockedMcpServers = lockfile.mcpServers ?? {};
      const installed = Object.hasOwn(lockedMcpServers, op.args.ref.server.name);
      if (installed) {
        return {
          readiness: "ready",
          label: op.args.ref.server.name,
          run: Effect.succeed<JobStepResult>({
            result: "success",
            message: `${op.args.ref.server.name} already installed`,
          }),
        };
      }
      return { readiness: "ready", label: op.args.ref.server.name, run: makeRunClosure(op) };
    });

    return {
      _tag: "Plan",
      name,
      description,
      jobs: [
        {
          concurrency: 1 as const,
          steps,
        },
      ],
    } satisfies Plan;
  });
