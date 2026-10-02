/**
 * Pack member resolution from already accepted state.
 *
 * Recovering an accepted Pack must not re-select its members: every member
 * ref comes from the accepted resolution recorded for that member's
 * configured name. A member without a row falls through to first resolution
 * under the Pack source authority and effective constraints. That is resolution authority, so the resolver is built here and
 * the application only chooses when to use it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
} from "../workspace-state/index.js";
import type { AcceptedCanonicalRefError } from "../workspace-state/index.js";

import type { ExtensionResolutionFailed } from "./errors.js";
import { acceptedConfiguredResolution } from "./accepted-configured-entry.js";
import type { SourceHostProviders } from "../sources/index.js";
import type { PackDependencyRefResolver } from "./pack-dependency-resolution.js";

/**
 * Resolve every Pack member from the accepted resolution recorded for its
 * configured name, allowing normal first resolution when a member has none.
 */
export const acceptedPackDependencyResolver =
  (): PackDependencyRefResolver<
    AcceptedCanonicalRefError | ExtensionResolutionFailed,
    | WorkspaceLocation
    | SettingsReader
    | LockfileReader
    | DesiredStateReader
    | SourceHostProviders
    | Scope.Scope
    | FileSystem.FileSystem
    | Path.Path
  > =>
  ({ type, name }) =>
    acceptedConfiguredResolution({ type, name }).pipe(Effect.map(Option.map(({ ref }) => ref)));
