/**
 * New skill operation — scaffolds a new skill directory with manifest and SKILL.md.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../app-error/index.js";
import {
  createCanonicalDirectory,
  recoverCanonicalDirectory,
  decodeExtensionNameSync,
  preflightCreateOnly,
} from "../../extensions/index.js";
import type { Handle } from "../../extensions/handle.js";
import type { OperationHandler } from "../../plan/apply-plan.js";
import type { Operation } from "../../plan/plan.js";
import type { JobStepResult } from "../../plan/plan.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { MANIFEST_FILENAME, MANIFEST_SCHEMA_URL, type SkillManifest } from "../manifest-schema.js";
import { decodeVersionSync } from "../../version-constraints/version-constraints.js";

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
  /** Agent IDs selected by the CLI. Install/materialization consumes workspace configuration. */
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
description: Describe when this skill should be triggered by the agent
---

Describe what this skill does and when to use it.
`;

const INITIAL_SKILL_VERSION = decodeVersionSync("0.0.1");

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * New-skill operation handler.
 *
 * 1. Compute paths via computeSkillPaths
 * 2. Check if skill already exists in settings
 * 3. Create skill directory (src/)
 * 4. Write skill.json manifest
 * 5. Write starter SKILL.md
 */
export const newSkill: OperationHandler<
  NewSkillOperation,
  FileSystem.FileSystem | Path.Path | WorkspaceMutations
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* WorkspaceMutations;
    const base = ws.baseDir;
    if (ws.layout.scope !== "project") {
      return yield* makeAppError({
        code: "validation",
        detail: "New skills can only be scaffolded in a project workspace",
      });
    }

    const { name, owner } = op.args;
    const fqn = `${owner}/skills/${name}`;

    const configuredSkills = yield* ws.getConfiguredSkillEntries();
    const canonicalPath = path.join(ws.layout.authoredRoot("skill"), name);
    yield* recoverCanonicalDirectory({ baseDir: base, canonicalPath });
    yield* preflightCreateOnly({
      subject: "Skill",
      name,
      configured: Object.hasOwn(configuredSkills, name),
      destinations: [canonicalPath],
    });

    const manifest: SkillManifest = {
      $schema: MANIFEST_SCHEMA_URL,
      owner,
      type: "skill",
      name: decodeExtensionNameSync(name),
      version: INITIAL_SKILL_VERSION,
    };

    yield* createCanonicalDirectory({
      baseDir: base,
      canonicalPath,
      subject: "Skill",
      requiredFiles: [MANIFEST_FILENAME, "src/SKILL.md"],
      populate: (stagingPath) => {
        const skillSrcPath = path.join(stagingPath, "src");
        return Effect.gen(function* () {
          yield* fs.makeDirectory(skillSrcPath, { recursive: true }).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                detail: `Failed to create skill directory: ${skillSrcPath}`,
                cause: e,
              }),
            ),
          );
          yield* fs
            .writeFileString(
              path.join(stagingPath, MANIFEST_FILENAME),
              JSON.stringify(manifest, null, 2) + "\n",
            )
            .pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "validation",
                  detail: "Skill manifest could not be written",
                  cause: e,
                }),
              ),
            );
          yield* fs.writeFileString(path.join(skillSrcPath, "SKILL.md"), makeSkillMd(name)).pipe(
            Effect.mapError((e) =>
              makeAppError({
                code: "validation",
                detail: "Failed to write SKILL.md",
                cause: e,
              }),
            ),
          );
        });
      },
    });

    return {
      result: "success",
      message: `Created skill ${fqn}`,
    } satisfies JobStepResult;
  });
