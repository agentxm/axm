/**
 * Copy skill executor — copies source files to the managed extensions store
 * and generates an `axm-skill.json` manifest.
 *
 * Pipeline: parse target name → resolve source path → copy files →
 * generate manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { makeAppError } from "../../app-error/index.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { Operation } from "../../workspace/plan.js";
import type { JobStepResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service-interface.js";
import { copyExtensionDirectory } from "../../extensions/utils.js";
import { REGISTRY_EXTENSIONS_DIR, parseFqn } from "../../extensions/index.js";
import type { SkillExtensionRef } from "../refs.js";
import { MANIFEST_FILENAME } from "../manifest-schema.js";
import { stripFileProtocol } from "../../utils/index.js";

// -----------------------------------------------------------------------------
// Operation types
// -----------------------------------------------------------------------------

/**
 * Args for the copy-skill operation.
 *
 * Copies source files to `.axm/extensions/@<owner>/skills/<name>/`
 * and generates an `axm-skill.json` manifest.
 */
export type CopySkillOperationArgs = {
  /** The skill extension ref carrying source and location. */
  readonly ref: SkillExtensionRef;
  /** Target identity in `@owner/name` format. */
  readonly targetName: string;
};

/**
 * Copy a skill into a managed extension.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type CopySkillOperation = Operation<"copy-skill", CopySkillOperationArgs>;

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_VERSION = "0.1.0";

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Copy-skill operation handler.
 *
 * 1. Parse target name (`@owner/name`)
 * 2. Resolve source path from ref location
 * 3. Copy files to `.axm/extensions/@<owner>/skills/<name>/`
 * 4. Generate `axm-skill.json` manifest with defaults
 */
export const copySkill: OperationHandler<
  CopySkillOperation,
  FileSystem.FileSystem | Path.Path | Workspace
> = (op) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const ws = yield* Workspace;
    const base = ws.baseDir;

    const fqn = yield* parseFqn(op.args.targetName);

    // Target path in the managed extensions store
    const targetDir = path.join(base, REGISTRY_EXTENSIONS_DIR, fqn.owner, "skills", fqn.name);

    // Source path from the ref location (registry refs don't carry location)
    const { ref } = op.args;
    if (ref.refType !== "git-hosted" && ref.refType !== "local") {
      return yield* makeAppError({
        code: "COPY_SKILL_UNSUPPORTED_SOURCE",
        what: `copy-skill does not support ${ref.source.type} sources`,
      });
    }
    const sourcePath = stripFileProtocol(ref.location);

    // Copy source files to src/ subdirectory (manifest stays at extension root)
    yield* copyExtensionDirectory(sourcePath, path.join(targetDir, "src")).pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "COPY_SKILL_FAILED",
          what: `Failed to copy skill files to ${targetDir}`,
          cause: e,
        }),
      ),
    );

    // Generate axm-skill.json manifest
    const manifest = {
      owner: fqn.owner,
      type: "skill",
      name: fqn.name,
      version: DEFAULT_VERSION,
    };

    const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
    yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeAppError({
          code: "COPY_SKILL_MANIFEST_WRITE_FAILED",
          what: `Failed to write manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    return {
      result: "success",
      message: `Copied ${fqn.name} to ${op.args.targetName}`,
    } satisfies JobStepResult;
  });
