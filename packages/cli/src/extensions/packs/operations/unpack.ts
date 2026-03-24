/**
 * Unpack-pack operation handler.
 *
 * Flattens a pack's resolved extensions into settings.json as direct entries,
 * preserves existing direct entries, and removes the pack entry from settings
 * and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../../app-error/index.js";
import type {
  SkillLockEntry,
  CommandLockEntry,
  McpServerLockEntry,
} from "../../../lockfile/index.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { Operation, OperationResult } from "../../../workspace/plan.js";
import { Workspace } from "../../../workspace/index.js";
import { parseFqn } from "../../index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the unpack-pack operation.
 */
export type UnpackPackOperationArgs = {
  /** Pack FQN to unpack. */
  readonly name: string;
};

/**
 * Unpack a pack into direct settings entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UnpackPackOperation = Operation<"unpack-pack", UnpackPackOperationArgs>;

// -----------------------------------------------------------------------------
// Operation Handler
// -----------------------------------------------------------------------------

/**
 * Unpack operation handler.
 *
 * 1. Look up pack in lockfile for resolved extensions
 * 2. Read current settings to find existing direct skill entries
 * 3. Add resolved skills as direct entries (skip existing)
 * 4. Remove pack from settings and lockfile
 */
export const unpackPack: OperationHandler<UnpackPackOperation, Workspace> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;

    // Look up the pack in the lockfile
    const lockedPack = yield* ws.getLockedPack(op.args.name);

    if (Option.isNone(lockedPack)) {
      return yield* makeAppError({
        code: "PACK_NOT_INSTALLED",
        what: `Pack "${op.args.name}" is not installed`,
        howToFix: "Install the pack first with `axm packs install`.",
      });
    }

    const entry = lockedPack.value;

    if (entry.type !== "registry") {
      return yield* makeAppError({
        code: "PACK_UNPACK_UNSUPPORTED",
        what: `Cannot unpack "${op.args.name}" — only registry packs can be unpacked`,
      });
    }

    // Read current configured extensions to preserve existing direct entries
    const currentSkills = yield* ws.getConfiguredSkills();
    const currentCommands = yield* ws.getConfiguredCommands();
    const currentMcpServers = yield* ws.getConfiguredMcpServers();

    // Add resolved skills as direct entries (only if not already present)
    // Use the short name from the FQN as the settings key since SkillsMapSchema
    // validates keys against agentskills.io naming (no @ or / allowed).
    yield* Effect.forEach(
      Object.entries(entry.resolvedSkills),
      ([skillFqn, version]) =>
        Effect.gen(function* () {
          const parsed = yield* parseFqn(skillFqn);
          if (parsed.name in currentSkills) return; // preserve existing direct entry
          yield* ws.setSkill({
            name: parsed.name,
            lockEntry: {
              type: "registry",
              profile: parsed.handle,
              name: parsed.name,
              resolvedVersion: version,
              integrity: "",
              sourceName: entry.sourceName,
              agents: [],
              installedAt: new Date(),
              updatedAt: new Date(),
            } satisfies SkillLockEntry,
            versionConstraint: Option.none(),
          });
        }),
      { concurrency: 1 },
    );

    // Add resolved commands as direct entries
    yield* Effect.forEach(
      Object.entries(entry.resolvedCommands),
      ([commandFqn, version]) =>
        Effect.gen(function* () {
          const parsed = yield* parseFqn(commandFqn);
          if (parsed.name in currentCommands) return;
          yield* ws.setCommand({
            name: parsed.name,
            lockEntry: {
              type: "registry",
              profile: parsed.handle,
              name: parsed.name,
              resolvedVersion: version,
              integrity: "",
              sourceName: entry.sourceName,
              installedAt: new Date(),
              updatedAt: new Date(),
            } satisfies CommandLockEntry,
          });
        }),
      { concurrency: 1 },
    );

    // Add resolved MCP servers as direct entries
    yield* Effect.forEach(
      Object.entries(entry.resolvedMcpServers),
      ([mcpServerFqn, version]) =>
        Effect.gen(function* () {
          const parsed = yield* parseFqn(mcpServerFqn);
          if (parsed.name in currentMcpServers) return;
          yield* ws.setMcpServer({
            name: parsed.name,
            lockEntry: {
              type: "registry",
              profile: parsed.handle,
              name: parsed.name,
              resolvedVersion: version,
              integrity: "",
              sourceName: entry.sourceName,
              installedAt: new Date(),
              updatedAt: new Date(),
            } satisfies McpServerLockEntry,
          });
        }),
      { concurrency: 1 },
    );

    // Remove the pack entry from settings and lockfile
    yield* ws.removePack(op.args.name);

    const skillCount = Object.keys(entry.resolvedSkills).length;
    const commandCount = Object.keys(entry.resolvedCommands).length;
    const mcpServerCount = Object.keys(entry.resolvedMcpServers).length;
    const totalCount = skillCount + commandCount + mcpServerCount;
    return {
      result: "success",
      message: `Unpacked ${op.args.name}: ${totalCount} extension(s) promoted to direct entries`,
    } satisfies OperationResult;
  });
