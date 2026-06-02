/**
 * Compatibility re-export for files managed-region helpers.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  commentStyleForTarget,
  parseRegionMarker,
  replaceManagedRegion,
  serializeRegionMarker,
  stripManagedRegion,
  type FileCommentStyle,
  type FileRegionMarker,
  type FileRegionMarkerIdentity,
  type FileRegionMarkerKind,
  type ReplaceManagedRegionArgs,
} from "../managed-files/index.js";
