/**
 * Unpack command handler -- Effect-based orchestration for `axm packs unpack`.
 *
 * Flattens a pack's resolved extensions into settings.json as direct entries,
 * preserves existing direct entries, and removes the pack entry from settings
 * and lockfile.
 *
 * Uses plan-based approach: emits install-skill, install-command,
 * install-mcp-server ops (with skipSettings: false) to promote extensions,
 * then an uninstall-pack op to remove the pack.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../../app-error/index.js";
import { Output } from "../../../output/index.js";
import { Activity } from "../../../activity/index.js";
import { TelemetryClient } from "../../../telemetry/index.js";
import { Workspace } from "../../../workspace/index.js";
import { installSkill } from "../../../extensions/skills/operations/install.js";
import { installCommand } from "../../../extensions/commands/operations/install.js";
import { installMcpServer } from "../../../extensions/mcp-servers/operations/install.js";
import { uninstallPack } from "../../../extensions/packs/operations/uninstall.js";
import { bridgeLegacyPlan } from "../../../workspace/plan-bridge.js";
import {
  buildRegistrySkillRef,
  buildRegistryCommandRef,
  buildRegistryMcpServerRef,
} from "../../../extensions/index.js";
import type { InstallSkillOperation } from "../../../extensions/skills/operations/install.js";
import type { InstallCommandOperation } from "../../../extensions/commands/operations/install.js";
import type { InstallMcpServerOperation } from "../../../extensions/mcp-servers/operations/install.js";
import type { RegistrySource } from "../../../sources/index.js";
import { buildUnpackPlan } from "./plan.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs unpack command.
 */
export interface UnpackHandlerArgs {
  /** Pack name (FQN like @namespace/name). */
  readonly name: string;
  /** Enforce strict MCP agent-sync outcomes while promoting pack MCP servers. */
  readonly strictAgentSync?: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs unpack` command.
 */
export const handleUnpack = Effect.fn("UnpackPack.handle")(function* (args: UnpackHandlerArgs) {
  const tc = yield* TelemetryClient;
  yield* tc.trackEvent("command_invoked", { command: "packs unpack" });
  const ws = yield* Workspace;
  const output = yield* Output;
  const activity = yield* Activity;

  yield* output.info("axm packs unpack");

  // Validate pack exists in lockfile
  const entry = yield* activity.withSpinner(
    "Checking pack...",
    () =>
      Effect.gen(function* () {
        const lockedPack = yield* ws.getLockedPack(args.name);

        if (Option.isNone(lockedPack)) {
          return yield* Effect.fail(
            makeAppError({
              code: "PACK_NOT_INSTALLED",
              what: `Pack "${args.name}" is not installed`,
              howToFix: "Install the pack first with `axm packs install`.",
            }),
          );
        }

        const entry = lockedPack.value;

        if (entry.type !== "registry") {
          return yield* Effect.fail(
            makeAppError({
              code: "PACK_UNPACK_UNSUPPORTED",
              what: `Cannot unpack "${args.name}" — only registry packs can be unpacked`,
            }),
          );
        }

        return entry;
      }),
    { successMessage: `Found ${args.name}` },
  );

  // Look up the registry source used for this pack
  const sourceOpt = yield* ws.getConfiguredSourceByName(entry.sourceName);
  const source: RegistrySource =
    Option.isSome(sourceOpt) && sourceOpt.value.type === "registry"
      ? {
          type: "registry",
          location: sourceOpt.value.location,
          namespace: Option.none(),
        }
      : {
          type: "registry",
          location: new URL("file:///unknown"),
          namespace: Option.none(),
        };

  // Build install ops from pack's resolved maps (skipSettings: false for unpack)
  const skillOps: ReadonlyArray<InstallSkillOperation> = Object.entries(entry.resolvedSkills).map(
    ([fqn, version]) => ({
      name: "install-skill" as const,
      args: {
        ref: buildRegistrySkillRef(fqn, version, source),
        force: false,
        versionConstraint: Option.none<string>(),
        skipSettings: Option.none<boolean>(),
        sourceName: Option.none<string>(),
      },
    }),
  );

  const commandOps: ReadonlyArray<InstallCommandOperation> = Object.entries(
    entry.resolvedCommands,
  ).map(([fqn, version]) => ({
    name: "install-command" as const,
    args: {
      ref: buildRegistryCommandRef(fqn, version, source),
      force: false,
      versionConstraint: Option.none<string>(),
      skipSettings: Option.none<boolean>(),
    },
  }));

  const mcpServerOps: ReadonlyArray<InstallMcpServerOperation> = Object.entries(
    entry.resolvedMcpServers,
  ).map(([fqn, version]) => ({
    name: "install-mcp-server" as const,
    args: {
      ref: buildRegistryMcpServerRef(fqn, version, source),
      force: false,
      versionConstraint: Option.none<string>(),
      skipSettings: Option.none<boolean>(),
      strictAgentSync: args.strictAgentSync ? Option.some(true) : Option.none<boolean>(),
    },
  }));

  // Load configured extensions for no-op detection
  const configuredSkills = yield* ws.getConfiguredSkills();
  const configuredCommands = yield* ws.getConfiguredCommands();
  const configuredMcpServers = yield* ws.getConfiguredMcpServers();

  // Build and execute plan
  const plan = buildUnpackPlan({
    skillOps,
    commandOps,
    mcpServerOps,
    uninstallPackOp: { name: "uninstall-pack", args: { packName: args.name } },
    configuredSkillNames: Object.keys(configuredSkills),
    configuredCommandNames: Object.keys(configuredCommands),
    configuredMcpServerNames: Object.keys(configuredMcpServers),
    name: "Unpack pack",
    description: Option.some(`Unpack ${args.name} into direct settings entries`),
  });

  yield* ws.resolvePlan(
    bridgeLegacyPlan(plan, {
      "install-skill": installSkill,
      "install-command": installCommand,
      "install-mcp-server": installMcpServer,
      "uninstall-pack": uninstallPack,
    }),
  );

  yield* output.success("Done");
});
