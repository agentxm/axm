import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { parseRegistrySourceRef } from "../../extensions/index.js";
import type {
  CommandsLockMap,
  ExtensionPacksLockMap,
  McpServersLockMap,
  SkillsLockMap,
  SubagentsLockMap,
} from "../../lockfile/index.js";
import { readSettingsOrDefault } from "../../settings/index.js";
import { Workspace } from "../service-interface.js";
import type { LockfileBlocker, LockfileBlockerReason } from "./types.js";

/**
 * Build a blocker with consistent structure.
 */
const makeBlocker = (
  reason: LockfileBlockerReason,
  extensionType: string,
  name: string,
  message: string,
  hint: string,
): LockfileBlocker => ({
  reason,
  subject: { kind: "extension", ref: `${extensionType}:${name}` },
  message,
  hint,
});

const emptyLockMaps: {
  readonly skills: SkillsLockMap;
  readonly commands: CommandsLockMap;
  readonly subagents: SubagentsLockMap;
  readonly mcpServers: McpServersLockMap;
  readonly packs: ExtensionPacksLockMap;
} = {
  skills: {},
  commands: {},
  subagents: {},
  mcpServers: {},
  packs: {},
};

const noBlockers: ReadonlyArray<LockfileBlocker> = [];

/**
 * Detect lockfile blockers by comparing settings entries against lockfile entries.
 *
 * This function uses only local data (settings and lockfile). It does NOT
 * call `resolveSource` or contact remote source hosts.
 *
 * For each extension type, it checks:
 * - Missing entries: configured in settings but absent from lockfile
 * - Stale entries: present in both but owner/name metadata has diverged
 * - Orphaned entries: present in lockfile but absent from settings
 */
