/**
 * Install-pack operation handler.
 *
 * Writes pack metadata to settings and lockfile. The actual pack files
 * are already extracted by the handler before plan execution.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { Log } from "../../../tui/index.js";
import { Workspace } from "../../../workspace/service.js";
import type { OperationHandler } from "../../../workspace/apply-plan.js";
import type { OperationResult } from "../../../workspace/plan.js";
import type { InstallPackOperation } from "../operations.js";

/**
 * Install-pack operation handler.
 *
 * Records the pack in settings (source string) and lockfile (lock entry
 * with resolved extensions). Pack files are already on disk by this point.
 */
export const installPack: OperationHandler<InstallPackOperation, Workspace | Log> = (op) =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    const log = yield* Log;

    const sourceString = `registry:${op.args.scope}/${op.args.packName}@${op.args.resolvedVersion}`;

    yield* ws
      .setPack(op.args.packName, sourceString, {
        type: "registry",
        scope: op.args.scope,
        name: op.args.packName,
        resolvedVersion: op.args.resolvedVersion,
        checksum: op.args.checksum,
        sourceName: op.args.sourceName,
        installedAt: new Date(),
        updatedAt: new Date(),
        resolvedSkills: { ...op.args.resolvedSkills },
        resolvedCommands: { ...op.args.resolvedCommands },
        resolvedMcpServers: { ...op.args.resolvedMcpServers },
      })
      .pipe(Effect.catchAll((e) => log.warn(`Pack metadata update failed: ${String(e)}`)));

    return {
      result: "success",
      message: `Installed pack ${op.args.packName}`,
    } satisfies OperationResult;
  });
