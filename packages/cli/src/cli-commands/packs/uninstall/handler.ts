/**
 * Uninstall command handler - Effect-based orchestration for `axm packs uninstall`.
 *
 * Uses plan-based reconciliation pattern:
 * 1. Load lockfile
 * 2. Expand glob pattern against lockfile keys
 * 3. Build UninstallPackOperations
 * 4. Build plan (diff against lockfile)
 * 5. Resolve plan via workspace (display, confirm, apply based on flags)
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/index.js";
import { buildUninstallPlan } from "./plan.js";
import { expandGlob } from "../../../skills/index.js";
import { uninstallCommand } from "../../../extensions/commands/operations/uninstall.js";
import { uninstallMcpServer } from "../../../extensions/mcp-servers/operations/uninstall.js";
import {
  uninstallPack,
  type UninstallPackOperation,
} from "../../../extensions/packs/operations/uninstall.js";
import { uninstallSkill } from "../../../extensions/skills/operations/uninstall.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Arguments for the packs uninstall handler.
 */
export interface UninstallPackHandlerArgs {
  /** Name or glob pattern of the pack to uninstall */
  readonly name: string;
  /** Skip confirmations */
  readonly yes: boolean;
}

// -----------------------------------------------------------------------------
// Main Handler
// -----------------------------------------------------------------------------

/**
 * Handles the `axm packs uninstall` command.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const handleUninstallPack = Effect.fn("UninstallPack.handle")(function* (
  args: UninstallPackHandlerArgs,
) {
  const ws = yield* Workspace;
  const log = yield* Log;

  yield* log.info("axm packs uninstall");

  // Step 1: Load lockfile
  const lockedPacks = yield* ws.getLockedPacks();
  const lockedSkills = yield* ws.getLockedSkills();
  const lockedCommands = yield* ws.getLockedCommands();
  const lockedMcpServers = yield* ws.getLockedMcpServers();
  const lockfile = {
    lockfileVersion: 1,
    skills: lockedSkills,
    commands: lockedCommands,
    mcpServers: lockedMcpServers,
    packs: lockedPacks,
  };

  // Step 2: Expand glob pattern
  const packNames = expandGlob(args.name, Object.keys(lockedPacks));

  // Handle glob matching zero packs
  if (args.name.includes("*") && packNames.length === 0) {
    yield* log.warn(`No packs matched pattern "${args.name}"`);
    yield* log.success("Nothing to uninstall.");
    return;
  }

  // For literal names not in lockfile, still build an operation (plan marks as no-op)
  const names = packNames.length > 0 ? packNames : [args.name];

  // Step 3: Build operations
  const ops = names.map(
    (name) =>
      ({
        name: "uninstall-pack",
        args: { packName: name },
      }) satisfies UninstallPackOperation,
  );

  // Step 4: Load configured extensions and build plan
  const configuredSkills = yield* ws.getConfiguredSkills();
  const configuredSkillNames = Object.keys(configuredSkills);
  const configuredCommands = yield* ws.getConfiguredCommands();
  const configuredCommandNames = Object.keys(configuredCommands);
  const configuredMcpServers = yield* ws.getConfiguredMcpServers();
  const configuredMcpServerNames = Object.keys(configuredMcpServers);

  const plan = buildUninstallPlan({
    ops,
    lockfile,
    configuredSkills: configuredSkillNames,
    name: "Uninstall pack(s)",
    description: Option.none(),
    configuredCommands: configuredCommandNames,
    configuredMcpServers: configuredMcpServerNames,
  });

  // Step 5: Resolve plan via workspace
  yield* ws.resolvePlan(plan, {
    "uninstall-pack": uninstallPack,
    "uninstall-skill": uninstallSkill,
    "uninstall-command": uninstallCommand,
    "uninstall-mcp-server": uninstallMcpServer,
  });

  yield* log.success("Done");
});
