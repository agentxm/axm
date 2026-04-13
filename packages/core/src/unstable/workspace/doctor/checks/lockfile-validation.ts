import * as Effect from "effect/Effect";
import { detectLockfileBlockers, type LockfileBlocker } from "../../settings-validation/index.js";
import { defineCheck, type DiagnosticDef } from "../check-def.js";
import { CHECK_IDS, type Finding } from "../types.js";

type LockfileValidationDiagnostic = DiagnosticDef<ReadonlyArray<LockfileBlocker>, never>;

const lockfileValidationDiagnostic: LockfileValidationDiagnostic = {
  id: "lockfile-validation.blockers",
  run: (blockers) =>
    Effect.succeed(
      blockers.map(
        (blocker): Finding => ({
          id: `lockfile-validation.${blocker.reason}`,
          severity: "warn",
          message: blocker.message,
          subject: blocker.subject,
          action: {
            label: "Sync lockfile",
            description: blocker.hint,
          },
        }),
      ),
    ),
};

export const lockfileValidationCheck = defineCheck({
  id: CHECK_IDS.lockfileValidation,
  title: "Lockfile entries match settings",
  description: "Verifies lockfile entries are present, current, and not orphaned.",
  dependsOn: [CHECK_IDS.workspaceReady],
  prepareContext: detectLockfileBlockers(),
  diagnostics: [lockfileValidationDiagnostic],
});
