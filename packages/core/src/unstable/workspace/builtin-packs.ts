/**
 * Builtin pack materialization.
 *
 * Copies bundled skill files to canonical workspace locations, creates
 * agent symlinks, and writes lock entries. No-op if the builtin pack
 * is already in the lockfile.
 *
 * The resolver function is provided by the CLI package since the bundled
 * skill assets live in the CLI distribution.
 *
 * @internal
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { AppError } from "../app-error/index.js";

import { getAgentById } from "../agents/index.js";
import { makeAppError } from "../app-error/index.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import {
  makeBuiltinPackLockEntry,
  readLockfile,
  type ResolvedExtensionMap,
  writeLockfile,
} from "../lockfile/index.js";
import { createSymlink } from "../utils/index.js";
import type { PackManifest } from "../packs/manifest-schema.js";
import {
  decodeExactSemverVersionSync,
  type ExactSemverVersion,
} from "../version-constraints/version-constraints.js";
import { unsafeHandle } from "../extensions/handle.js";

/**
 * Resolved builtin pack data — provided by the CLI package.
 */
export interface ResolvedBuiltinPack {
  readonly manifest: PackManifest;
  readonly version: ExactSemverVersion;
  readonly skillsDir: string;
}

/**
 * Builtin pack identity constants.
 */
export const BUILTIN_PACK_FQN = "@axm/packs/cli";
export const BUILTIN_PACK_SCOPE = unsafeHandle("@axm");
export const BUILTIN_PACK_NAME = "cli";

const getSkillNameFromFqn = (fqn: string): Option.Option<string> => {
  const [, , skillName] = fqn.split("/");
  return Option.fromUndefinedOr(skillName);
};

/**
 * Materialize builtin pack skills into the workspace.
 *
 * Copies bundled skill files to canonical locations, creates agent symlinks,
 * and writes lock entries. No-op if the builtin pack is already in the lockfile.
 *
 * @param workspaceDir - Path to the .axm directory
 * @param agentIds - Agent IDs to create symlinks for
 * @param resolveBuiltinPack - Effect that resolves the bundled builtin pack
 */
export const materializeBuiltinPack = (
  workspaceDir: string,
  agentIds: ReadonlyArray<string>,
  resolveBuiltinPack: Effect.Effect<
    ResolvedBuiltinPack,
    AppError,
    FileSystem.FileSystem | Path.Path
  >,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    // Check if already materialized
    const existingLockfile = yield* readLockfile(workspaceDir);
    const existingPacks = existingLockfile.packs ?? {};
    if (BUILTIN_PACK_FQN in existingPacks) {
      return;
    }

    // Resolve builtin pack
    const builtinPack = yield* resolveBuiltinPack;
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
          const skillName = yield* Option.match(getSkillNameFromFqn(fqn), {
            onNone: () =>
              makeAppError({
                code: "BUILTIN_PACK_INVALID_FQN",
                what: `Builtin pack skill dependency is not a valid FQN: ${fqn}`,
              }),
            onSome: Effect.succeed,
          });

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
          yield* copyExtensionDirectory(sourceDir, canonicalDir);

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
      const skillName = yield* Option.match(getSkillNameFromFqn(fqn), {
        onNone: () =>
          makeAppError({
            code: "BUILTIN_PACK_INVALID_FQN",
            what: `Builtin pack skill dependency is not a valid FQN: ${fqn}`,
          }),
        onSome: Effect.succeed,
      });
      skillLockEntries[skillName] = {
        type: "builtin" as const,
        agents: [...agentIds],
        installedAt: now,
        updatedAt: now,
      };
    }

    const resolvedSkills: ResolvedExtensionMap = Object.fromEntries(
      skillEntries.map(([fqn, version]) => [fqn, decodeExactSemverVersionSync(version)]),
    );
    const packLockEntry = makeBuiltinPackLockEntry({
      owner: BUILTIN_PACK_SCOPE,
      name: BUILTIN_PACK_NAME,
      resolvedVersion: builtinPack.version,
      installedAt: now,
      updatedAt: now,
      resolvedSkills,
      resolvedCommands: {},
      resolvedMcpServers: {},
    });

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
  }).pipe(
    Effect.tapError((e) => Effect.logWarning("Failed to materialize builtin pack", { error: e })),
    Effect.catch(() => Effect.void),
  );
