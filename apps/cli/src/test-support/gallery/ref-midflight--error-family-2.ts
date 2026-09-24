import { ScaffoldNameInvalid } from "@agentxm/workspace/authoring";

import { appErrorDoc, makeAppError } from "../../app-error/index.js";
import { failureToAppError, toAppError } from "../../app-error/conversions.js";
import type { Doc } from "../../screen/doc.js";

/**
 * The error family, part 2 (*Reference cases*, board `4 · Going wrong
 * mid-flight`, frame *The error family, part 2 — validation lists its fields;
 * a defect asks for a report*).
 *
 * A validation failure lists the input it rejected as a field instead of
 * restating it in a sentence; a usage problem points at help; and a defect
 * reads as an internal problem whose recovery is the report link.
 */
export const refMidflightErrorFamily2: Doc = [
  ...appErrorDoc(
    toAppError(
      new ScaffoldNameInvalid({
        subject: "skill",
        name: "Code Review!",
        pattern: "^[a-z0-9][a-z0-9-]*$",
        maxLength: 64,
      }),
    ),
  ),
  { _tag: "blank" },
  ...appErrorDoc(
    makeAppError({
      code: "usage",
      title: "Unrecognized flag --staged",
      detail: "Unrecognized flag --staged",
      recover: "See the flags the command takes",
      cmd: "axm list --help",
    }),
  ),
  { _tag: "blank" },
  ...appErrorDoc(
    failureToAppError(new Error("Cannot read properties of undefined (reading 'agents')")),
  ),
];
