/**
 * Unpack extension pack operation handler.
 *
 * Flattens an extension pack's resolved extensions into settings.json as direct entries,
 * preserves existing direct entries, and removes the extension pack entry from settings
 * and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import type { SkillLockEntry, CommandLockEntry, McpServerLockEntry } from "../../lockfile/index.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/index.js";
import { parseFqn } from "../../extensions/index.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Args for the unpack extension pack operation.
 */
export type UnpackExtensionPackOperationArgs = {
  /** Pack FQN to unpack. */
  readonly name: string;
};

/**
 * Unpack an extension pack into direct settings entries.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type UnpackExtensionPackOperation = Operation<
  "unpack-pack",
  UnpackExtensionPackOperationArgs
>;

// -----------------------------------------------------------------------------
// Operation Handler
// -----------------------------------------------------------------------------

/**
 * Unpack operation handler.
 *
 * 1. Look up extension pack in lockfile for resolved extensions
 * 2. Read current settings to find existing direct skill entries
 * 3. Add resolved skills as direct entries (skip existing)
 * 4. Remove extension extension pack from settings and lockfile
 */
export const unpackExtensionPack: OperationHandler<
  UnpackExtensionPackOperation,
  WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;

    // Look up the extension pack in the lockfile
    const lockedPack = yield* ws.getLockedExtensionPack(op.args.name);

    if (Option.isNone(lockedPack)) {
      return yield* makeAppError({
        code: "internal",
        message: `Extension pack "${op.args.name}" is not installed`,
        breadcrumbs: [
          {
            task: "Recover",
            description: "Install the extension pack first with `axm packs install`.",
          },
        ],
      });
    }

    const entry = lockedPack.value;

    if (entry.type !== "registry") {
      return yield* makeAppError({
        code: "internal",
        message: `Cannot unpack "${op.args.name}" — only registry extension packs can be unpacked`,
      });
    }

    const now = new Date();

    // Read current configured extensions to preserve existing direct entries
    const currentSkills = yield* ws.records.getConfiguredSkills();
    const currentCommands = yield* ws.records.getConfiguredCommands();
    const currentMcpServers = yield* ws.records.getConfiguredMcpServers();

    // Add resolved skills as direct entries (only if not already present)
    // Use the short name from the FQN as the settings key since SkillsMapSchema
    // validates keys against agentskills.io naming (no @ or / allowed).
    // Integrity unknown for individual extensions unpacked from a pack
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
              owner: parsed.owner,
              name: parsed.name,
              resolvedVersion: version,
              integrity: "",
              sourceName: entry.sourceName,
              agents: [],
              installedAt: now,
              updatedAt: now,
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
          const parsed = yield* parseFqn(mcpServerFqn);
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

    // Remove the extension pack entry from settings and lockfile
    yield* ws.removeExtensionPack(op.args.name);

    const skillCount = Object.keys(entry.resolvedSkills).length;
    const commandCount = Object.keys(entry.resolvedCommands).length;
    const mcpServerCount = Object.keys(entry.resolvedMcpServers).length;
    const totalCount = skillCount + commandCount + mcpServerCount;
    return {
      result: "success",
      message: `Unpacked ${op.args.name}: ${totalCount} extension(s) promoted to direct entries`,
    } satisfies JobStepResult;
  });
