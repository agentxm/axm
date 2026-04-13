import * as Effect from "effect/Effect";
import {
  detectSettingsEntryBlockers,
  type SettingsEntryBlocker,
} from "../../settings-validation/index.js";
import { defineCheck, type DiagnosticDef } from "../check-def.js";
import { CHECK_IDS, type Finding } from "../types.js";

type SettingsValidationDiagnostic = DiagnosticDef<ReadonlyArray<SettingsEntryBlocker>, never>;

const settingsValidationDiagnostic: SettingsValidationDiagnostic = {
  id: "settings-validation.blockers",
  run: (blockers) =>
    Effect.succeed(
      blockers.map(
        (blocker): Finding => ({
          id: `settings-validation.${blocker.reason}`,
          severity: "error",
          message: blocker.message,
          subject: blocker.subject,
          action: {
            label: "Fix settings",
            description: blocker.hint,
          },
        }),
      ),
    ),
};

export const settingsValidationCheck = defineCheck({
  id: CHECK_IDS.settingsValidation,
  title: "Settings entries resolve",
  description: "Verifies configured extension entries resolve to a single extension source.",
  dependsOn: [CHECK_IDS.workspaceReady],
  prepareContext: detectSettingsEntryBlockers(),
  diagnostics: [settingsValidationDiagnostic],
});