export const detectLockfileBlockers = () =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settings = yield* readSettingsOrDefault(ws.path).pipe(
      Effect.provideService(Path.Path, path),
      Effect.provideService(FileSystem.FileSystem, fs),
    );

    const lockfileState = yield* ws
      .getLockfileState()
      .pipe(Effect.orElseSucceed((): "invalid" => "invalid"));

    if (lockfileState !== "ok") {
      return noBlockers;
    }

    const locked = yield* Effect.all(
      {
        skills: ws.getLockedSkills(),
        commands: ws.getLockedCommands(),
        subagents: ws.getLockedSubagents(),
        mcpServers: ws.getLockedMcpServers(),
        packs: ws.getLockedExtensionPacks(),
      },
      { concurrency: "unbounded" },
    ).pipe(Effect.orElseSucceed(() => emptyLockMaps));

    // --- Skills ---
    const sk = settings.skills ?? {};
    const skillBlockers = [
      ...Object.keys(sk).flatMap((name) => {
        const entry = sk[name];
        if (entry === undefined) return [];
        const lockEntry = locked.skills[name];
        if (lockEntry === undefined) {
          return [
            makeBlocker(
              "lockfile-entry-missing",
              "skill",
              name,
              `The skill "${name}" is configured but has no lockfile entry.`,
              `Run \`axm install\` to sync "${name}" to the lockfile.`,
            ),
          ];
        }
        const parsed = parseRegistrySourceRef(entry.source);
        if (
          parsed !== undefined &&
          lockEntry.type === "registry" &&
          (lockEntry.owner !== parsed.owner || lockEntry.name !== parsed.name)
        ) {
          return [
            makeBlocker(
              "lockfile-entry-stale",
              "skill",
              name,
              `The skill "${name}" has a stale lockfile entry (source changed).`,
              `Run \`axm install\` to update "${name}" in the lockfile.`,
            ),
          ];
        }
        if (lockEntry.type === "local" && lockEntry.path !== entry.source) {
          return [
            makeBlocker(
              "lockfile-entry-stale",
              "skill",
              name,
              `The skill "${name}" has a stale lockfile entry (source changed).`,
              `Run \`axm install\` to update "${name}" in the lockfile.`,
            ),
          ];
        }
        return [];
      }),
      ...Object.keys(locked.skills)
        .filter((name) => !Object.hasOwn(sk, name))
        .map((name) =>
          makeBlocker(
            "lockfile-entry-orphaned",
            "skill",
            name,
            `The skill "${name}" is in the lockfile but not in settings.`,
            `Run \`axm install\` to clean up orphaned entries, or add "${name}" back to settings.`,
          ),
        ),
    ];

    // --- Commands ---
    const cmd = settings.commands ?? {};
    const commandBlockers = [
      ...Object.keys(cmd).flatMap((name) => {
        const entry = cmd[name];
        if (entry === undefined) return [];
        const lockEntry = locked.commands[name];
        if (lockEntry === undefined) {
          return [
            makeBlocker(
              "lockfile-entry-missing",
              "command",
              name,
              `The command "${name}" is configured but has no lockfile entry.`,
              `Run \`axm install\` to sync "${name}" to the lockfile.`,
            ),
          ];
        }
        const parsed = parseRegistrySourceRef(entry.source);
        if (
          parsed !== undefined &&
          lockEntry.type === "registry" &&
          (lockEntry.owner !== parsed.owner || lockEntry.name !== parsed.name)
        ) {
          return [
            makeBlocker(
              "lockfile-entry-stale",
              "command",
              name,
              `The command "${name}" has a stale lockfile entry (source changed).`,
              `Run \`axm install\` to update "${name}" in the lockfile.`,
            ),
          ];
        }
        return [];
      }),
      ...Object.keys(locked.commands)
        .filter((name) => !Object.hasOwn(cmd, name))
        .map((name) =>
          makeBlocker(
            "lockfile-entry-orphaned",
            "command",
            name,
            `The command "${name}" is in the lockfile but not in settings.`,
            `Run \`axm install\` to clean up orphaned entries, or add "${name}" back to settings.`,
          ),
        ),
    ];

    // --- Subagents ---
    const sub = settings.subagents ?? {};
    const subagentBlockers = [
      ...Object.keys(sub).flatMap((name) => {
        const entry = sub[name];
        if (entry === undefined) return [];
        const lockEntry = locked.subagents[name];
        if (lockEntry === undefined) {
          return [
            makeBlocker(
              "lockfile-entry-missing",
              "subagent",
              name,
              `The subagent "${name}" is configured but has no lockfile entry.`,
              `Run \`axm install\` to sync "${name}" to the lockfile.`,
            ),
          ];
        }
        const parsed = parseRegistrySourceRef(entry.source);
        if (
          parsed !== undefined &&
          lockEntry.type === "registry" &&
          (lockEntry.owner !== parsed.owner || lockEntry.name !== parsed.name)
        ) {
          return [
            makeBlocker(
              "lockfile-entry-stale",
              "subagent",
              name,
              `The subagent "${name}" has a stale lockfile entry (source changed).`,
              `Run \`axm install\` to update "${name}" in the lockfile.`,
            ),
          ];
        }
        return [];
      }),
      ...Object.keys(locked.subagents)
        .filter((name) => !Object.hasOwn(sub, name))
        .map((name) =>
          makeBlocker(
            "lockfile-entry-orphaned",
            "subagent",
            name,
            `The subagent "${name}" is in the lockfile but not in settings.`,
            `Run \`axm install\` to clean up orphaned entries, or add "${name}" back to settings.`,
          ),
        ),
    ];

    // --- MCP Servers ---
    const mcp = settings.mcpServers ?? {};
    const mcpServerBlockers = [
      ...Object.keys(mcp).flatMap((name) => {
        const entry = mcp[name];
        if (entry === undefined) return [];
        const lockEntry = locked.mcpServers[name];
        if (lockEntry === undefined) {
          return [
            makeBlocker(
              "lockfile-entry-missing",
              "mcp-server",
              name,
              `The MCP server "${name}" is configured but has no lockfile entry.`,
              `Run \`axm install\` to sync "${name}" to the lockfile.`,
            ),
          ];
        }
        const parsed = parseRegistrySourceRef(entry.source);
        if (
          parsed !== undefined &&
          lockEntry.type === "registry" &&
          (lockEntry.owner !== parsed.owner || lockEntry.name !== parsed.name)
        ) {
          return [
            makeBlocker(
              "lockfile-entry-stale",
              "mcp-server",
              name,
              `The MCP server "${name}" has a stale lockfile entry (source changed).`,
              `Run \`axm install\` to update "${name}" in the lockfile.`,
            ),
          ];
        }
        return [];
      }),
      ...Object.keys(locked.mcpServers)
        .filter((name) => !Object.hasOwn(mcp, name))
        .map((name) =>
          makeBlocker(
            "lockfile-entry-orphaned",
            "mcp-server",
            name,
            `The MCP server "${name}" is in the lockfile but not in settings.`,
            `Run \`axm install\` to clean up orphaned entries, or add "${name}" back to settings.`,
          ),
        ),
    ];

    // --- Extension Packs ---
    const pk = settings.packs ?? {};
    const packBlockers = [
      ...Object.keys(pk).flatMap((name) => {
        const entry = pk[name];
        if (entry === undefined) return [];
        const lockEntry = locked.packs[name];
        if (lockEntry === undefined) {
          return [
            makeBlocker(
              "lockfile-entry-missing",
              "pack",
              name,
              `The extension pack "${name}" is configured but has no lockfile entry.`,
              `Run \`axm install\` to sync "${name}" to the lockfile.`,
            ),
          ];
        }
        const parsed = parseRegistrySourceRef(entry.source);
        if (
          parsed !== undefined &&
          lockEntry.type === "registry" &&
          (lockEntry.owner !== parsed.owner || lockEntry.name !== parsed.name)
        ) {
          return [
            makeBlocker(
              "lockfile-entry-stale",
              "pack",
              name,
              `The extension pack "${name}" has a stale lockfile entry (source changed).`,
              `Run \`axm install\` to update "${name}" in the lockfile.`,
            ),
          ];
        }
        return [];
      }),
      ...Object.keys(locked.packs)
        .filter((name) => !Object.hasOwn(pk, name))
        .map((name) =>
          makeBlocker(
            "lockfile-entry-orphaned",
            "pack",
            name,
            `The extension pack "${name}" is in the lockfile but not in settings.`,
            `Run \`axm install\` to clean up orphaned entries, or add "${name}" back to settings.`,
          ),
        ),
    ];

    return [
      ...skillBlockers,
      ...commandBlockers,
      ...subagentBlockers,
      ...mcpServerBlockers,
      ...packBlockers,
    ];
  });
