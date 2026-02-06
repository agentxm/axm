/**
 * Workspace context service types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type { Lockfile, LockfileError } from "../lockfile/index.js";
import type { Settings, SettingsError } from "../settings/index.js";

/**
 * Service interface for workspace context.
 *
 * Provides access to parsed workspace settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContextService {
  /** Whether this is a global workspace (~/.axm) or local (.axm) */
  readonly global: boolean;
  /** Path to the .axm directory */
  readonly path: string;
  /** Read fresh settings from disk. Fails if settings file does not exist. */
  readonly getSettings: () => Effect.Effect<Settings, SettingsError>;
  /** Read fresh lockfile from disk. Fails if lockfile does not exist. */
  readonly getLockfile: () => Effect.Effect<Lockfile, LockfileError>;
}
