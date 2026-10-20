/**
 * How the extension-authoring feature refuses a policy step. The producer
 * owns the category choice and user-facing wording; the kernel's
 * `OperationRefused` carries them to the application boundary verbatim under
 * the authoring diagnostic kind.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { refusalOf } from "@agentxm/workspace-kernel/operations";

/** Refuse an authoring policy step with the category, wording, and recovery it decided. */
export const authoringRefused = refusalOf({
  kind: "authoring-failed",
  operation: "workspace.operation",
});
