/**
 * Builtin pack materialization.
 *
 * Copies bundled skill files to canonical workspace locations, creates
 * agent symlinks, and writes lock entries. No-op if the builtin pack
 * is already in the lockfile.
 *
 * @internal
 */

import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { getAgentById } from "../agents/index.js";
import {
  BUILTIN_PACK_FQN,
  BUILTIN_PACK_NAME,
  BUILTIN_PACK_SCOPE,
  resolveBuiltinPack,
} from "../builtin-pack/index.js";
import { copySkillDirectory } from "../extensions/skills/operations/copy-directory.js";
import { readLockfile, writeLockfile } from "../lockfile/index.js";
import { createSymlink } from "../utils/create-symlink.js";

/**
 * Materialize builtin pack skills into the workspace.
 *
 * Copies bundled skill files to canonical locations, creates agent symlinks,
 * and writes lock entries. No-op if the builtin pack is already in the lockfile.
 */
export const materializeBuiltinPack = (workspaceDir: string, agentIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    // Check if already materialized
    const existingLockfile = yield* readLockfile(workspaceDir);
    const existingPacks = existingLockfile.packs ?? {};
    if (BUILTIN_PACK_FQN in existingPacks) {
      return;
    }

    // Resolve builtin pack
    const builtinPack = yield* resolveBuiltinPack();
    const base = path.dirname(workspaceDir);
    const now = new Date();

    // Get skill entries from manifest
    const skillEntries = Object.entries(builtinPack.manifest.skills ?? {});

    // Copy each skill to canonical location and create agent symlinks
    yield* Effect.forEach(
      skillEntries,
      ([fqn, version]) =>
        Effect.gen(function* () {
          // Extract skill name from FQN (@axm/skills/axm-manage-skills -> axm-manage-skills)
          const skillName = fqn.split("/")[2]!;

          // Source: bundled skill directory
          const sourceDir = path.join(builtinPack.skillsDir, skillName);

          // Canonical destination: .axm/extensions/@axm/skills/<name>/
          const canonicalDir = path.join(
            workspaceDir,
            "extensions",
            BUILTIN_PACK_SCOPE,
            "skills",
            skillName,
          );

          // Copy skill files to canonical location
          yield* copySkillDirectory(sourceDir, canonicalDir);

          // Create symlinks for each agent
          yield* Effect.forEach(
            agentIds,
            (agentId) =>
              Effect.gen(function* () {
                const maybeAgent = getAgentById(agentId);
                if (Option.isNone(maybeAgent)) return;
                const agent = maybeAgent.value;
                const agentSkillPath = path.join(base, agent.skills.dir, skillName);
                yield* createSymlink({ target: canonicalDir, link: agentSkillPath });
              }),
            { concurrency: "unbounded" },
          );
          void version;
        }),
      { concurrency: "unbounded" },
    );

    // Build skill lock entries
    const skillLockEntries: Record<
      string,
      { type: "builtin"; agents: string[]; installedAt: Date; updatedAt: Date }
    > = {};
    for (const [fqn] of skillEntries) {
      const skillName = fqn.split("/")[2]!;
      skillLockEntries[skillName] = {
        type: "builtin" as const,
        agents: [...agentIds],
        installedAt: now,
        updatedAt: now,
      };
    }

    const packLockEntry = {
      type: "builtin" as const,
      namespace: BUILTIN_PACK_SCOPE,
      name: BUILTIN_PACK_NAME,
      resolvedVersion: builtinPack.version,
      installedAt: now,
      updatedAt: now,
      resolvedSkills: Object.fromEntries(skillEntries.map(([fqn, ver]) => [fqn, ver])),
      resolvedCommands: {} as Record<string, string>,
      resolvedMcpServers: {} as Record<string, string>,
    };

    // Write updated lockfile
    const currentLockfile = yield* readLockfile(workspaceDir);
    const updatedLockfile = {
      ...currentLockfile,
      skills: {
        ...currentLockfile.skills,
        ...skillLockEntries,
      },
      packs: {
        ...(currentLockfile.packs ?? {}),
        [BUILTIN_PACK_FQN]: packLockEntry,
      },
    };
    yield* writeLockfile(workspaceDir, updatedLockfile);
  }).pipe(Effect.catch(() => Effect.void));
