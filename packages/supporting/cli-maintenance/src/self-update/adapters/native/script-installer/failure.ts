import type * as PlatformError from "effect/PlatformError";
import { UpgradeFailed } from "../../../application/errors.js";

/** Keep host categories without copying foreign descriptions or file contents. */
export const nativeUpgradeFailure = (
  step: string,
  cause: PlatformError.PlatformError,
  backupPath?: string,
) =>
  new UpgradeFailed({
    category: "internal",
    step,
    detail: `The AXM upgrade could not complete ${step}.${backupPath === undefined ? "" : ` Recoverable backup: ${backupPath}`}`,
    suggestions: [{ description: "Check install-directory permissions and retry." }],
    cause: { _tag: cause._tag, reason: cause.reason._tag, method: cause.reason.method },
    ...(backupPath === undefined ? {} : { backupPath }),
  });
