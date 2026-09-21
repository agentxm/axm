/**
 * Pack member resolution from already accepted state.
 *
 * Recovering an accepted Pack must not re-select its members: every member
 * ref comes from the accepted resolution recorded for that member's
 * configured name, and a member without one is a conflict rather than a new
 * selection. That is resolution authority, so the resolver is built here and
 * the application only chooses when to use it.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import {
  acceptedLockedResolutionRef,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
} from "../desired-state/index.js";
import type { AcceptedCanonicalRefError } from "../desired-state/index.js";

import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";

import { ExtensionResolutionFailed } from "./errors.js";
import type { PackDependencyRefResolver } from "./pack-dependency-resolution.js";

/**
 * Resolve every Pack member from the accepted resolution recorded for its
 * configured name, refusing the recovery when a member has none.
 */
export const acceptedPackDependencyResolver =
  (): PackDependencyRefResolver<
    AcceptedCanonicalRefError | ExtensionResolutionFailed,
    WorkspaceLocation | SettingsReader | LockfileReader | FileSystem.FileSystem | Path.Path
  > =>
  ({ owner, type, name, root }) =>
    Effect.gen(function* () {
      const accepted = yield* acceptedLockedResolutionRef({ type, name });
      if (Option.isNone(accepted)) {
        // Restoration replays accepted state exactly. With no accepted row for
        // this member there is nothing to replay, and choosing a version here
        // would silently turn a restore into a new selection. Name the Pack,
        // the member, and the route that is allowed to choose instead.
        const packName = parseExtensionFqnParts(root)?.name;
        return yield* new ExtensionResolutionFailed({
          category: "conflict",
          detail: `Accepted Pack recovery for ${root} has no accepted ${type} resolution for ${owner}/${name}`,
          recover:
            "Restoring a Pack replays its accepted member resolutions and never selects a new one. Restore the accepted resolution file, or update the Pack explicitly to select new accepted state within its declared intent.",
          ...(packName === undefined ? {} : { cmd: `axm packs update ${packName}` }),
        });
      }
      return accepted.value;
    });
