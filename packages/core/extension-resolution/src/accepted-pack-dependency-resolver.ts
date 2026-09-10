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

import { acceptedLockedResolutionRef, WorkspaceMutations } from "@agentxm/workspace-state";
import type { AcceptedCanonicalRefError } from "@agentxm/workspace-state";

import { ExtensionResolutionFailed } from "./errors.js";
import type { PackDependencyRefResolver } from "./pack-dependency-resolution.js";

/**
 * Resolve every Pack member from the accepted resolution recorded for its
 * configured name, refusing the recovery when a member has none.
 */
export const acceptedPackDependencyResolver =
  (): PackDependencyRefResolver<
    AcceptedCanonicalRefError | ExtensionResolutionFailed,
    WorkspaceMutations | FileSystem.FileSystem | Path.Path
  > =>
  ({ owner, type, name, root }) =>
    Effect.gen(function* () {
      const workspace = yield* WorkspaceMutations;
      const accepted = yield* acceptedLockedResolutionRef({ workspace, type, name });
      if (Option.isNone(accepted)) {
        return yield* new ExtensionResolutionFailed({
          category: "conflict",
          detail: `Accepted Pack recovery for ${root} has no accepted ${type} resolution for ${owner}/${name}`,
        });
      }
      return accepted.value;
    });
