/**
 * Typed failure family for the hook manager and managed hook-group editing.
 * Fields are domain facts; the application error boundary owns rendering,
 * codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type { HookConfigInvalid, HookIoFailed } from "../projection/agent-adapters/index.js";

/**
 * A hook package, binding, or projection input did not validate. `detail`
 * carries the site's fact sentence verbatim.
 */
export class HookDefinitionInvalid extends Data.TaggedError("HookDefinitionInvalid")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** Every failure the hook manager constructs. */
export type HookManagerError = HookDefinitionInvalid | HookConfigInvalid | HookIoFailed;
