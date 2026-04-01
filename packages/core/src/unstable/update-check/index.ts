/**
 * Update check module for cached version checks and notifications.
 *
 * Manages a local cache of the latest known CLI version and produces
 * install-method-aware update notification messages.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type { SkipCheckContext, UpdateCheckCache, UpdateCheckService } from "./update-check.js";
export {
  UpdateCheck,
  UpdateCheckCacheSchema,
  UpdateCheckLive,
  UpdateCheckTest,
  isCacheStale,
  isUpdateAvailableFromPath,
  notificationMessage,
  readCacheFromPath,
  shouldSkip,
  writeCacheToPath,
} from "./update-check.js";
