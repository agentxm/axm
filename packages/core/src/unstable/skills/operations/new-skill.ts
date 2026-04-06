/**
 * New skill operation — scaffolds a new skill directory with manifest, SKILL.md,
 * agent symlinks, and settings entry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { getAgentById } from "../../agents/index.js";
import { makeAppError } from "../../app-error/index.js";
import { decodeExtensionNameSync } from "../../extensions/index.js";
import type { Handle } from "../../extensions/handle.js";
import { createSymlink } from "../../utils/index.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation } from "../../workspace/plan.js";
import type { JobStepResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { MANIFEST_FILENAME, type SkillManifest } from "../manifest-schema.js";
import { computeSkillPaths } from "../paths.js";
import { decodeExactSemverVersionSync } from "../../version-constraints/version-constraints.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the new-skill operation.
 */
export interface NewSkillOperationArgs {
  /** Skill name (validated, lowercase with hyphens). */
  readonly name: string;
  /** Profile (e.g., "@myorg"). */
  readonly owner: Handle;
  /** Agent IDs to create symlinks for. */
  readonly agents: ReadonlyArray<string>;
}

/**
 * Scaffold a new skill in the workspace.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type NewSkillOperation = Operation<"new-skill", NewSkillOperationArgs>;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeSkillMd = (name: string) =>
  `---
name: ${name}
description: A new skill
---

Describe what this skill does and when to use it.
`;

const INITIAL_SKILL_VERSION = decodeExactSemverVersionSync("0.0.1");

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * New-skill operation handler.
 *
 * 1. Compute paths via computeSkillPaths
 * 2. Check if skill already exists in settings
 * 3. Create skill directory (src/)
 * 4. Write axm-skill.json manifest
 * 5. Write starter SKILL.md
 * 6. Register in settings via ws.setSkillEntry
 * 7. Create agent symlinks (concurrent)
 */
export const newSkill: OperationHandler<
  NewSkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const { name, owner, agents } = op.args;
    const extensionName = decodeExtensionNameSync(name);
    const fqn = `${owner}/skills/${name}`;

    // 1. Check if skill already exists in settings
    const configuredSkills = yield* ws.getConfiguredSkills();
    if (name in configuredSkills) {
      return yield* makeAppError({
        code: "SKILL_ALREADY_EXISTS",
        what: `Skill '${name}' already exists in settings`,
        howToFix: "Choose a different name or remove the existing skill first",
      });
    }

    // 2. Compute paths
    const { canonicalPath, skillSrcPath } = computeSkillPaths(
      path.join,
      base,
      { refType: "registry", owner },
      name,
    );

    // 3. Create skill directory (src/ implies canonicalPath is also created)
    yield* fs.makeDirectory(skillSrcPath, { recursive: true }).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "SKILL_CREATE_FAILED",
          what: `Failed to create skill directory: ${skillSrcPath}`,
          cause: e,
        }),
      ),
    );

    // 4. Write manifest
    const manifest: SkillManifest = {
      owner,
      type: "skill",
      name: decodeExtensionNameSync(name),
      version: INITIAL_SKILL_VERSION,
    };

    yield* fs
      .writeFileString(
        path.join(canonicalPath, MANIFEST_FILENAME),
        JSON.stringify(manifest, null, 2) + "\n",
      )
      .pipe(
        Effect.mapError((e) =>
          makeAppError({
            code: "SKILL_CREATE_FAILED",
            what: `Failed to write skill manifest`,
            cause: e,
          }),
        ),
      );

    // 5. Write starter SKILL.md
    yield* fs.writeFileString(path.join(skillSrcPath, "SKILL.md"), makeSkillMd(name)).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "SKILL_CREATE_FAILED",
          what: `Failed to write SKILL.md`,
          cause: e,
        }),
      ),
    );

    // 6. Register in settings
    yield* ws.setSkillEntry(name, {
      source: fqn,
      enabled: true,
    });

    // 7. Create agent symlinks (concurrent)
    yield* Effect.forEach(
      agents,
      (agentId) =>
        Effect.gen(function* () {
          const maybeAgent = getAgentById(agentId);
          if (Option.isNone(maybeAgent)) return;
          const agent = maybeAgent.value;
          const link = path.join(base, agent.skills.dir, name);
          yield* createSymlink({ target: skillSrcPath, link });
        }),
      { concurrency: "unbounded" },
    );

    const now = new Date();
    yield* ws.setSkillLock({
      name,
      versionConstraint: Option.none(),
      lockEntry: {
        type: "registry",
        owner,
        name: extensionName,
        resolvedVersion: INITIAL_SKILL_VERSION,
        integrity: "",
        sourceName: "local",
        agents,
        installedAt: now,
        updatedAt: now,
      },
    });

    return {
      result: "success",
      message: `Created skill ${fqn}`,
    } satisfies JobStepResult;
  });
