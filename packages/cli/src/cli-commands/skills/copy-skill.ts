/**
 * Copy skill executor — copies source files to the managed extensions store
 * and generates an `axm-skill.json` manifest.
 *
 * Pipeline: parse target name → resolve source path → copy files →
 * generate manifest.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import { makeCliError } from "../../cli-error/index.js";
import type { OperationHandler } from "../../workspace/apply-plan.js";
import type { OperationResult } from "../../workspace/plan.js";
import { Workspace } from "../../workspace/service.js";
import { copySkillDirectory } from "./copy-skill-directory.js";
import type { CopySkillOperation } from "./operations.js";
import { REGISTRY_EXTENSIONS_DIR } from "../../extensions/constants.js";
import { MANIFEST_FILENAME } from "./constants.js";
import { stripFileProtocol } from "./fs-helpers.js";
import { parseScopedName } from "./naming.js";

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
 * 1. Parse target name (`@scope/name`)
 * 2. Resolve source path from ref location
 * 3. Copy files to `.axm/extensions/@<scope>/skills/<name>/`
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
    const base = path.dirname(ws.path);

    const { scope, name } = yield* parseScopedName(op.args.targetName);

    // Target path in the managed extensions store
    const targetDir = path.join(base, REGISTRY_EXTENSIONS_DIR, scope, "skills", name);

    // Source path from the ref location (registry/builtin refs don't carry location)
    const { ref } = op.args;
    if (!("location" in ref)) {
      return yield* makeCliError({
        code: "COPY_SKILL_UNSUPPORTED_SOURCE",
        what: `copy-skill does not support ${ref.source.type} sources`,
      });
    }
    const sourcePath = stripFileProtocol(ref.location);

    // Copy source files to src/ subdirectory (manifest stays at extension root)
    yield* copySkillDirectory(sourcePath, path.join(targetDir, "src")).pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "COPY_SKILL_FAILED",
          what: `Failed to copy skill files to ${targetDir}`,
          cause: e,
        }),
      ),
    );

    // Generate axm-skill.json manifest
    const manifest = {
      name: op.args.targetName,
      version: DEFAULT_VERSION,
      dependencies: {},
    };

    const manifestPath = path.join(targetDir, MANIFEST_FILENAME);
    yield* fs.writeFileString(manifestPath, JSON.stringify(manifest, null, 2) + "\n").pipe(
      Effect.mapError((e) =>
        makeCliError({
          code: "COPY_SKILL_MANIFEST_WRITE_FAILED",
          what: `Failed to write manifest: ${manifestPath}`,
          cause: e,
        }),
      ),
    );

    return {
      result: "success",
      message: `Copied ${name} to ${op.args.targetName}`,
    } satisfies OperationResult;
  });
