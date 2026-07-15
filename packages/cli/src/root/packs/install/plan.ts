/**
 * Pack-specific install plan builder.
 *
 * Accepts a PackRef and constructs the full install plan with inline
 * run closures that capture workspace services and materialization dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/client-core/unstable/extensions";
import type { Lockfile, ResolvedExtensionMap } from "@agentxm/client-core/unstable/lockfile";
import type { RegistryPackRef } from "@agentxm/client-core/unstable/packs";
import type { JobStepResult, Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { installSkill, type InstallSkillOperation } from "@agentxm/client-core/unstable/skills";
import { installPack, type InstallPackOperation } from "@agentxm/client-core/unstable/packs";
import {
  installCommand,
  type InstallCommandOperation,
} from "@agentxm/client-core/unstable/commands";
import {
  installMcpServer,
  type InstallMcpServerOperation,
} from "@agentxm/client-core/unstable/mcps";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";

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
  readonly ref: RegistryPackRef;
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
  readonly versionRange: Option.Option<VersionRange>;
}

/**
 * Build a plan with inline run closures.
 * Captures all service dependencies during plan construction.
 */
export const buildInstallPlan = (args: BuildInstallPlanArgs) =>
  Effect.gen(function* () {
    const { ref, skillOps, commandOps, mcpServerOps, lockfile, name, description, versionRange } =
      args;

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

    const resolvedSkills = Object.fromEntries(
      skillOps.flatMap((op) =>
        op.args.ref.refType === "registry"
          ? [
              [
                formatFqn({
                  owner: op.args.ref.owner,
                  type: "skill",
                  name: decodeExtensionNameSync(op.args.ref.name),
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
                  owner: op.args.ref.owner,
                  type: "command",
                  name: decodeExtensionNameSync(op.args.ref.name),
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
                  owner: op.args.ref.owner,
                  type: "mcp-server",
                  name: decodeExtensionNameSync(op.args.ref.name),
                }),
                op.args.ref.version,
              ],
            ]
          : [],
      ),
    );

    const resolvedSubagents: ResolvedExtensionMap = {};
    const resolvedRules: ResolvedExtensionMap = {};
    const resolvedHooks: ResolvedExtensionMap = {};

    // Build InstallPackOperation from the ref
    const packOp: InstallPackOperation = {
      name: "install-pack",
      args: {
        packName: ref.pack.name,
        owner: ref.owner,
        resolvedVersion: ref.version,
        integrity: Option.getOrElse(ref.integrity, () => ""),
        sourceName: "default",
        ...(ref.publisherBindingId === undefined
          ? {}
          : { publisherBindingId: ref.publisherBindingId }),
        resolvedSkills,
        resolvedCommands,
        resolvedMcpServers,
        resolvedSubagents,
        resolvedRules,
        resolvedHooks,
        versionRange,
        ref,
      },
    };

    const makeRunClosure = (op: PackInstallOp): Effect.Effect<JobStepResult, AppError, never> => {
      const runOperation = (() => {
        switch (op.name) {
          case "install-pack":
            return installPack(op);
          case "install-skill":
            return installSkill(op);
          case "install-command":
            return installCommand(op);
          case "install-mcp-server":
            return installMcpServer(op);
        }
      })();

      return provideServices(runOperation).pipe(
        Effect.map((result): JobStepResult =>
          result.result === "error"
            ? { result: "error", message: result.message, error: result.error }
            : { result: "success", message: result.message },
        ),
      );
    };

    // Combine: pack first, then skills, commands, mcps
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
