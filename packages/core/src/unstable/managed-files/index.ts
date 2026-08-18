/**
 * Shared managed-file helpers.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 */

export {
  commentStyleForTarget,
  managedRegionContent,
  parseRegionMarker,
  replaceManagedRegion,
  serializeRegionMarker,
  stripManagedRegion,
  type FileCommentStyle,
  type FileRegionMarker,
  type FileRegionMarkerIdentity,
  type FileRegionMarkerKind,
  type ReplaceManagedRegionArgs,
} from "./markers.js";
