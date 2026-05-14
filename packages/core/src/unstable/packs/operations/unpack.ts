/**
 * Unpack pack operation handler.
 *
 * Flattens a pack's resolved extensions into settings.json as direct entries,
 * preserves existing direct entries, and removes the pack entry from settings
 * and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import type {
  SkillLockEntry,
  CommandLockEntry,
  McpServerLockEntry,
  SubagentLockEntry,
} from "../../lockfile/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/index.js";
import { parseFqnOrThrow } from "../../extensions/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the unpack pack operation.
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
export const unpackPack: OperationHandler<UnpackPackOperation, WorkspaceMutations> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;

    // Look up the pack in the lockfile
    const lockedPack = yield* ws.getLockedPack(op.args.name);

    if (Option.isNone(lockedPack)) {
      return yield* makeAppError({
        code: "internal",
        detail: `Pack "${op.args.name}" is not installed`,
        breadcrumbs: [
          {
            description: "Install the pack first with `axm packs install`.",
            cmd: "axm packs install <source>",
          },
        ],
      });
    }

    const entry = lockedPack.value;

    if (entry.type !== "registry") {
      return yield* makeAppError({
        code: "internal",
        detail: `Cannot unpack "${op.args.name}" — only registry packs can be unpacked`,
      });
    }

    const now = new Date();

    // Read current configured extensions to preserve existing direct entries
    const currentSkills = yield* ws.records.getConfiguredSkills();
    const currentCommands = yield* ws.records.getConfiguredCommands();
    const currentMcpServers = yield* ws.records.getConfiguredMcpServers();
    const currentSubagents = yield* ws.records.getConfiguredSubagents();

    // Add resolved skills as direct entries (only if not already present)
    // Use the short name from the FQN as the settings key since SkillsMapSchema
    // validates keys against agentskills.io naming (no @ or / allowed).
    // Integrity unknown for individual extensions unpacked from a pack
    yield* Effect.forEach(
      Object.entries(entry.resolvedSkills),
      ([skillFqn, version]) =>
        Effect.gen(function* () {
          const parsed = parseFqnOrThrow(skillFqn);
          if (parsed.name in currentSkills) return; // preserve existing direct entry
          yield* ws.setSkill({
            name: parsed.name,
            lockEntry: {
              type: "registry",
              owner: parsed.owner,
              name: parsed.name,
              resolvedVersion: version,
              integrity: "",
              sourceName: entry.sourceName,
              agents: [],
              installedAt: now,
              updatedAt: now,
            } satisfies SkillLockEntry,
            versionRange: Option.none(),
          });
        }),
      { concurrency: 1 },
    );

    // Add resolved commands as direct entries
    yield* Effect.forEach(
      Object.entries(entry.resolvedCommands),
      ([commandFqn, version]) =>
        Effect.gen(function* () {
          const parsed = parseFqnOrThrow(commandFqn);
          if (parsed.name in currentCommands) return;
          yield* ws.setCommand({
            name: parsed.name,
            lockEntry: {
              type: "registry",
              owner: parsed.owner,
              name: parsed.name,
              resolvedVersion: version,
              // Integrity unknown for individual extensions unpacked from a pack
              integrity: "",
              sourceName: entry.sourceName,
              agents: [],
              installedAt: now,
              updatedAt: now,
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
          const parsed = parseFqnOrThrow(mcpServerFqn);
          if (parsed.name in currentMcpServers) return;
          yield* ws.setMcpServer({
            name: parsed.name,
            lockEntry: {
              type: "registry",
              owner: parsed.owner,
              name: parsed.name,
              resolvedVersion: version,
              // Integrity unknown for individual extensions unpacked from a pack
              integrity: "",
              sourceName: entry.sourceName,
              installedAt: now,
              updatedAt: now,
            } satisfies McpServerLockEntry,
          });
        }),
      { concurrency: 1 },
    );

    // Add resolved subagents as direct entries
    yield* Effect.forEach(
      Object.entries(entry.resolvedSubagents),
      ([subagentFqn, version]) =>
        Effect.gen(function* () {
          const parsed = parseFqnOrThrow(subagentFqn);
          if (parsed.name in currentSubagents) return;
          yield* ws.setSubagent({
            name: parsed.name,
            lockEntry: {
              type: "registry",
              owner: parsed.owner,
              name: parsed.name,
              resolvedVersion: version,
              integrity: "",
              sourceName: entry.sourceName,
              agents: [],
              installedAt: now,
              updatedAt: now,
            } satisfies SubagentLockEntry,
          });
        }),
      { concurrency: 1 },
    );

    // Remove the pack entry from settings and lockfile
    yield* ws.removePack(op.args.name);

    const skillCount = Object.keys(entry.resolvedSkills).length;
    const commandCount = Object.keys(entry.resolvedCommands).length;
    const mcpServerCount = Object.keys(entry.resolvedMcpServers).length;
    const subagentCount = Object.keys(entry.resolvedSubagents).length;
    const totalCount = skillCount + commandCount + mcpServerCount + subagentCount;
    return {
      result: "success",
      message: `Unpacked ${op.args.name}: ${totalCount} extension(s) promoted to direct entries`,
    } satisfies JobStepResult;
  });
