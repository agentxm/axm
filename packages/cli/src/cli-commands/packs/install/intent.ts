/**
 * Pack install command intent type.
 *
 * Captures the validated inputs needed to build a pack install plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { PackExtensionRef } from "../../../sources/index.js";

export interface InstallPackCommandIntent {
  readonly packToInstall: PackExtensionRef;
  readonly versionConstraint: Option.Option<string>;
}
